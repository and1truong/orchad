import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import {
  Bounds,
  canonical as sharedCanonical,
  failure as sharedFailure,
  success as sharedSuccess,
} from "@orchard/bridge-contract";
import { canonical, failure, success } from "../src/shared/contract.ts";
import { invokeSchema, id } from "../src/shared/catalog.ts";

// Conformance: Guava's backend validator must accept exactly the contract
// bounds — no more, no less. Identity assertions prove the Result helpers
// are the shared @orchard/bridge-contract implementation, not a local copy.

const ajv = new Ajv({ allErrors: false, strict: true });
const check = ajv.compile(invokeSchema);
const checkId = ajv.compile(id);
const s = (n: number) => "x".repeat(n);

const validCall = () => ({
  requestId: "r",
  documentId: "doc",
  toolName: "counter_add",
  arguments: {},
  expectedRevision: 0,
  idempotencyKey: "k",
});

test("canonical/success/failure are the shared implementation", () => {
  assert.equal(canonical, sharedCanonical);
  assert.equal(success, sharedSuccess);
  assert.equal(failure, sharedFailure);
});

test("shared signatures: success(data, revision), failure(code, message, retryable, revision)", () => {
  const r = success({ v: 1 }, 7);
  assert.deepEqual(r, { ok: true, revision: 7, data: { v: 1 }, error: null });
  const f = failure("STALE_CONTEXT", "m", false, 3);
  assert.deepEqual(f, {
    ok: false,
    revision: 3,
    data: null,
    error: { code: "STALE_CONTEXT", message: "m", retryable: false },
  });
});

test("invoke envelope identity fields: exactly Bounds.id", () => {
  for (const field of ["requestId", "documentId", "idempotencyKey"] as const) {
    assert.ok(check({ ...validCall(), [field]: s(Bounds.id) }), `${field} ${Bounds.id}`);
    assert.ok(!check({ ...validCall(), [field]: s(Bounds.id + 1) }), `${field} ${Bounds.id + 1}`);
    assert.ok(!check({ ...validCall(), [field]: "" }), `${field} empty`);
  }
});

test("id schema: exactly Bounds.id", () => {
  assert.ok(checkId(s(Bounds.id)));
  assert.ok(!checkId(s(Bounds.id + 1)));
  assert.ok(!checkId(""));
});

test("toolName: exactly Bounds.toolName", () => {
  assert.ok(check({ ...validCall(), toolName: s(Bounds.toolName) }));
  assert.ok(!check({ ...validCall(), toolName: s(Bounds.toolName + 1) }));
  assert.ok(!check({ ...validCall(), toolName: "bad name!" }));
});
