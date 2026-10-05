import test from "node:test";
import assert from "node:assert/strict";
import {
  Bounds,
  Codes,
  canonical,
  failure,
  hostSafeSchema,
  safePattern,
  success,
  validateArguments,
  withinMessageCap,
} from "../dist/index.js";

test("canonical sorts object keys recursively and ignores input order", () => {
  assert.equal(
    canonical({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }),
    canonical({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
  );
  assert.equal(canonical({ a: 1, b: [true, null, "x"] }), '{"a":1,"b":[true,null,"x"]}');
});

test("success/failure produce contract Result envelopes", () => {
  assert.deepEqual(success({ v: 1 }, 7), {
    ok: true,
    revision: 7,
    data: { v: 1 },
    error: null,
  });
  const f = failure("STALE_CONTEXT", "old", false, 3);
  assert.equal(f.ok, false);
  assert.equal(f.revision, 3);
  assert.equal(f.error.code, "STALE_CONTEXT");
  // messages clamp below the error bound so the Result stays within caps
  assert.equal(failure("INTERNAL", "x".repeat(20000)).error.message.length, 8000);
});

test("Codes covers the 12 contract codes", () => {
  assert.equal(Codes.length, 12);
  assert.ok(Codes.includes("APPROVAL_DENIED") && Codes.includes("STALE_CONTEXT"));
});

test("hostSafeSchema: the bounded dialect, no more", () => {
  assert.ok(hostSafeSchema({ type: "object", properties: { a: { type: "string", pattern: "^[a-z]+$" } } }));
  assert.ok(hostSafeSchema({ oneOf: [{ type: "string" }, { type: "number" }] }));
  // banned keys / shapes
  for (const s of [
    { $ref: "#/x" },
    { $id: "x" },
    { format: "email" },
    { patternProperties: { "^a": {} } },
    { if: {}, then: {} },
    { type: "object", pattern: "(a+)+" },
    { uniqueItems: true }, // no maxItems bound
    { type: "object", properties: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, {}])) },
  ])
    assert.equal(hostSafeSchema(s), false, JSON.stringify(s));
  // depth cap
  let deep = { type: "string" };
  for (let i = 0; i < 8; i++) deep = { type: "object", properties: { a: deep } };
  assert.equal(hostSafeSchema(deep), false);
});

test("safePattern refuses backrefs and nested unbounded repeats", () => {
  assert.ok(safePattern("^[a-z0-9_-]{1,64}$"));
  assert.ok(!safePattern("(a+)+"));
  assert.ok(!safePattern("(a*)*"));
  assert.ok(!safePattern("(\\d{2,})*"));
  // a bounded outer quantifier stays linear and is allowed
  assert.ok(safePattern("(\\d{2,}){3}"));
  assert.ok(!safePattern("(a)\\1"));
  assert.ok(!safePattern("x".repeat(300)));
  assert.ok(!safePattern("("));
});

test("validateArguments interprets (no codegen) and fails closed", () => {
  const tool = { inputSchema: { type: "object", required: ["n"], properties: { n: { type: "integer" } }, additionalProperties: false } };
  assert.ok(validateArguments(tool, { n: 1 }));
  assert.ok(!validateArguments(tool, { n: "x" }));
  assert.ok(!validateArguments({ inputSchema: { $ref: "#/x" } }, {}));
});

test("withinMessageCap enforces the 64KiB envelope bound", () => {
  assert.ok(withinMessageCap({ a: 1 }));
  assert.ok(!withinMessageCap({ a: "x".repeat(Bounds.message) }));
});

test("Bounds matches the contract envelope section", () => {
  assert.equal(Bounds.message, 65536);
  assert.equal(Bounds.id, 128);
  assert.equal(Bounds.toolName, 64);
  assert.equal(Bounds.tools, 64);
  assert.equal(Bounds.sessions, 64);
});
