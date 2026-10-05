import test from "node:test";
import assert from "node:assert/strict";
import { Bounds } from "@orchard/bridge-contract";
import { requestSchema } from "../packages/agent-client/src/protocol.js";
import AjvModule from "ajv";

// Conformance: mango's request schema must accept exactly the contract
// bounds for the shared envelope fields — no more, no less.

const Ajv = AjvModule as unknown as typeof AjvModule.default;
const ajv = new Ajv({ allErrors: false, strict: true });
const check = ajv.compile(requestSchema);
const s = (n: number) => "x".repeat(n);

const validRequest = () => ({
  model: "m",
  messages: [{ role: "user", content: "hi" }],
});

test("tool_call_id / call id / model: exactly Bounds.id", () => {
  const call = (id: string) => ({
    id,
    type: "function",
    function: { name: "t", arguments: "{}" },
  });
  const req = (id: string) => ({
    model: "m",
    messages: [{ role: "assistant", content: null, tool_calls: [call(id)] }],
  });
  assert.ok(check(req(s(Bounds.id))), `call.id ${Bounds.id}`);
  assert.ok(!check(req(s(Bounds.id + 1))), `call.id ${Bounds.id + 1}`);
  const viaToolMsg = (v: string) => ({
    model: "m",
    messages: [{ role: "tool", content: "x", tool_call_id: v }],
  });
  assert.ok(check(viaToolMsg(s(Bounds.id))), `tool_call_id ${Bounds.id}`);
  assert.ok(!check(viaToolMsg(s(Bounds.id + 1))), `tool_call_id ${Bounds.id + 1}`);
  assert.ok(check({ ...validRequest(), model: s(Bounds.id) }));
  assert.ok(!check({ ...validRequest(), model: s(Bounds.id + 1) }));
});

test("content and arguments: exactly Bounds.message (64KiB)", () => {
  assert.ok(
    check({
      ...validRequest(),
      messages: [{ role: "user", content: s(Bounds.message) }],
    }),
  );
  assert.ok(
    !check({
      ...validRequest(),
      messages: [{ role: "user", content: s(Bounds.message + 1) }],
    }),
  );
  const call = (args: string) => ({
    id: "i",
    type: "function",
    function: { name: "t", arguments: args },
  });
  const req = (args: string) => ({
    model: "m",
    messages: [{ role: "assistant", content: null, tool_calls: [call(args)] }],
  });
  assert.ok(check(req(s(Bounds.message))), `arguments ${Bounds.message}`);
  assert.ok(!check(req(s(Bounds.message + 1))), `arguments ${Bounds.message + 1}`);
});

test("tools array and tool fields match contract bounds", () => {
  const tool = (name: string, description = "d") => ({
    type: "function",
    function: { name, description, parameters: { type: "object" } },
  });
  const tools = Array.from({ length: Bounds.tools }, (_, i) => tool(`t${i}`));
  assert.ok(check({ ...validRequest(), tools }), `${Bounds.tools} tools`);
  assert.ok(
    !check({ ...validRequest(), tools: [...tools, tool("extra")] }),
    `${Bounds.tools + 1} tools`,
  );
  assert.ok(check({ ...validRequest(), tools: [tool(s(Bounds.toolName))] }));
  assert.ok(!check({ ...validRequest(), tools: [tool(s(Bounds.toolName + 1))] }));
  assert.ok(
    check({ ...validRequest(), tools: [tool("t", s(Bounds.description))] }),
  );
  assert.ok(
    !check({ ...validRequest(), tools: [tool("t", s(Bounds.description + 1))] }),
  );
});
