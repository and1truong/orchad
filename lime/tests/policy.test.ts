import test from "node:test";
import assert from "node:assert/strict";
import { CounterFixture } from "../fixtures/counter.js";
import { HostPolicy, type Approval } from "../src/host/policy.js";
import { runAgentTurn } from "../src/agent-client/mock.js";
import { collectToolArguments } from "../src/agent-client/gateway-adapter.js";
import { dispatcher } from "../src/extension/page-adapter.js";
import {
  CallSchema,
  ContextSchema,
  DescriptionSchema,
  ResultSchema,
  bounded,
  canonical,
} from "../src/shared/contract.js";
const call = (overrides: Record<string, unknown> = {}) => ({
  requestId: "r-1",
  documentId: "demo-document",
  toolName: "demo_increment",
  arguments: { amount: 1 },
  expectedRevision: 0,
  idempotencyKey: "key-1",
  ...overrides,
});
function setup(
  approve:
    ((a: Approval, s: AbortSignal) => Promise<boolean>) | null = async () =>
    true,
) {
  const fixture = new CounterFixture(),
    controller = new AbortController();
  const policy = new HostPolicy(
    fixture,
    {
      clientId: "test",
      sessionId: "s1",
      target: { ...fixture.target },
      sessionEpoch: null,
      reads: new Set(["demo_read"]),
    },
    approve,
    controller.signal,
  );
  return { fixture, policy, controller };
}
test("discover interoperability fixture and context", async () => {
  const { fixture, policy } = setup();
  const d = bounded(DescriptionSchema, await fixture.describe());
  assert.equal(d.appId, "demo-counter");
  assert.equal((await policy.context()).ok, true);
  assert.equal(bounded(ContextSchema, await fixture.getContext()).revision, 0);
});
test("approved write and completed idempotency lookup before stale revision", async () => {
  let approvals = 0;
  const { fixture, policy } = setup(async (a) => {
    approvals++;
    assert.equal(a.call.expectedRevision, 0);
    assert.equal(a.target.documentId, "demo-document");
    return true;
  });
  assert.deepEqual((await policy.call(call())).data, { value: 1, revision: 1 });
  const retry = await policy.call(call({ requestId: "r-2" }));
  assert.deepEqual(retry.data, { value: 1, revision: 1 });
  assert.equal(retry.revision, 1);
  assert.equal(fixture.value, 1);
  assert.equal(approvals, 2);
});
test("denied and absent approver never dispatch", async () => {
  for (const a of [null, async () => false]) {
    const { fixture, policy } = setup(a);
    assert.equal((await policy.call(call())).error?.code, "APPROVAL_DENIED");
    assert.equal(fixture.calls, 0);
    assert.equal(fixture.value, 0);
  }
});
test("stale revision and idempotency conflict", async () => {
  const { policy } = setup();
  await policy.call(call());
  assert.equal(
    (await policy.call(call({ requestId: "r-2", idempotencyKey: "key-2" })))
      .error?.code,
    "STALE_CONTEXT",
  );
  assert.equal(
    (await policy.call(call({ requestId: "r-3", arguments: { amount: 2 } })))
      .error?.code,
    "IDEMPOTENCY_CONFLICT",
  );
});
test("duplicate correlation with altered payload rejected", async () => {
  const { policy, fixture } = setup();
  await policy.call(call());
  assert.equal(
    (await policy.call(call({ arguments: { amount: 2 } }))).error?.code,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(fixture.calls, 1);
});
test("navigation between read and approval/write fails closed", async () => {
  const { policy, fixture } = setup(async () => {
    fixture.navigate();
    return true;
  });
  assert.equal((await policy.context()).ok, true);
  assert.equal((await policy.call(call())).error?.code, "STALE_CONTEXT");
  assert.equal(fixture.calls, 0);
});
test("tab close and consent revoke", async () => {
  const { policy, fixture } = setup();
  fixture.closed = true;
  assert.equal((await policy.call(call())).error?.code, "TARGET_CLOSED");
  const second = setup();
  second.policy.revoke();
  assert.equal((await second.policy.context()).error?.code, "FORBIDDEN");
});
test("malformed schema and smuggled approved field", async () => {
  const { policy, fixture } = setup();
  for (const c of [
    call({ approved: true }),
    call({ arguments: { amount: 1.2 } }),
    call({ expectedRevision: null }),
    call({ toolName: "unknown" }),
  ])
    assert.equal((await policy.call(c)).ok, false);
  assert.equal(fixture.calls, 0);
});
test("oversized output rejected at boundary", async () => {
  const { policy, fixture } = setup();
  fixture.getContext = async () => ({
    appId: "demo-counter",
    documentId: "demo-document",
    revision: 0,
    selectionIds: [],
    summary: "x".repeat(70000),
  });
  assert.equal((await policy.context()).ok, false);
  assert.throws(() =>
    bounded(ResultSchema, {
      ok: true,
      revision: 0,
      data: "x".repeat(70000),
      error: null,
    }),
  );
});
test("partial gateway arguments never execute", async () => {
  async function* incomplete() {
    yield 'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\\"amount\\\":"}}]}}]}\n\n';
  }
  let dispatched = 0;
  await assert.rejects(async () => {
    const args = await collectToolArguments(incomplete());
    dispatched++;
    return args;
  });
  assert.equal(dispatched, 0);
});
test("cancel approval, no replay after reconnect/new session", async () => {
  const { controller, policy, fixture } = setup(
    async () => new Promise(() => {}),
  );
  const pending = policy.call(call());
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  assert.equal((await pending).error?.code, "CANCELLED");
  assert.equal(fixture.calls, 0);
  const next = new HostPolicy(
    fixture,
    {
      clientId: "test",
      sessionId: "new",
      target: fixture.target,
      sessionEpoch: null,
      reads: new Set(),
    },
    null,
    new AbortController().signal,
  );
  assert.equal((await next.call(call())).error?.code, "APPROVAL_DENIED");
});
test("page without bridge returns explicit unsupported marker", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  (globalThis as unknown as { window: { top: unknown } }).window.top = (
    globalThis as unknown as { window: unknown }
  ).window;
  try {
    assert.deepEqual(await dispatcher("describe"), { unsupported: true });
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete (globalThis as unknown as { window?: unknown }).window;
  }
});
test("sidebar mock path uses same policy; events terminal exactly once", async () => {
  const { policy, fixture, controller } = setup();
  const events: string[] = [];
  const result = await runAgentTurn({
    gatewayBaseUrl: "http://127.0.0.1:4311",
    gatewayToken: "",
    model: "mock-counter",
    messages: [{ role: "user", content: '/tool demo_increment {"amount":1}' }],
    tools: (await fixture.describe()).tools as never,
    signal: controller.signal,
    executeTool: (name, args, id) =>
      policy.call(call({ requestId: id, toolName: name, arguments: args })),
    onEvent: (e) => events.push(e.type),
  });
  assert.equal(result.finishReason, "completed");
  assert.equal(fixture.value, 1);
  assert.equal(events.filter((e) => e === "completed").length, 1);
});
test("unconsented or effect-changed reads do not auto-grant", async () => {
  const { fixture } = setup();
  const p = new HostPolicy(
    fixture,
    {
      clientId: "x",
      sessionId: "s",
      target: fixture.target,
      sessionEpoch: null,
      reads: new Set(),
    },
    null,
    new AbortController().signal,
  );
  assert.equal(
    (
      await p.call(
        call({
          toolName: "demo_read",
          arguments: {},
          expectedRevision: null,
          idempotencyKey: null,
        }),
      )
    ).error?.code,
    "FORBIDDEN",
  );
});
test("canonical object keys stable", () =>
  assert.equal(canonical({ z: 2, a: 1 }), canonical({ a: 1, z: 2 })));
test("cancel after dispatch returns unknown outcome without retry", async () => {
  const { policy, fixture, controller } = setup();
  let dispatched: () => void = () => {};
  const began = new Promise<void>((r) => (dispatched = r));
  fixture.invoke = async () => {
    fixture.calls++;
    dispatched();
    return new Promise(() => {});
  };
  const pending = policy.call(call());
  await began;
  controller.abort();
  assert.equal((await pending).error?.code, "INTERNAL");
  assert.equal(fixture.calls, 1);
});
test("app session epoch change revokes consent and fails closed", async () => {
  const fixture = new CounterFixture();
  fixture.rotateSession("epoch-1");
  const ctl = new AbortController();
  const pinned = new HostPolicy(
    fixture,
    {
      clientId: "test",
      sessionId: "s1",
      target: { ...fixture.target },
      sessionEpoch: "epoch-1",
      reads: new Set(["demo_read"]),
    },
    async () => true,
    ctl.signal,
  );
  assert.equal((await pinned.context()).ok, true);
  // A login/logout/account switch or rotation changes the opaque epoch:
  // context is never returned under the old consent again.
  fixture.rotateSession("epoch-2");
  assert.equal((await pinned.context()).error?.code, "STALE_CONTEXT");
  assert.equal((await pinned.context()).error?.code, "FORBIDDEN");
  assert.equal(
    (await pinned.call(call({ toolName: "demo_read", expectedRevision: null, idempotencyKey: null })))
      .error?.code,
    "FORBIDDEN",
  );
  const fresh = new HostPolicy(
    fixture,
    {
      clientId: "test",
      sessionId: "s2",
      target: { ...fixture.target },
      sessionEpoch: "epoch-2",
      reads: new Set(["demo_read"]),
    },
    async () => true,
    new AbortController().signal,
  );
  assert.equal((await fresh.context()).ok, true);
});
test("guava catalog passes the host-safe schema dialect; hostile schemas rejected", async () => {
  const { readFileSync } = await import("node:fs");
  const { hostSafeSchema, validateArguments } = await import(
    "../src/shared/contract.js"
  );
  const catalog = JSON.parse(
    readFileSync(new URL("../../guava/tool-catalog.json", import.meta.url), "utf8"),
  );
  assert.equal(catalog.length, 7);
  for (const tool of catalog)
    assert.equal(hostSafeSchema(tool.inputSchema), true, tool.name);
  for (const schema of [
    { type: "object", properties: { a: { type: "string", pattern: "^(a+)+$" } } },
    { type: "object", $id: "https://evil.example/s", items: { $ref: "#" } },
    { type: "object", patternProperties: { ".*": { type: "string" } } },
    { type: "array", uniqueItems: true },
    { type: "object", oneOf: Array.from({ length: 20 }, () => ({ type: "string" })) },
  ])
    assert.equal(hostSafeSchema(schema), false, JSON.stringify(schema));
  const evil = {
    name: "evil_tool",
    description: "x",
    effect: "read" as const,
    inputSchema: { type: "object", properties: { a: { pattern: "^(a+)+$" } } },
  };
  assert.equal(validateArguments(evil, { a: "a".repeat(64) }), false);
});
