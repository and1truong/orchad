import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  requestSchema,
  validator,
} from "../packages/agent-client/src/protocol.js";
import { setup, request } from "./helpers.js";
test("published API schema matches runtime request validation and actual responses", async () => {
  const schema = JSON.parse(readFileSync("api.schema.json", "utf8"));
  assert.deepEqual(schema.definitions.ChatRequest, requestSchema);
  const completion = validator.compile(schema.definitions.Completion);
  const chunk = validator.compile(schema.definitions.CompletionChunk);
  const s = await setup();
  try {
    const r = await s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: request,
    });
    assert.equal(completion(r.json()), true);
    const stream = await s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: { ...request, stream: true },
    });
    for (const f of stream.body.split("\n\n")) {
      if (!f.startsWith("data: ") || f === "data: [DONE]") continue;
      assert.equal(chunk(JSON.parse(f.slice(6))), true);
    }
  } finally {
    await s.close();
  }
});
