import { test } from "node:test";
import assert from "node:assert/strict";
import { openSync, writeSync, closeSync } from "node:fs";
import { openOwnedStorage, StorageOwnerConflict } from "../src/storage.js";
import { transcriptToWire, turnUsage, sanitizeWire } from "../src/transcript.js";
import { phaseOf } from "../src/status.js";
import { tmpDb } from "./helpers.js";
import type { Message } from "@orchard/agent-client";

test("transcriptToWire: dangling tool-call tail is sanitized, state rides the assistant message", () => {
  const pi = [
    { role: "user", content: "hi" },
    {
      role: "assistant",
      stopReason: "toolUse",
      responseId: "opaque",
      content: [
        { type: "toolCall", id: "c1", name: "t", arguments: { a: 1 }, argumentsRaw: '{"a":1}' },
      ],
    },
    // crash: no tool result committed
  ] as never;
  const { messages, dropped } = transcriptToWire(pi);
  // sanitizeWire removes the dangling assistant; the state never leaves with it.
  assert.equal(dropped, 1);
  assert.deepEqual(messages.map((m) => m.role), ["user"]);
});

test("transcriptToWire: x_gateway_state + raw args round-trip exactly", () => {
  const pi = [
    { role: "user", content: "hi" },
    {
      role: "assistant",
      stopReason: "toolUse",
      responseId: "cipher-state",
      content: [
        { type: "text", text: "" },
        { type: "toolCall", id: "c1", name: "t", arguments: { a: 1 }, argumentsRaw: '{"a": 1}' },
      ],
    },
    { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "ok" }] },
    {
      role: "assistant",
      stopReason: "stop",
      content: [{ type: "text", text: "done" }],
    },
  ] as never;
  const { messages } = transcriptToWire(pi);
  const a = messages[1];
  assert.equal(a.x_gateway_state, "cipher-state");
  // Verbatim emission (whitespace preserved) so the state digest binds.
  assert.equal(a.tool_calls?.[0].function.arguments, '{"a": 1}');
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "tool", "assistant"]);
});

test("turnUsage counts only the current turn", () => {
  const wire: Message[] = [
    { role: "user", content: "one" },
    { role: "assistant", content: null, tool_calls: [{ id: "a", type: "function", function: { name: "t", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "a", content: "{}" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "two" },
    { role: "assistant", content: null, tool_calls: [{ id: "b", type: "function", function: { name: "t", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "b", content: "{}" },
  ];
  assert.deepEqual(turnUsage(wire), { steps: 1, toolCalls: 1 });
});

test("sanitizeWire never emits an illegal history", () => {
  const wire: Message[] = [
    { role: "user", content: "x" },
    { role: "assistant", content: null, tool_calls: [{ id: "z", type: "function", function: { name: "t", arguments: "{}" } }] },
  ];
  const { messages } = sanitizeWire(wire);
  assert.equal(messages.length, 1);
});

test("phaseOf: precedence — cancelled > reconcile > waiting host > running > terminal", () => {
  const base = {
    tasks: [] as { name: string; state: string }[],
    submissions: [] as { requestId?: string; status: "queued" | "placed" | "done" | "unanswered"; reason?: string }[],
    ops: [] as { opId: string; toolName: string; status: "parked" | "dispatched" | "completed" | "failed" | "interrupted" | "ambiguous" | "reconciled"; attempts: number; error: string | null }[],
    hostBound: true,
    cancelled: false,
    inputPending: false,
    tailSettled: false,
  };
  assert.equal(phaseOf(base).phase, "idle");
  assert.equal(phaseOf({ ...base, cancelled: true }).phase, "cancelled");
  assert.equal(
    phaseOf({ ...base, ops: [{ opId: "o", toolName: "t", status: "ambiguous", attempts: 1, error: null }] }).phase,
    "needs_reconciliation",
  );
  assert.equal(
    phaseOf({ ...base, hostBound: false, ops: [{ opId: "o", toolName: "t", status: "parked", attempts: 0, error: null }] }).phase,
    "waiting_for_host",
  );
  assert.equal(phaseOf({ ...base, tasks: [{ name: "pi.tool", state: "running" }] }).phase, "running");
  assert.equal(phaseOf({ ...base, tailSettled: true }).phase, "completed");
  assert.equal(phaseOf({ ...base, lastError: "[AUTHENTICATION] no token" }).phase, "failed");
  assert.equal(
    phaseOf({ ...base, lastError: "[AUTHENTICATION] no token" }).reason,
    "AUTHENTICATION",
  );
});

test("storage: stale owner lock (dead pid) is taken over", async () => {
  const { db } = tmpDb();
  const fd = openSync(`${db}.owner`, "wx");
  writeSync(fd, JSON.stringify({ pid: 2_000_000_000 }));
  closeSync(fd);
  const owned = await openOwnedStorage(db, undefined as never);
  owned.release();
});

test("storage: second live owner fails closed", async () => {
  const { db } = tmpDb();
  const owned = await openOwnedStorage(db, undefined as never);
  await assert.rejects(openOwnedStorage(db, undefined as never), StorageOwnerConflict);
  owned.release();
});
