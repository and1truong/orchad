import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import {
  openRunner,
  StorageOwnerConflict,
  IncompatibleStorage,
  type RunStatus,
} from "../src/index.js";
import { fakeHost, demoTool } from "../../../mango/fixtures/demo-counter.js";
import type { OpEnvelope } from "../src/journal.js";
import type { Result } from "@orchard/agent-client";
import { MODEL, fakeGateway, incrCall, tmpDb, until } from "./helpers.js";

const host = () => fakeHost();

/** Map a durable OpEnvelope onto the demo host's invoke() call shape. */
const dispatchFor =
  (h: ReturnType<typeof host>, approved = true) =>
  async (envelope: OpEnvelope): Promise<Result> =>
    h.invoke(
      {
        requestId: envelope.requestId,
        documentId: envelope.targetId,
        toolName: envelope.toolName,
        arguments: envelope.arguments as { amount: number },
        expectedRevision: envelope.expectedRevision,
        idempotencyKey: envelope.idempotencyKey,
      },
      approved,
    );

const binding = (h: ReturnType<typeof host>, idempotent = true) => ({
  targetId: "demo-document",
  revision: () => h.context().revision,
  tools: [demoTool],
  idempotentTools: idempotent ? ["demo_increment"] : [],
});

async function running(script: Parameters<typeof fakeGateway>[0]) {
  const gw = await fakeGateway(script);
  const { db } = tmpDb();
  const runner = await openRunner({ storagePath: db });
  await runner.configure({
    baseUrl: gw.baseUrl,
    token: gw.token,
    model: MODEL,
  });
  return { gw, db, runner };
}

test("submit → tool round-trip → completed; transcript + x_gateway_state persist across reopen", async () => {
  const h = host();
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], continuation: { step: 1 }, usage: { input: 10, output: 5 } },
    { content: "Counter incremented.", usage: { input: 20, output: 5 } },
  ]);
  await runner.bind([binding(h)], dispatchFor(h));
  const seen: string[] = [];
  const unwatch = runner.watch((s: RunStatus) => seen.push(s.phase));

  const { submissionId, requestId } = await runner.submit({
    prompt: "Increment by one",
    requestId: "req-1",
  });
  const status = await until(runner.status, (s) => s.phase === "completed", "completion");
  assert.equal(h.dispatches, 1);
  assert.deepEqual(h.context().summary, "value 1");
  assert.equal(status.ops[0].status, "completed");
  assert.equal(status.ops[0].attempts, 1);

  const t = await runner.transcript();
  assert.deepEqual(
    t.messages.map((m) => m.role),
    ["user", "assistant", "tool", "assistant"],
  );
  const assistant = t.messages[1];
  assert.equal(assistant.role, "assistant");
  assert.ok(assistant.x_gateway_state, "opaque state must persist verbatim");
  assert.equal(assistant.tool_calls?.[0].function.arguments, '{"amount":1}');

  // Same requestId dedups at admission, never double-runs.
  const dup = await runner.submit({ prompt: "Increment by one", requestId });
  assert.equal(dup.submissionId, submissionId);
  await until(runner.status, (s) => s.phase === "completed");
  assert.equal(h.dispatches, 1);

  await runner.close();

  // Reopen the same DB: conversation + ops + transcript survive.
  const reopened = await openRunner({ storagePath: db });
  assert.equal(reopened.conversationId, runner.conversationId);
  const s2 = await reopened.status();
  assert.equal(s2.phase, "completed");
  const t2 = await reopened.transcript();
  assert.deepEqual(t2.messages, t.messages);
  await reopened.close();

  assert.ok(seen.includes("running") || seen.includes("queued"));
  unwatch();
  await gw.close();
});

test("unbound host parks the op; bind wakes it to a single dispatch", async () => {
  const h = host();
  const { gw, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "Done.", usage: { input: 20, output: 5 } },
  ]);
  // Host was bound then went offline before the input lands: the tool stays
  // published (it may come back) but nothing may dispatch.
  await runner.bind([binding(h)], dispatchFor(h));
  runner.unbind();
  await runner.submit({ prompt: "Increment", requestId: "req-park" });
  const parked = await until(
    runner.status,
    (s) => s.ops[0]?.status === "parked",
    "parked op",
  );
  assert.equal(parked.phase, "waiting_for_host");
  assert.equal(h.dispatches, 0);

  await runner.bind([binding(h)], dispatchFor(h));
  const done = await until(runner.status, (s) => s.phase === "completed", "completion");
  assert.equal(h.dispatches, 1);
  assert.equal(done.ops[0].status, "completed");
  await runner.close();
  await gw.close();
});

test("unsafe mutation killed mid-dispatch reconciles to needs_reconciliation, never re-dispatched", async () => {
  const h = host();
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "unreachable", usage: { input: 20, output: 5 } },
  ]);
  // NOT in idempotentTools → replay 'unsafe' → pi never re-runs execute.
  await runner.bind([binding(h, false)], async () => new Promise<Result>(() => {}));
  await runner.submit({ prompt: "Increment", requestId: "req-crash" });
  const dispatched = await until(
    runner.status,
    (s) => s.ops[0]?.status === "dispatched",
    "dispatched mark",
  );
  assert.equal(dispatched.ops[0].attempts, 1);

  // Simulate process death: the lockfile disappears but the op stays
  // 'dispatched' with no committed result.
  rmSync(`${db}.owner`, { force: true });
  const r2 = await openRunner({ storagePath: db });
  await r2.resume();
  const status = await until(
    r2.reconcile.bind(r2),
    (s) => s.ops[0]?.status === "interrupted" || s.ops[0]?.status === "ambiguous",
    "reconcile",
  );
  assert.equal(status.phase, "needs_reconciliation");

  // Human/host verdict closes the op; generation shows the interruption.
  await r2.resolveOp(dispatched.ops[0].opId, {
    status: "failed",
    error: "Host reported the write never applied",
  });
  const final = await r2.status();
  assert.equal(final.ops[0].status, "failed");
  await r2.close();
  await gw.close();
});

test("idempotent mutation re-entered after crash: revalidated + same key+envelope, one host effect", async () => {
  const h = host();
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "Done.", usage: { input: 20, output: 5 } },
  ]);
  const seen1: OpEnvelope[] = [];
  await runner.bind([binding(h, true)], async (envelope) => {
    seen1.push(envelope);
    return new Promise<Result>(() => {}); // crash mid-dispatch
  });
  await runner.submit({ prompt: "Increment", requestId: "req-retry" });
  await until(runner.status, (s) => s.ops[0]?.status === "dispatched", "dispatched");

  rmSync(`${db}.owner`, { force: true });
  const r2 = await openRunner({ storagePath: db });
  const revalidated: OpEnvelope[] = [];
  const seen2: OpEnvelope[] = [];
  await r2.configure({ baseUrl: gw.baseUrl, token: gw.token, model: MODEL });
  await r2.bind(
    [
      {
        ...binding(h, true),
        revalidate: async (env) => {
          revalidated.push(env);
        },
      },
    ],
    async (envelope, attempt) => {
      seen2.push(envelope);
      assert.equal(attempt.attemptNo, 2);
      return dispatchFor(h)(envelope, attempt, undefined as never);
    },
  );
  await r2.resume();
  const done = await until(r2.status, (s) => s.phase === "completed", "recovery completion");

  assert.equal(revalidated.length, 1, "host consent must be re-proven before retry");
  assert.equal(seen2.length, 1);
  // Same op id, same envelope, same idempotencyKey — the backend dedups.
  assert.deepEqual(seen2[0], seen1[0]);
  assert.equal(h.context().summary, "value 1");
  assert.equal(done.ops[0].attempts, 2);
  assert.equal(done.ops[0].status, "completed");
  await r2.close();
  await gw.close();
});

test("cancel persists intent, aborts generation, and reports cancelled phase", async () => {
  const { gw, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 }, delayMs: 50 },
    { content: "unreachable", usage: { input: 10, output: 5 }, delayMs: 50 },
  ]);
  // Unbound: the op parks, so cancel must release the parked waiter too.
  await runner.submit({ prompt: "Increment", requestId: "req-cancel" });
  const status = await runner.cancel();
  assert.equal(status.phase, "cancelled");
  const s2 = await until(runner.status, (s) => s.phase === "cancelled" || s.phase === "failed", "settle");
  assert.ok(["cancelled", "failed"].includes(s2.phase));
  await runner.close();
  await gw.close();
});

test("single owner: second open of a live DB fails closed", async () => {
  const { db } = tmpDb();
  const r1 = await openRunner({ storagePath: db });
  await assert.rejects(openRunner({ storagePath: db }), StorageOwnerConflict);
  await r1.close();
  // Lock released on close: a fresh owner can take over.
  const r2 = await openRunner({ storagePath: db });
  await r2.close();
});

test("incompatible stored version fails closed before scheduling", async () => {
  const { db } = tmpDb();
  const r1 = await openRunner({ storagePath: db });
  await r1.close();
  // Tamper with the persisted runtime stamp as a different build would leave.
  const { Harness, createRegistry } = await import("@earendil-works/pi-durable");
  const { createModels } = await import("@earendil-works/pi-ai");
  const { openNodeSqliteStorage } = await import(
    "@earendil-works/pi-durable/storage/sqlite/node"
  );
  const { MetaDoc } = await import("../src/journal.js");
  const storage = await openNodeSqliteStorage(db);
  const harness = await Harness.open(
    storage,
    { models: createModels(), registry: createRegistry() },
    {} as never,
  );
  await harness.commit(async (tx) => {
    const meta = await tx.doc(MetaDoc);
    (meta as { runtime: string }).runtime = "pi-durable@9.9.9";
    return undefined;
  }, {} as never);
  await harness.close({} as never);
  await assert.rejects(openRunner({ storagePath: db }), IncompatibleStorage);
});
