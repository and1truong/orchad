import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { demoTool } from "../fixtures/demo-counter.js";
import { fragmentedResponse, userMessages } from "./helpers.js";
test("browser bundle runs tool loop with string code generation disabled (MV3 CSP)", async () => {
  const result = await build({
    entryPoints: ["packages/agent-client/src/index.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "OrchardClient",
    write: false,
  });
  const source = result.outputFiles[0].text;
  assert.equal(/node:|new Function\(|eval\(/.test(source), false);
  let n = 0,
    calls = 0;
  const ctx: any = {
    URL,
    AbortController,
    TextDecoder,
    TextEncoder,
    structuredClone,
    Response,
    ReadableStream,
  };
  runInNewContext(source, ctx, {
    contextCodeGeneration: { strings: false, wasm: false },
  });
  const c = ctx.OrchardClient.createMockAgentClient(async () => {
    const f =
      n++ === 0
        ? [
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "c1",
                        type: "function",
                        function: {
                          name: "demo_increment",
                          arguments: '{"amount":1}',
                        },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            },
            "[DONE]",
          ]
        : [
            {
              choices: [{ delta: { content: "done" }, finish_reason: "stop" }],
            },
            "[DONE]",
          ];
    return fragmentedResponse(f);
  });
  const r = await c.runAgentTurn({
    gatewayBaseUrl: "http://127.0.0.1:4311",
    gatewayToken: "test",
    model: "mock-scripted",
    messages: userMessages,
    tools: [demoTool],
    executeTool: async () => {
      calls++;
      return { ok: true, revision: 1, data: null, error: null };
    },
  });
  assert.equal(r.finishReason, "completed");
  assert.equal(calls, 1);
});
