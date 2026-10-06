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

/** A dispatch that hangs like a dead host. Self-releases on a timer so a
 *  zombie left over from a crash test cannot pin the event loop. */
const hangable = () => {
  const release: (() => void)[] = [];
  return {
    dispatch: () =>
      new Promise<Result>((r) => {
        const settle = () =>
          r({ ok: false, revision: null, data: null, error: null });
        release.push(settle);
        setTimeout(settle, 30_000).unref();
      }),
    releaseAll: () => release.splice(0).forEach((r) => r()),
  };
};

const binding = (h: ReturnType<typeof host>, idempotent = true) => ({
  targetId: "demo-document",
  revision: () => h.context().revision,
  tools: [demoTool],
  idempotentTools: idempotent ? ["demo_increment"] : [],
});

async function running(
  script: Parameters<typeof fakeGateway>[0],
  runnerOpts: Partial<Parameters<typeof openRunner>[0]> = {},
) {
  const gw = await fakeGateway(script);
  const { db } = tmpDb();
  const runner = await openRunner({ storagePath: db, ...runnerOpts });
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
  const hung1 = hangable();
  console.log("dbg: bind");
  await runner.bind([binding(h, false)], hung1.dispatch);
  console.log("dbg: submit");
  await runner.submit({ prompt: "Increment", requestId: "req-crash" });
  console.log("dbg: until dispatched");
  const dispatched = await until(
    runner.status,
    (s) => s.ops[0]?.status === "dispatched",
    "dispatched mark",
  );
  assert.equal(dispatched.ops[0].attempts, 1);

  // Simulate process death: the lockfile disappears but the op stays
  // 'dispatched' with no committed result.
  console.log("dbg: open r2");
  rmSync(`${db}.owner`, { force: true });
  const r2 = await openRunner({ storagePath: db });
  console.log("dbg: resume r2");
  await r2.resume();
  console.log("dbg: reconcile until");
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
  console.log("dbg: resolve+final");
  const final = await r2.status();
  assert.equal(final.ops[0].status, "failed");
  await r2.close();
  // Release the hung dispatch first so the zombie settles fast, then close
  // it — its open Harness/subscriptions otherwise pin the event loop.
  hung1.releaseAll();
  await runner.close();
  await gw.close();
});

test("idempotent mutation re-entered after crash: revalidated + same key+envelope, one host effect", async () => {
  const h = host();
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "Done.", usage: { input: 20, output: 5 } },
  ]);
  const seen1: OpEnvelope[] = [];
  const hung4 = hangable();
  await runner.bind([binding(h, true)], async (envelope) => {
    seen1.push(envelope);
    return hung4.dispatch(envelope); // crash mid-dispatch
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
  hung4.releaseAll();
  await runner.close();
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

test("credentials never reach the checkpoint DB", async () => {
  const h = host();
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], continuation: { step: 1 }, usage: { input: 10, output: 5 } },
    { content: "Done.", usage: { input: 20, output: 5 } },
  ]);
  await runner.bind([binding(h)], dispatchFor(h));
  await runner.submit({ prompt: "Increment", requestId: "req-secret" });
  await until(runner.status, (s) => s.phase === "completed", "completion");
  await runner.close();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(db);
  assert.equal(bytes.includes(gw.token), false, "gateway token in checkpoint");
  assert.equal(bytes.includes("Bearer"), false, "bearer material in checkpoint");
  await gw.close();
});

test("re-entry with denied revalidation fails closed — no second dispatch", async () => {
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "unreachable", usage: { input: 20, output: 5 } },
  ]);
  const hung2 = hangable();
  await runner.bind([binding(host(), true)], hung2.dispatch);
  await runner.submit({ prompt: "Increment", requestId: "req-denied" });
  await until(runner.status, (s) => s.ops[0]?.status === "dispatched", "dispatched");
  rmSync(`${db}.owner`, { force: true });

  const r2 = await openRunner({ storagePath: db });
  let dispatched2 = 0;
  await r2.configure({ baseUrl: gw.baseUrl, token: gw.token, model: MODEL });
  await r2.bind(
    [
      {
        ...binding(host(), true),
        revalidate: async () => {
          throw new Error("consent expired");
        },
      },
    ],
    async () => {
      dispatched2++;
      return { ok: true, revision: 1, data: null, error: null };
    },
  );
  await r2.resume();
  const s = await until(r2.status, (st) => st.ops[0]?.status === "failed", "failed op");
  assert.equal(dispatched2, 0, "revalidation denial must not dispatch");
  assert.match(s.ops[0].error ?? "", /revalidation failed/i);
  await r2.close();
  hung2.releaseAll();
  await runner.close();
  await gw.close();
});

test("late tool response after cancel reconciles: result recorded, run stays cancelled", async () => {
  const h = host();
  const { gw, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "unreachable", usage: { input: 20, output: 5 } },
  ]);
  let release!: () => void;
  const hung = new Promise<void>((resolve) => (release = resolve));
  await runner.bind(
    [binding(h)],
    async (envelope) => {
      await hung;
      return dispatchFor(h)(envelope);
    },
  );
  await runner.submit({ prompt: "Increment", requestId: "req-late" });
  await until(runner.status, (s) => s.ops[0]?.status === "dispatched", "dispatched");
  // cancel aborts the in-flight dispatch; a cooperative host releases it.
  const cancelling = runner.cancel();
  release();
  await cancelling;
  const cancelled = await runner.status();
  assert.equal(cancelled.phase, "cancelled");

  const s = await until(
    runner.status,
    (st) => st.ops[0]?.status === "completed" && st.phase === "cancelled",
    "late settle",
  );
  assert.equal(h.context().summary, "value 1");
  assert.equal(s.ops[0].status, "completed");
  assert.equal(s.phase, "cancelled");
  await runner.close();
  await gw.close();
});

test("persisted step budget still blocks generation after reopen", async () => {
  const h = host();
  let genCalls = 0;
  // MockProvider consumes one script entry per HTTP request; a second request
  // must never happen once the committed step budget is spent.
  const { gw, db, runner } = await running(
    [
      { toolCalls: [incrCall()], continuation: { step: 1 }, usage: { input: 10, output: 5 } },
      { content: "unreachable", usage: { input: 20, output: 5 } },
    ],
    { maxSteps: 1 },
  );
  await runner.bind([binding(h)], dispatchFor(h));
  await runner.submit({ prompt: "Increment", requestId: "req-budget" });
  const s = await until(runner.status, (st) => st.phase === "failed", "step limit");
  assert.match(s.detail ?? "", /STEP_LIMIT/);
  await runner.close();

  const r2 = await openRunner({ storagePath: db, maxSteps: 1 });
  await r2.configure({ baseUrl: gw.baseUrl, token: gw.token, model: MODEL });
  await r2.resume();
  const s2 = await until(r2.status, (st) => st.phase === "failed", "reopen failed");
  assert.match(s2.detail ?? "", /STEP_LIMIT/);
  await r2.close();
  await gw.close();
});

test("dispatch that throws mid-flight lands ambiguous, never retried", async () => {
  const h = host();
  const { gw, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "Done.", usage: { input: 10, output: 5 } },
  ]);
  let threw = 0;
  await runner.bind([binding(h)], async () => {
    threw++;
    throw new Error("socket died mid-write");
  });
  await runner.submit({ prompt: "Increment", requestId: "req-throw" });
  const s = await until(
    runner.status,
    (st) => st.ops[0]?.status === "ambiguous",
    "ambiguous",
  );
  assert.equal(s.phase, "needs_reconciliation");
  assert.equal(threw, 1);
  assert.equal(h.context().summary, "value 0");
  await runner.close();
  await gw.close();
});

test("'applied' verdict with no result resolves the op — strict-JSON safe", async () => {
  const h = host();
  const { gw, db, runner } = await running([
    { toolCalls: [incrCall()], usage: { input: 10, output: 5 } },
    { content: "Done.", usage: { input: 20, output: 5 } },
  ]);
  // NOT idempotent → replay 'unsafe' → the tool task is never re-executed.
  const hung = hangable();
  await runner.bind([binding(h, false)], async (envelope) => hung.dispatch(envelope));
  await runner.submit({ prompt: "Increment", requestId: "req-verdict" });
  const dispatched = await until(
    runner.status,
    (s) => s.ops[0]?.status === "dispatched",
    "dispatched",
  );
  // Simulate process death so a second owner may open the same DB.
  rmSync(`${db}.owner`, { force: true });
  const r2 = await openRunner({ storagePath: db });
  await r2.configure({ baseUrl: gw.baseUrl, token: gw.token, model: MODEL });
  await r2.resume();
  const status = await until(
    r2.reconcile.bind(r2),
    (s) => s.ops[0]?.status === "ambiguous" || s.ops[0]?.status === "interrupted",
    "reconcile",
  );
  assert.equal(status.phase, "needs_reconciliation");
  // UI sends verdict {status:'reconciled'} with no result — must not throw.
  await r2.resolveOp(dispatched.ops[0].opId, { status: "reconciled" });
  const final = await r2.status();
  assert.equal(final.ops[0].status, "reconciled");
  await r2.close();
  hung.releaseAll();
  await runner.close();
  await gw.close();
});
