import test from "node:test";
import assert from "node:assert/strict";
import {
  Bounds,
  canonical as sharedCanonical,
  failure as sharedFailure,
  hostSafeSchema as sharedHostSafeSchema,
  success as sharedSuccess,
} from "@orchard/bridge-contract";
import {
  CallSchema,
  ContextSchema,
  DescriptionSchema,
  ResultSchema,
  TargetSchema,
  ToolSchema,
  bounded,
  canonical,
  failure,
  hostSafeSchema,
  success,
} from "../src/shared/contract.js";

// Conformance: the lime validators must accept exactly the contract bounds —
// no more, no less (#bounds). Identity assertions below prove there is a
// single implementation of canonical/success/failure/hostSafeSchema (#dedup).

const s = (n: number) => "x".repeat(n);
const ctx = {
  appId: "app",
  documentId: "doc",
  revision: 0,
  selectionIds: [],
  summary: "",
  sessionEpoch: "e",
};

test("canonical/success/failure/hostSafeSchema are the shared implementation", () => {
  assert.equal(canonical, sharedCanonical);
  assert.equal(success, sharedSuccess);
  assert.equal(failure, sharedFailure);
  assert.equal(hostSafeSchema, sharedHostSafeSchema);
});

test("identity strings: exactly Bounds.id", () => {
  for (const [key, field] of [
    ["requestId", "requestId"],
    ["documentId", "documentId"],
    ["idempotencyKey", "idempotencyKey"],
  ] as const) {
    assert.ok(CallSchema.safeParse({ ...call, [field]: s(Bounds.id) }).success, `${key} ${Bounds.id}`);
    assert.ok(!CallSchema.safeParse({ ...call, [field]: s(Bounds.id + 1) }).success, `${key} ${Bounds.id + 1}`);
    assert.ok(!CallSchema.safeParse({ ...call, [field]: "" }).success, `${key} empty`);
  }
  for (const field of ["targetId", "pageInstanceId", "appId", "documentId"] as const) {
    assert.ok(TargetSchema.safeParse({ ...target, [field]: s(Bounds.id) }).success, `${field} ${Bounds.id}`);
    assert.ok(!TargetSchema.safeParse({ ...target, [field]: s(Bounds.id + 1) }).success, `${field} ${Bounds.id + 1}`);
  }
});

const call = {
  requestId: "r",
  documentId: "d",
  toolName: "t",
  arguments: {},
  expectedRevision: 0,
  idempotencyKey: "k",
};
const target = {
  targetId: "t",
  pageInstanceId: "p",
  origin: "http://127.0.0.1:1",
  appId: "a",
  documentId: "d",
  title: "t",
};
test("context: summary/sessionEpoch/selectionIds match contract bounds", () => {
  const at = (patch: object) => ContextSchema.safeParse({ ...ctx, ...patch });
  assert.ok(at({ summary: s(Bounds.summary) }).success);
  assert.ok(!at({ summary: s(Bounds.summary + 1) }).success);
  assert.ok(at({ sessionEpoch: s(Bounds.sessionEpoch) }).success);
  assert.ok(!at({ sessionEpoch: s(Bounds.sessionEpoch + 1) }).success);
  const ids = Array.from({ length: Bounds.selectionIds }, (_, i) => `id${i}`);
  assert.ok(at({ selectionIds: ids }).success);
  assert.ok(!at({ selectionIds: [...ids, "extra"] }).success);
});

test("tool description and catalog size match contract bounds", () => {
  const tool = (description: string) => ({
    name: "t",
    description,
    inputSchema: { type: "object" },
    effect: "read" as const,
  });
  assert.ok(ToolSchema.safeParse(tool(s(Bounds.description))).success);
  assert.ok(!ToolSchema.safeParse(tool(s(Bounds.description + 1))).success);
  const tools = Array.from({ length: Bounds.tools }, (_, i) => ({
    name: `t${i}`,
    description: "d",
    inputSchema: { type: "object" },
    effect: "read" as const,
  }));
  assert.ok(DescriptionSchema.safeParse({ protocolVersion: "0.1", appId: "a", tools }).success);
  assert.ok(
    !DescriptionSchema.safeParse({
      protocolVersion: "0.1",
      appId: "a",
      tools: [...tools, { name: "extra", description: "d", inputSchema: { type: "object" }, effect: "read" }],
    }).success,
  );
});

test("result error message and target title match contract bounds", () => {
  const result = (message: string) => ({
    ok: false,
    revision: null,
    data: null,
    error: { code: "INTERNAL", message, retryable: false },
  });
  assert.ok(ResultSchema.safeParse(result(s(Bounds.errorMessage))).success);
  assert.ok(!ResultSchema.safeParse(result(s(Bounds.errorMessage + 1))).success);
  assert.ok(TargetSchema.safeParse({ ...target, title: s(Bounds.title) }).success);
  assert.ok(!TargetSchema.safeParse({ ...target, title: s(Bounds.title + 1) }).success);
});

test("bounded() enforces exactly the 64KiB message cap", () => {
  const schema = CallSchema;
  assert.ok(bounded(schema, call));
  const padded = { ...call, requestId: s(Bounds.id), arguments: { pad: s(Bounds.message) } };
  assert.throws(() => bounded(schema, padded), /64 KiB/);
});
