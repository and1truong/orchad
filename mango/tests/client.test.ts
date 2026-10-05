import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runAgentTurn,
  createMockAgentClient,
  type AgentEvent,
  type Message,
  type ToolCall,
} from "../packages/agent-client/src/index.js";
import { setup, userMessages, fragmentedResponse } from "./helpers.js";
import { fakeHost, demoTool } from "../fixtures/demo-counter.js";
const call: ToolCall = {
  id: "call-1",
  type: "function",
  function: { name: "demo_increment", arguments: '{"amount":1}' },
};
const input = {
  gatewayBaseUrl: "http://127.0.0.1:4311",
  gatewayToken: "client-token",
  model: "mock-scripted",
  messages: userMessages,
  tools: [demoTool],
  executeTool: async () => ({
    ok: true,
    revision: 1,
    data: { value: 1 },
    error: null,
  }),
};
const frames = (
  calls: ToolCall[] = [],
  reason = calls.length ? "tool_calls" : "stop",
  state?: string,
) => [
  {
    choices: [
      {
        index: 0,
        delta: {
          content: "Hello",
          tool_calls: calls.map((c, index) => ({
            ...c,
            index,
            function: {
              name: c.function.name,
              arguments: c.function.arguments.slice(0, 5),
            },
          })),
        },
        finish_reason: null,
      },
    ],
  },
  {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: calls.map((c, index) => ({
            index,
            function: { arguments: c.function.arguments.slice(5) },
          })),
          ...(state ? { x_gateway_state: state } : {}),
        },
        finish_reason: reason,
      },
    ],
  },
  "[DONE]",
];
test("portable client against actual gateway over loopback HTTP: tool result roundtrip; server never executes tools", async () => {
  const host = fakeHost();
  const s = await setup([
    {
      toolCalls: [call],
      continuation: { signature: "fixture" },
      usage: { input: 10, output: 5 },
    },
    { content: "Counter incremented.", usage: { input: 20, output: 5 } },
  ]);
  try {
    const url = await s.app.listen({ host: "127.0.0.1", port: 0 });
    const events: AgentEvent[] = [];
    // Request inference alone: no host callback, no counter mutation.
    const inference = await s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: {
        model: "mock-scripted",
        messages: userMessages,
        tools: [
          {
            type: "function",
            function: { name: demoTool.name, parameters: demoTool.inputSchema },
          },
        ],
      },
    });
    assert.equal(inference.statusCode, 200);
    assert.equal(host.context().revision, 0);
    assert.equal(host.dispatches, 0);
    const result = await runAgentTurn({
      ...input,
      gatewayBaseUrl: url,
      gatewayToken: s.token,
      executeTool: async (name, args, id) =>
        host.invoke(
          {
            requestId: id,
            documentId: "demo-document",
            toolName: name,
            arguments: args as { amount: number },
            expectedRevision: 0,
            idempotencyKey: "key-1",
          },
          true,
        ),
      onEvent: (e) => events.push(e),
    });
    assert.equal(result.finishReason, "completed");
    assert.equal(host.context().revision, 1);
    assert.equal(host.dispatches, 1);
    assert.equal(result.messages[1].tool_calls![0].id, "call-1");
    assert.ok(result.messages[1].x_gateway_state);
    assert.equal(result.messages[2].tool_call_id, "call-1");
    assert.equal(result.messages[3].content, "Counter incremented.");
    assert.equal(events.filter((e) => e.type === "completed").length, 1);
  } finally {
    await s.close();
  }
});
test("demo_counter fixture deduplication, conflict, stale revision and denied approval", () => {
  const host = fakeHost();
  const invoke = {
    requestId: "req1",
    documentId: "demo-document",
    toolName: "demo_increment",
    arguments: { amount: 1 },
    expectedRevision: 0,
    idempotencyKey: "key-1",
  };
  assert.equal(host.invoke(invoke, false).error!.code, "APPROVAL_DENIED");
  assert.equal(host.dispatches, 0);
  const first = host.invoke(invoke, true);
  assert.deepEqual(first.data, { value: 1, revision: 1 });
  assert.deepEqual(host.invoke({ ...invoke, requestId: "req2" }, true), first);
  assert.equal(host.context().revision, 1);
  assert.equal(
    host.invoke({ ...invoke, arguments: { amount: 2 } }, true).error!.code,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    host.invoke({ ...invoke, idempotencyKey: "key-2" }, true).error!.code,
    "STALE_CONTEXT",
  );
  assert.equal(host.unsupported().error!.code, "UNSUPPORTED");
});
test("fragmented SSE with tool JSON: validate full turn, preserve state, execute sequentially", async () => {
  let step = 0,
    active = 0;
  const executed: string[] = [],
    requests: any[] = [],
    events: AgentEvent[] = [];
  const client = createMockAgentClient((async (_url, options) => {
    requests.push(JSON.parse(options!.body as string));
    return fragmentedResponse(
      step++ === 0
        ? frames(
            [call, { ...call, id: "call-2" }],
            "tool_calls",
            "opaque-state",
          )
        : frames(),
    );
  }) as typeof fetch);
  const r = await client.runAgentTurn({
    ...input,
    onEvent: (e) => events.push(e),
    executeTool: async (_name, _args, id) => {
      assert.equal(active, 0);
      active++;
      await Promise.resolve();
      executed.push(id);
      active--;
      return { ok: true, revision: 1, data: null, error: null };
    },
  });
  assert.equal(r.finishReason, "completed");
  assert.deepEqual(executed, ["call-1", "call-2"]);
  assert.equal(requests[1].messages[1].x_gateway_state, "opaque-state");
  assert.equal(requests[1].messages[2].tool_call_id, "call-1");
  assert.equal(events.filter((e) => e.type === "completed").length, 1);
});
test("no dispatch on truncated SSE, truncated tool call, bad schema, unknown tool or duplicate IDs", async () => {
  for (const fs of [
    frames([call]).slice(0, -1),
    frames([call], "length"),
    frames([
      { ...call, function: { ...call.function, arguments: '{"amount":' } },
    ]),
    frames([
      {
        ...call,
        function: { ...call.function, arguments: '{"amount":"one"}' },
      },
    ]),
    frames([{ ...call, function: { ...call.function, name: "unknown" } }]),
    frames([call, call]),
  ]) {
    let executed = 0;
    const events: AgentEvent[] = [];
    const c = createMockAgentClient((async () =>
      fragmentedResponse(fs)) as typeof fetch);
    const r = await c.runAgentTurn({
      ...input,
      executeTool: async () => {
        executed++;
        return { ok: true, revision: 1, data: null, error: null };
      },
      onEvent: (e) => events.push(e),
    });
    assert.equal(r.finishReason, "error");
    assert.equal(executed, 0);
    assert.equal(events.filter((e) => e.type === "completed").length, 1);
  }
});
test("tool failure becomes error result and model continues", async () => {
  const requests: any[] = [];
  let n = 0;
  const c = createMockAgentClient((async (_url, opts) => {
    requests.push(JSON.parse(opts!.body as string));
    return fragmentedResponse(n++ === 0 ? frames([call]) : frames());
  }) as typeof fetch);
  const r = await c.runAgentTurn({
    ...input,
    executeTool: async () => {
      throw new Error("host internal secret");
    },
  });
  assert.equal(r.finishReason, "completed");
  const result = JSON.parse(requests[1].messages[2].content);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INTERNAL");
  assert.equal(
    JSON.stringify(requests).includes("host internal secret"),
    false,
  );
});
test("tool and step budgets deterministic; exactly one completed event", async () => {
  for (const config of [{ maxToolCalls: 0 }, { maxSteps: 1 }]) {
    let calls = 0;
    const events: AgentEvent[] = [];
    const c = createMockAgentClient((async () =>
      fragmentedResponse(frames([call]))) as typeof fetch);
    const r = await c.runAgentTurn({
      ...input,
      ...config,
      executeTool: async () => {
        calls++;
        return { ok: true, revision: 1, data: null, error: null };
      },
      onEvent: (e) => events.push(e),
    });
    assert.equal(
      r.finishReason,
      "maxToolCalls" in config ? "tool_limit" : "step_limit",
    );
    assert.equal(calls, "maxToolCalls" in config ? 0 : 1);
    assert.equal(events.filter((e) => e.type === "completed").length, 1);
  }
});
test("auth and transport errors classified separately, no retries", async () => {
  for (const status of [401, 403, 502]) {
    const events: AgentEvent[] = [];
    let calls = 0;
    const c = createMockAgentClient((async () => {
      calls++;
      return new Response("sensitive upstream body", { status });
    }) as typeof fetch);
    const r = await c.runAgentTurn({
      ...input,
      onEvent: (e) => events.push(e),
    });
    assert.equal(r.finishReason, "error");
    assert.equal(
      (events.find((e) => e.type === "error") as any).payload.code,
      status < 500 ? "AUTHENTICATION" : "TRANSPORT",
    );
    assert.equal(calls, 1);
  }
});
test("abort before fetch and while host callback pending; deterministic lifecycle", async () => {
  for (const pendingHost of [false, true]) {
    const controller = new AbortController(),
      events: AgentEvent[] = [];
    let executions = 0;
    const c = createMockAgentClient((async () =>
      fragmentedResponse(frames([call]))) as typeof fetch);
    if (!pendingHost) controller.abort();
    const r = await c.runAgentTurn({
      ...input,
      signal: controller.signal,
      onEvent: (e) => events.push(e),
      executeTool: () => {
        executions++;
        queueMicrotask(() => controller.abort());
        return new Promise(() => {});
      },
    });
    assert.equal(r.finishReason, "cancelled");
    assert.equal(executions, pendingHost ? 1 : 0);
    assert.equal(events.filter((e) => e.type === "completed").length, 1);
  }
});
test("observer exceptions do not alter tool execution or cleanup", async () => {
  let n = 0;
  const c = createMockAgentClient((async () =>
    fragmentedResponse(n++ === 0 ? frames([call]) : frames())) as typeof fetch);
  assert.equal(
    (
      await c.runAgentTurn({
        ...input,
        onEvent: () => {
          throw new Error("observer");
        },
      })
    ).finishReason,
    "completed",
  );
});
test("abort on tool_requested prevents host dispatch", async () => {
  const controller = new AbortController();
  let executions = 0;
  const client = createMockAgentClient((async () =>
    fragmentedResponse(frames([call]))) as typeof fetch);
  const r = await client.runAgentTurn({
    ...input,
    signal: controller.signal,
    onEvent: (e) => {
      if (e.type === "tool_requested") controller.abort();
    },
    executeTool: async () => {
      executions++;
      return { ok: true, revision: 1, data: null, error: null };
    },
  });
  assert.equal(r.finishReason, "cancelled");
  assert.equal(executions, 0);
});
