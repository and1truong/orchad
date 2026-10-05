import test from "node:test";
import assert from "node:assert/strict";
import { startMockGateway } from "../fixtures/gateway.js";
import {
  listModels,
  collectToolArguments,
} from "../src/agent-client/gateway-adapter.js";
test("real mock HTTP gateway: authenticated model listing and interrupted SSE arguments", async () => {
  const gateway = await startMockGateway(0);
  const base = `http://127.0.0.1:${gateway.port}`;
  try {
    assert.deepEqual(await listModels(base, "lime-fixture-token"), [
      "mock-counter",
    ]);
    await assert.rejects(() => listModels(base, "wrong-token"));
    const r = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer lime-fixture-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ stream: true }),
    });
    assert.equal(r.status, 200);
    async function* chunks() {
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        yield decoder.decode(chunk.value, { stream: true });
      }
    }
    let dispatch = 0;
    await assert.rejects(async () => {
      await collectToolArguments(chunks());
      dispatch++;
    });
    assert.equal(dispatch, 0);
  } finally {
    await gateway.close();
  }
});
