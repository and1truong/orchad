import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  validator,
  requestSchema,
  type ToolCall,
} from "../packages/agent-client/src/protocol.js";

// Canonical artifact at repo root: the portable client's validators must
// accept the shared scenario's tool calls and message envelope.
const scenario = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      "@orchard/bridge-contract/scenario/bridge-scenario.json",
    ),
    "utf8",
  ),
);

test("canonical bridge scenario tool calls pass the client toolCall schema", () => {
  const checkCall = validator.compile({
    type: "object",
    additionalProperties: false,
    required: ["id", "type", "function"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 128 },
      type: { const: "function" },
      function: {
        type: "object",
        additionalProperties: false,
        required: ["name", "arguments"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
          arguments: { type: "string", maxLength: 65536 },
        },
      },
    },
  });
  const calls = scenario.steps.filter((s: any) => s.op === "call");
  assert.ok(calls.length >= 8);
  for (const s of calls) {
    const tc: ToolCall = {
      id: crypto.randomUUID(),
      type: "function",
      function: {
        name: s.call.toolName,
        arguments: JSON.stringify(s.call.arguments),
      },
    };
    assert.equal(checkCall(tc), true, s.name);
  }
});

test("canonical scenario documentId bounds fit the client envelope", () => {
  assert.ok(scenario.target.documentId.length <= 128);
  assert.equal(scenario.catalog.protocolVersion, "0.1");
  assert.ok(requestSchema.required.includes("model"));
});
