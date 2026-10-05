import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { invokeSchema, id } from "../src/shared/catalog.ts";

// Canonical artifact at repo root: every call envelope in the shared scenario
// must pass Guava's own backend validator — same bounds, no drift.
const scenario = JSON.parse(
  readFileSync(
    new URL("../../acceptance/bridge-scenario.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(invokeSchema);
const validateId = ajv.compile(id);

test("canonical bridge scenario envelopes pass guava invokeSchema", () => {
  const calls = scenario.steps.filter((s: any) => s.op === "call");
  assert.ok(calls.length >= 8, "scenario must carry real call steps");
  for (const s of calls) {
    const call = {
      requestId: crypto.randomUUID(),
      documentId: s.call.documentId ?? scenario.target.documentId,
      toolName: s.call.toolName,
      arguments: s.call.arguments,
      expectedRevision: s.call.expectedRevision,
      idempotencyKey: s.call.idempotencyKey,
    };
    assert.equal(
      validate(call),
      true,
      `${s.name}: ${JSON.stringify(validate.errors)}`,
    );
  }
});

test("canonical scenario ids satisfy guava bounds", () => {
  for (const f of ["targetId", "pageInstanceId", "documentId", "appId"]) {
    assert.equal(
      validateId(scenario.target[f]),
      true,
      `${f}=${scenario.target[f]} rejected by guava id schema`,
    );
  }
  for (const s of scenario.steps) {
    if (s.call?.idempotencyKey)
      assert.ok(s.call.idempotencyKey.length <= 120, s.name);
  }
});
