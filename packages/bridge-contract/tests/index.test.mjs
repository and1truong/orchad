import test from "node:test";
import assert from "node:assert/strict";
import {
  Bounds,
  Codes,
  canonical,
  failure,
  hostSafeSchema,
  matchPattern,
  safePattern,
  success,
  validateArgs,
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
    { type: "object", pattern: "(?=x)y" }, // lookaround outside the dialect
    { type: "object", pattern: "(a)\\1" }, // backreference outside the dialect
    { uniqueItems: true }, // no maxItems bound
    { type: "object", properties: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, {}])) },
  ])
    assert.equal(hostSafeSchema(s), false, JSON.stringify(s));
  // depth cap
  let deep = { type: "string" };
  for (let i = 0; i < 8; i++) deep = { type: "object", properties: { a: deep } };
  assert.equal(hostSafeSchema(deep), false);
});

test("safePattern gates on engine support, not on shape heuristics", () => {
  assert.ok(safePattern("^[a-z0-9_-]{1,64}$"));
  // the NFA engine runs ANY construct it accepts in bounded linear time, so
  // shapes that used to backtrack exponentially under RegExp are in-dialect
  assert.ok(safePattern("(a+)+"));
  assert.ok(safePattern("(a*)*"));
  assert.ok(safePattern("(\\d{2,})*"));
  assert.ok(safePattern("^(a|aa)+$"));
  // a bounded outer quantifier stays linear and is allowed
  assert.ok(safePattern("(\\d{2,}){3}"));
  // constructs the engine refuses still fail closed at the gate
  assert.ok(!safePattern("(a)\\1"));
  assert.ok(!safePattern("(?=x)y"));
  assert.ok(!safePattern("(?<g>x)"));
  assert.ok(!safePattern("a{300}"));
  assert.ok(!safePattern("x".repeat(300)));
  assert.ok(!safePattern("("));
});

test("matchPattern runs ambiguous patterns in bounded linear time", () => {
  // the catastrophic-regex repro: finishes in ms instead of wedging the host
  const t = Date.now();
  assert.equal(matchPattern("^(a|aa)+$", "a".repeat(40000) + "!"), false);
  assert.equal(matchPattern("^(a+)+$", "a".repeat(40000) + "!"), false);
  assert.ok(Date.now() - t < 2000, "ReDoS repro must stay in a bounded budget");
  // semantics parity on shapes the dialect accepts
  assert.equal(matchPattern("^demo_[0-9a-f]{8}$", "demo_deadbeef"), true);
  assert.equal(matchPattern("^demo_[0-9a-f]{8}$", "demo_DEADBEEF"), false);
  assert.equal(matchPattern("(a*)*", "aa"), true);
  assert.equal(matchPattern("a{2,4}", "aaa"), true);
  assert.equal(matchPattern("a{2,4}", "a"), false);
  // unparseable patterns fail closed instead of throwing
  assert.equal(matchPattern("(", "x"), false);
});

test("validateArgs pins one tuple/prefixItems semantics for every host", () => {
  const tuple = {
    type: "array",
    prefixItems: [{ type: "string" }, { type: "integer" }],
    items: false,
  };
  assert.equal(validateArgs(tuple, ["x", 3]), true);
  assert.equal(validateArgs(tuple, ["wrong", "x"]), false);
  assert.equal(validateArgs(tuple, ["x", 3, 4]), false);
  // no `items` keyword: the tuple is closed, extras are rejected
  const closed = { type: "array", prefixItems: [{ type: "string" }] };
  assert.equal(validateArgs(closed, ["x"]), true);
  assert.equal(validateArgs(closed, ["x", 1]), false);
  // draft-07 tuple spelling: items as an array
  const legacy = { type: "array", items: [{ type: "string" }] };
  assert.equal(validateArgs(legacy, ["x"]), true);
  assert.equal(validateArgs(legacy, [1]), false);
  assert.equal(validateArgs(legacy, ["x", "extra"]), false);
  // schema-valued `items` validates elements past the prefix
  const open = {
    type: "array",
    prefixItems: [{ type: "string" }],
    items: { type: "number" },
  };
  assert.equal(validateArgs(open, ["x", 5]), true);
  assert.equal(validateArgs(open, ["x", "y"]), false);
});

test("validateArgs covers combinators, uniqueItems and additionalProperties", () => {
  assert.equal(validateArgs({ oneOf: [{ type: "string" }, { type: "number" }] }, 2), true);
  assert.equal(validateArgs({ oneOf: [{ type: "integer" }, { type: "number" }] }, 2), false);
  assert.equal(validateArgs({ anyOf: [{ type: "string" }, { type: "number" }] }, "s"), true);
  assert.equal(validateArgs({ allOf: [{ type: "number" }, { minimum: 2 }] }, 1), false);
  assert.equal(validateArgs({ not: { type: "string" } }, 1), true);
  assert.equal(validateArgs({ type: "array", maxItems: 4, uniqueItems: true }, [1, 2, 2]), false);
  assert.equal(validateArgs({ type: "array", maxItems: 4, uniqueItems: true }, [1, 2, 3]), true);
  const obj = {
    type: "object",
    required: ["n"],
    properties: { n: { type: "integer", minimum: 0 } },
    additionalProperties: false,
  };
  assert.equal(validateArgs(obj, { n: 2 }), true);
  assert.equal(validateArgs(obj, { n: -1 }), false);
  assert.equal(validateArgs(obj, { n: 2, extra: 1 }), false);
  assert.equal(validateArgs(obj, {}), false);
});

test("validateArguments interprets (no codegen) and fails closed", () => {
  const tool = { inputSchema: { type: "object", required: ["n"], properties: { n: { type: "integer" } }, additionalProperties: false } };
  assert.ok(validateArguments(tool, { n: 1 }));
  assert.ok(!validateArguments(tool, { n: "x" }));
  assert.ok(!validateArguments({ inputSchema: { $ref: "#/x" } }, {}));
  // unsupported keywords are rejected at the gate, never silently ignored
  assert.ok(!validateArguments({ inputSchema: { if: {}, then: {} } }, {}));
  assert.ok(!validateArguments({ inputSchema: { format: "email" } }, "a@b.c"));
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
