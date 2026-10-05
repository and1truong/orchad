import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueue } from "../src/host/approval-queue.js";
import type { Approval } from "../src/host/policy.js";
import type { Target, Tool, Call } from "../src/shared/contract.js";
const target: Target = {
  targetId: "t",
  pageInstanceId: "p",
  origin: "http://127.0.0.1:4313",
  appId: "demo-counter",
  documentId: "demo-document",
  title: "t",
};
const tool: Tool = {
  name: "demo_increment",
  description: "x",
  inputSchema: { type: "object" },
  effect: "write",
};
const call = (requestId: string): Call => ({
  requestId,
  documentId: "demo-document",
  toolName: "demo_increment",
  arguments: { amount: 1 },
  expectedRevision: 0,
  idempotencyKey: "k-" + requestId,
});
const approval = (requestId: string, expiresAt = Date.now() + 60_000): Approval => ({
  clientId: "c",
  sessionId: "s",
  target,
  tool,
  call: call(requestId),
  targetObjects: [],
  canonicalArguments: "{}",
  expiresAt,
});
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test("concurrent approvals display one card at a time in FIFO order", async () => {
  const shown: (string | null)[] = [];
  const queue = new ApprovalQueue((a) => shown.push(a?.call.requestId ?? null));
  const signal = new AbortController().signal;
  const first = queue.ask(approval("r-1"), signal);
  const second = queue.ask(approval("r-2"), signal);
  // Both registered immediately; only the first card is current.
  assert.equal(queue.pending, 2);
  assert.deepEqual(shown, ["r-1"]);
  queue.resolveCurrent(true);
  assert.equal(await first, true);
  // The second card surfaces only after the first resolves — never denied.
  assert.deepEqual(shown, ["r-1", "r-2"]);
  queue.resolveCurrent(false);
  assert.equal(await second, false);
  assert.deepEqual(shown, ["r-1", "r-2", null]);
  assert.equal(queue.pending, 0);
});

test("queued approval releases its slot when its caller aborts", async () => {
  const shown: (string | null)[] = [];
  const queue = new ApprovalQueue((a) => shown.push(a?.call.requestId ?? null));
  const a = new AbortController(),
    b = new AbortController();
  const first = queue.ask(approval("r-1"), a.signal);
  const second = queue.ask(approval("r-2"), b.signal);
  b.abort();
  assert.equal(await second, false);
  // Head is untouched; the aborted entry never consumed the visible slot.
  assert.equal(queue.pending, 1);
  assert.deepEqual(shown, ["r-1"]);
  queue.resolveCurrent(true);
  assert.equal(await first, true);
  assert.equal(queue.pending, 0);
});

test("aborted current approval advances to the queued card", async () => {
  const shown: (string | null)[] = [];
  const queue = new ApprovalQueue((a) => shown.push(a?.call.requestId ?? null));
  const a = new AbortController(),
    b = new AbortController();
  const first = queue.ask(approval("r-1"), a.signal);
  const second = queue.ask(approval("r-2"), b.signal);
  a.abort();
  assert.equal(await first, false);
  assert.deepEqual(shown.at(-1), "r-2");
  queue.resolveCurrent(true);
  assert.equal(await second, true);
});

test("expired entries resolve denied without a manual answer", async () => {
  const shown: (string | null)[] = [];
  const queue = new ApprovalQueue((a) => shown.push(a?.call.requestId ?? null));
  const signal = new AbortController().signal;
  // Already past its deadline at enqueue time.
  const stale = queue.ask(approval("r-1", Date.now() - 1), signal);
  assert.equal(await stale, false);
  await tick();
  assert.equal(queue.pending, 0);
  assert.deepEqual(shown.at(-1), null);
  const live = queue.ask(approval("r-2"), signal);
  const queued = queue.ask(approval("r-3", Date.now() + 5), signal);
  assert.equal(queue.pending, 2);
  await tick(30);
  // The queued entry expired behind the card and freed its own slot.
  assert.equal(await queued, false);
  assert.equal(queue.pending, 1);
  queue.resolveCurrent(true);
  assert.equal(await live, true);
});

test("resolveAll settles every pending entry", async () => {
  const queue = new ApprovalQueue(() => {});
  const signal = new AbortController().signal;
  const a = queue.ask(approval("r-1"), signal);
  const b = queue.ask(approval("r-2"), signal);
  const c = queue.ask(approval("r-3"), signal);
  queue.resolveAll(false);
  assert.deepEqual(
    await Promise.all([a, b, c]),
    [false, false, false],
  );
  assert.equal(queue.pending, 0);
});
