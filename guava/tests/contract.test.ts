import { test } from "node:test";
import assert from "node:assert/strict";
import { HostSimulator } from "../harness/simulator.ts";
import { counterFixture } from "../harness/fixture.ts";
import { autoLayout } from "../src/shared/domain.ts";
import { catalog } from "../src/shared/catalog.ts";
import type { Invoke } from "../src/shared/contract.ts";
const request: Invoke = {
  requestId: "r1",
  documentId: "demo-document",
  toolName: "demo_increment",
  arguments: { amount: 1 },
  expectedRevision: 0,
  idempotencyKey: "key-1",
};
async function setup() {
  const page = counterFixture();
  const host = new HostSimulator("http://127.0.0.1:4310");
  const discovery = await host.discover(page);
  assert.equal(discovery.ok, true);
  host.grantConsent();
  const target = discovery.data.targets[0];
  return {
    page,
    host,
    target,
    dispatch: (call: Invoke, approval?: any) =>
      host.call(target.targetId, target.pageInstanceId, call, approval),
  };
}
test("shared demo_increment fixture: approval, retry, key conflict, stale context, deny without dispatch", async () => {
  const { page, dispatch } = await setup();
  const approved = async () => true;
  const result = await dispatch(request, approved);
  assert.deepEqual(result, {
    ok: true,
    revision: 1,
    data: { value: 1, revision: 1 },
    error: null,
  });
  assert.deepEqual(
    await dispatch({ ...request, requestId: "retry" }, approved),
    result,
  );
  assert.equal(
    (await dispatch({ ...request, arguments: { amount: 2 } }, approved)).error
      ?.code,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    (await dispatch({ ...request, idempotencyKey: "key-2" }, approved)).error
      ?.code,
    "STALE_CONTEXT",
  );
  const before = page.state.invocations;
  assert.equal(
    (
      await dispatch(
        { ...request, idempotencyKey: "denied" },
        async () => false,
      )
    ).error?.code,
    "APPROVAL_DENIED",
  );
  assert.equal(page.state.invocations, before);
  assert.equal(page.state.value, 1);
});
test("unsupported page, consent denied, no approval UI, unknown tool fail closed", async () => {
  const host = new HostSimulator("https://fixture.test");
  assert.equal((await host.discover()).error?.code, "UNSUPPORTED");
  const { page, dispatch, host: h } = await setup();
  assert.equal((await dispatch(request)).error?.code, "APPROVAL_DENIED");
  assert.equal(
    (await dispatch({ ...request, toolName: "arbitrary_js" }, async () => true))
      .error?.code,
    "FORBIDDEN",
  );
  h.revokeConsent();
  assert.equal(
    (await dispatch(request, async () => true)).error?.code,
    "FORBIDDEN",
  );
  assert.equal(page.state.invocations, 0);
});
test("approval binds exact payload; target closure during approval and mutated previews deny", async () => {
  let s = await setup();
  assert.equal(
    (
      await s.dispatch(request, async (p: any) => {
        p.call.arguments.amount = 2;
        return true;
      })
    ).error?.code,
    "APPROVAL_DENIED",
  );
  assert.equal(s.page.state.value, 0);
  s = await setup();
  assert.equal(
    (
      await s.dispatch(request, async () => {
        s.host.close();
        return true;
      })
    ).error?.code,
    "APPROVAL_DENIED",
  );
  assert.equal(s.page.state.invocations, 0);
});
test("selection and document changes: explicit binding, session changes invalidate pin", async () => {
  const page = counterFixture();
  let session = "one";
  const host = new HostSimulator("https://fixture.test", async () => session);
  const d = await host.discover(page);
  host.grantConsent();
  const t = d.data.targets[0];
  session = "two";
  assert.equal(
    (await host.call(t.targetId, t.pageInstanceId, request, async () => true))
      .error?.code,
    "TARGET_CLOSED",
  );
  assert.equal(page.state.value, 0);
  const s = await setup();
  s.page.getContext = async () => ({
    appId: "demo-counter",
    documentId: "different",
    revision: 0,
    selectionIds: [],
    summary: "",
  });
  assert.equal(
    (await s.dispatch(request, async () => true)).error?.code,
    "TARGET_CLOSED",
  );
});
test("catalog descriptor shape and deterministic layout", () => {
  for (const tool of catalog) {
    assert.match(tool.name, /^[a-zA-Z0-9_-]{1,64}$/);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(tool.description.length > 40);
  }
  const graph = {
    nodes: [
      {
        id: "b",
        type: "note" as const,
        label: "B",
        body: "",
        position: { x: 999, y: 3 },
        evidenceIds: [],
      },
      {
        id: "a",
        type: "note" as const,
        label: "A",
        body: "",
        position: { x: 3, y: 999 },
        evidenceIds: [],
      },
    ],
    edges: [],
  };
  assert.deepEqual(autoLayout(autoLayout(graph)), autoLayout(graph));
  assert.deepEqual(
    autoLayout({ ...graph, nodes: [...graph.nodes].reverse() }),
    autoLayout(graph),
  );
});

test("approval expiry and changed target preview never dispatch", async () => {
  const s = await setup();
  const original = Date.now;
  try {
    const result = await s.dispatch(request, async () => {
      Date.now = () => original() + 61_000;
      return true;
    });
    assert.equal(result.error?.code, "APPROVAL_DENIED");
    assert.equal(s.page.state.invocations, 0);
  } finally {
    Date.now = original;
  }
  const altered = await s.dispatch(request, async (p: any) => {
    p.target.documentId = "another-document";
    return true;
  });
  assert.equal(altered.error?.code, "APPROVAL_DENIED");
  assert.equal(s.page.state.invocations, 0);
});

test("portable JSON interoperability scenario matches executable fixture", async () => {
  const { readFileSync } = await import("node:fs");
  const scenario = JSON.parse(
    readFileSync(new URL("../harness/scenario.json", import.meta.url), "utf8"),
  );
  const s = await setup();
  for (const item of scenario.cases) {
    const result = await s.dispatch(
      item.call,
      async () => item.approval === "approve",
    );
    if (item.expected) assert.deepEqual(result, item.expected);
    else assert.equal(result.error?.code, item.expectedError);
    if (item.expectedValue !== undefined)
      assert.equal(s.page.state.value, item.expectedValue);
    if (item.expectedDispatches !== undefined)
      assert.equal(s.page.state.invocations, item.expectedDispatches);
  }
});
test("sessionEpoch rotation invalidates pinned target; fresh discover restores", async () => {
  const page = counterFixture();
  let epoch = "epoch-1";
  const bridge: typeof page = Object.assign(Object.create(Object.getPrototypeOf(page)), page);
  const inner = page.getContext;
  bridge.getContext = async () => ({ ...(await inner()), sessionEpoch: epoch });
  const host = new HostSimulator("http://127.0.0.1:4310");
  const d = await host.discover(bridge);
  assert.equal(d.ok, true);
  host.grantConsent();
  const t = d.data.targets[0];
  assert.equal(t.sessionEpoch, "epoch-1");
  epoch = "epoch-2";
  assert.equal(
    (await host.call(t.targetId, t.pageInstanceId, request, async () => true))
      .error?.code,
    "TARGET_CLOSED",
  );
  assert.equal(page.state.invocations, 0);
  const d2 = await host.discover(bridge);
  host.grantConsent();
  const t2 = d2.data.targets[0];
  assert.equal(t2.sessionEpoch, "epoch-2");
  assert.equal(
    (await host.call(t2.targetId, t2.pageInstanceId, request, async () => true))
      .ok,
    true,
  );
});
