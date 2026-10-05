import { test } from "node:test";
import assert from "node:assert/strict";
import { fragmentedResponse, userMessages } from "./helpers.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import {
  AnthropicProvider,
  anthropicBody,
} from "../src/providers/anthropic.js";
import { GeminiProvider, geminiBody } from "../src/providers/gemini.js";
import {
  UpstreamError,
  type ProviderAdapter,
  type ProviderRequest,
  type ProviderEvent,
} from "../src/providers/types.js";
import { demoTool } from "../fixtures/demo-counter.js";
const req: ProviderRequest = {
  model: "configured-model",
  upstreamModel: "admin-model-id",
  messages: userMessages,
  max_completion_tokens: 128,
  tools: [
    {
      type: "function",
      function: { name: demoTool.name, parameters: demoTool.inputSchema },
    },
  ],
  continuations: new Map(),
};
const call = {
  id: "c1",
  type: "function" as const,
  function: { name: "demo_increment", arguments: '{"amount":1}' },
};
const oText = [
  { choices: [{ delta: { content: "Hi" } }] },
  { choices: [{ delta: {}, finish_reason: "stop" }] },
  { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } },
  "[DONE]",
];
const oTools = [
  {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "c1",
              type: "function",
              function: { name: "demo_increment", arguments: '{"amo' },
            },
          ],
        },
      },
    ],
  },
  {
    choices: [
      {
        delta: {
          tool_calls: [{ index: 0, function: { arguments: 'unt":1}' } }],
        },
        finish_reason: "tool_calls",
      },
    ],
  },
  "[DONE]",
];
const aStart = {
  type: "message_start",
  message: { usage: { input_tokens: 3, output_tokens: 0 } },
};
const aText = [
  aStart,
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Hi" },
  },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 2 },
  },
  { type: "message_stop" },
];
const aTools = [
  aStart,
  {
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "tool_use",
      id: "c1",
      name: "demo_increment",
      input: {},
    },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: '{"amo' },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: 'unt":1}' },
  },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { output_tokens: 6 },
  },
  { type: "message_stop" },
];
const gText = [
  { candidates: [{ content: { parts: [{ text: "Hi" }] } }] },
  {
    candidates: [{ finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
  },
];
const gTools = [
  {
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                id: "c1",
                name: "demo_increment",
                args: { amount: 1 },
              },
              thoughtSignature: "synthetic-signature",
            },
          ],
        },
      },
    ],
  },
  {
    candidates: [{ finishReason: "STOP" }],
    usageMetadata: {
      promptTokenCount: 3,
      candidatesTokenCount: 6,
      thoughtsTokenCount: 1,
    },
  },
];
const providers = [
  { name: "openai", cls: OpenAIProvider, text: oText, tools: oTools },
  { name: "anthropic", cls: AnthropicProvider, text: aText, tools: aTools },
  { name: "gemini", cls: GeminiProvider, text: gText, tools: gTools },
];
async function collect(adapter: ProviderAdapter, r = req) {
  const result: ProviderEvent[] = [];
  for await (const e of adapter.generate(r, new AbortController().signal))
    result.push(e);
  return result;
}
for (const p of providers) {
  test(`${p.name}: synthetic text streaming, request model/config and function roundtrip`, async () => {
    for (const fixture of [p.text, p.tools]) {
      let request: any, url: string, headers: any;
      const adapter = new p.cls({
        apiKey: "synthetic-test-key",
        fetcher: (async (u, opts) => {
          url = String(u);
          headers = opts!.headers;
          request = JSON.parse(opts!.body as string);
          return fragmentedResponse(fixture, 2);
        }) as typeof fetch,
      });
      const events = await collect(adapter);
      assert.equal(request.model ?? req.upstreamModel, "admin-model-id");
      assert.equal(events.at(-1)!.type, "final");
      const deltas = events.filter((e) => e.type === "delta") as any[];
      if (fixture === p.text) {
        assert.equal(deltas.map((e) => e.content ?? "").join(""), "Hi");
        assert.equal((events.at(-1) as any).finishReason, "stop");
      } else {
        assert.equal(
          deltas
            .flatMap((e) => e.tool_calls ?? [])
            .map((c) => c.function?.arguments ?? "")
            .join(""),
          '{"amount":1}',
        );
        assert.equal((events.at(-1) as any).finishReason, "tool_calls");
      }
      assert.equal(
        JSON.stringify(request).includes("synthetic-test-key"),
        false,
      );
      if (p.name === "gemini") assert.equal(url!.includes("key="), false);
    }
  });
  test(`${p.name}: upstream errors sanitized, timeout/cancellation passed through`, async () => {
    for (const status of [401, 429, 503]) {
      const adapter = new p.cls({
        apiKey: "synthetic-secret",
        fetcher: (async () =>
          new Response("SECRET provider key and prompt", {
            status,
          })) as typeof fetch,
      });
      await assert.rejects(
        () => collect(adapter),
        (e: any) =>
          e instanceof UpstreamError &&
          e.status === status &&
          !e.message.includes("SECRET"),
      );
    }
    const controller = new AbortController();
    controller.abort();
    const adapter = new p.cls({
      apiKey: "test",
      fetcher: (async (_u, opts) => {
        assert.equal(opts!.signal, controller.signal);
        controller.signal.throwIfAborted();
        return fragmentedResponse([]);
      }) as typeof fetch,
    });
    await assert.rejects(async () => {
      for await (const _e of adapter.generate(req, controller.signal)) {
      }
    });
  });
  test(`${p.name}: incomplete upstream stream is rejected`, async () => {
    const fixture =
      p.name === "openai"
        ? p.text.slice(0, -1)
        : p.name === "anthropic"
          ? p.text.slice(0, -1)
          : gText.slice(0, 1);
    await assert.rejects(() =>
      collect(
        new p.cls({
          apiKey: "test",
          fetcher: (async () => fragmentedResponse(fixture)) as typeof fetch,
        }),
      ),
    );
  });
}
test("Gemini preserves signatures and original function IDs through continuation replay", async () => {
  const adapter = new GeminiProvider({
    apiKey: "test",
    fetcher: (async () => fragmentedResponse(gTools)) as typeof fetch,
  });
  const events = await collect(adapter);
  const state = (events.at(-1) as any).continuation;
  assert.equal(state[0].thoughtSignature, "synthetic-signature");
  assert.equal((events.at(-1) as any).usage.output, 7);
  const replay = {
    ...req,
    messages: [
      ...userMessages,
      { role: "assistant" as const, content: null, tool_calls: [call] },
      { role: "tool" as const, content: '{"ok":true}', tool_call_id: "c1" },
    ],
    continuations: new Map([[1, state]]),
  };
  const body = geminiBody(replay);
  assert.equal(
    body.contents[1].parts[0].thoughtSignature,
    "synthetic-signature",
  );
  assert.equal(body.contents[2].parts[0].functionResponse.id, "c1");
  assert.equal(
    body.contents[2].parts[0].functionResponse.name,
    "demo_increment",
  );
});
test("Gemini emits no state when no provider metadata needed; thought text rejected", async () => {
  assert.equal(
    (
      await collect(
        new GeminiProvider({
          apiKey: "test",
          fetcher: (async () => fragmentedResponse(gText)) as typeof fetch,
        }),
      )
    ).at(-1)!.type,
    "final",
  );
  await assert.rejects(() =>
    collect(
      new GeminiProvider({
        apiKey: "test",
        fetcher: (async () =>
          fragmentedResponse([
            {
              candidates: [
                {
                  content: { parts: [{ thought: true, text: "hidden" }] },
                  finishReason: "STOP",
                },
              ],
            },
          ])) as typeof fetch,
      }),
    ),
  );
});
test("Anthropic tools map IDs and combine consecutive tool results without hidden reasoning", () => {
  const r = {
    ...req,
    messages: [
      ...userMessages,
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [call, { ...call, id: "c2" }],
      },
      { role: "tool" as const, content: "one", tool_call_id: "c1" },
      { role: "tool" as const, content: "two", tool_call_id: "c2" },
    ],
  };
  const body = anthropicBody(r);
  assert.equal(body.messages.length, 3);
  assert.equal(body.messages[2].content[0].tool_use_id, "c1");
  assert.equal(body.messages[2].content[1].tool_use_id, "c2");
  assert.equal("thinking" in body, false);
});
test("OpenAI adapter removes gateway state before upstream request", async () => {
  let body: any;
  await collect(
    new OpenAIProvider({
      apiKey: "test",
      fetcher: (async (_u, opts) => {
        body = JSON.parse(opts!.body as string);
        return fragmentedResponse(oText);
      }) as typeof fetch,
    }),
    {
      ...req,
      messages: [
        ...userMessages,
        { role: "assistant", content: "text", x_gateway_state: "opaque" },
      ],
    },
  );
  assert.equal("x_gateway_state" in body.messages[1], false);
});
test("Gemini retains signature-only terminal parts and unsigned provider call IDs", async () => {
  for (const part of [
    { thoughtSignature: "terminal-signature" },
    {
      functionCall: {
        id: "provider-id",
        name: "demo_increment",
        args: { amount: 1 },
      },
    },
  ]) {
    const response = [
      { candidates: [{ content: { parts: [part] }, finishReason: "STOP" }] },
    ];
    const final = (
      await collect(
        new GeminiProvider({
          apiKey: "test",
          fetcher: (async () => fragmentedResponse(response)) as typeof fetch,
        }),
      )
    ).at(-1) as any;
    assert.deepEqual(final.continuation, [part]);
  }
});
