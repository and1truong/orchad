import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, request } from "./helpers.js";
import { demoTool } from "../fixtures/demo-counter.js";
import type { Message } from "../packages/agent-client/src/protocol.js";
const tool = {
  type: "function",
  function: { name: demoTool.name, parameters: demoTool.inputSchema },
};
const call = {
  id: "call-1",
  type: "function" as const,
  function: { name: demoTool.name, arguments: '{"amount":1}' },
};
test("health, auth, isolation, revoke and hash-only token storage", async () => {
  const s = await setup();
  try {
    assert.deepEqual((await s.app.inject("/health")).json(), { status: "ok" });
    assert.equal((await s.app.inject("/v1/models")).statusCode, 401);
    assert.equal(
      (
        await s.app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          payload: request,
        })
      ).statusCode,
      401,
    );
    s.store.provision(
      {
        id: "empty",
        models: ["not-allowed"],
        rpm: 10,
        concurrency: 1,
        quota: 100,
      },
      "empty-token-at-least-24-characters",
    );
    const listing = await s.app.inject({
      url: "/v1/models",
      headers: { authorization: "Bearer empty-token-at-least-24-characters" },
    });
    assert.equal(listing.json().data.length, 0);
    const models = await s.app.inject({
      url: "/v1/models",
      headers: s.headers,
    });
    assert.equal(
      models.json().data[0].x_gateway_capabilities.functionTools,
      true,
    );
    assert.equal(
      (
        await s.app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: s.headers,
          payload: { ...request, model: "secret" },
        })
      ).statusCode,
      403,
    );
    const result = await s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: request,
    });
    assert.equal(result.statusCode, 200);
    assert.equal(
      result.json().choices[0].message.content,
      "Offline mock response.",
    );
    assert.equal(
      s.store.db.prepare("SELECT principal FROM usage").get()!.principal,
      "alice",
    );
    const row = s.store.db
      .prepare("SELECT hash FROM tokens WHERE principal=?")
      .get("alice");
    assert.notEqual(row!.hash, s.token);
    assert.equal(JSON.stringify(row).includes(s.token), false);
    s.store.revoke(s.token);
    assert.equal(
      (await s.app.inject({ url: "/v1/models", headers: s.headers }))
        .statusCode,
      401,
    );
  } finally {
    await s.close();
  }
});
test("reject unsupported request fields, invalid schema and message ordering", async () => {
  const s = await setup();
  try {
    for (const payload of [
      { ...request, temperature: 1 },
      { ...request, n: 2 },
      { ...request, tenantId: "bob" },
      { ...request, providerBaseUrl: "http://evil" },
      { ...request, max_completion_tokens: 0 },
      {
        ...request,
        messages: [{ role: "tool", content: "x", tool_call_id: "missing" }],
      },
      { ...request, messages: [{ role: "user", content: null }] },
      {
        ...request,
        messages: [{ role: "user", content: "x", x_gateway_state: "x" }],
      },
      {
        ...request,
        tools: [
          {
            ...tool,
            function: {
              ...tool.function,
              parameters: {
                type: "object",
                properties: { x: { $ref: "https://evil" } },
              },
            },
          },
        ],
      },
    ])
      assert.equal(
        (
          await s.app.inject({
            method: "POST",
            url: "/v1/chat/completions",
            headers: s.headers,
            payload,
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (
        await s.app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: s.headers,
          payload: {
            ...request,
            messages: [{ role: "user", content: "x".repeat(520000) }],
          },
        })
      ).statusCode,
      413,
    );
  } finally {
    await s.close();
  }
});
test("rate limit per principal", async () => {
  const s = await setup(undefined, {}, { rpm: 1 });
  try {
    const send = (headers = s.headers) =>
      s.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers,
        payload: request,
      });
    assert.equal((await send()).statusCode, 200);
    assert.equal((await send()).statusCode, 429);
    assert.equal(
      (await send({ authorization: `Bearer ${s.otherToken}` })).statusCode,
      200,
    );
  } finally {
    await s.close();
  }
});
test("concurrency admission and quota reservations", async () => {
  const s = await setup(
    [{ delayMs: 70, content: "done" }],
    {},
    { concurrency: 1 },
  );
  try {
    const first = s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: request,
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      (
        await s.app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: s.headers,
          payload: request,
        })
      ).json().error.code,
      "CONCURRENCY_LIMIT",
    );
    assert.equal((await first).statusCode, 200);
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) AS n FROM reservations").get()!.n,
      0,
    );
  } finally {
    await s.close();
  }
  const q = await setup(undefined, {}, { quota: 1 });
  try {
    const r = await q.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: q.headers,
      payload: request,
    });
    assert.equal(r.json().error.code, "QUOTA_LIMIT");
    assert.equal(
      q.store.db.prepare("SELECT COUNT(*) AS n FROM usage").get()!.n,
      0,
    );
  } finally {
    await q.close();
  }
});
test("unknown and provisional usage remain NULL; conservative quota charge", async () => {
  for (const usage of [
    { input: null, output: null },
    { input: 4, output: null },
  ]) {
    const s = await setup([{ content: "ok", usage }]);
    try {
      const r = await s.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: s.headers,
        payload: request,
      });
      assert.equal(r.json().usage, null);
      const row = s.store.db.prepare("SELECT * FROM usage").get()!;
      assert.equal(row.output_tokens, null);
      assert.equal(
        row.usage_status,
        usage.input === null ? "unknown" : "provisional",
      );
      assert.equal(
        s.store.db
          .prepare("SELECT spent FROM principals WHERE id=?")
          .get("alice")!.spent,
        row.reserved,
      );
    } finally {
      await s.close();
    }
  }
});
test("opaque continuation state replay, tampering, cross-user/model and assistant binding", async () => {
  const captured: any[] = [];
  const s = await setup([
    {
      toolCalls: [call],
      continuation: { signature: "opaque-secret-signature" },
      usage: { input: 5, output: 5 },
    },
    { content: "done" },
  ]);
  try {
    const first = await s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: { ...request, tools: [tool] },
    });
    assert.equal(first.statusCode, 200);
    const assistant = first.json().choices[0].message as Message;
    assert.ok(assistant.x_gateway_state);
    assert.equal(first.body.includes("opaque-secret-signature"), false);
    const messages = [
      ...request.messages,
      assistant,
      { role: "tool", content: '{"ok":true}', tool_call_id: "call-1" },
    ];
    const payload = { ...request, messages, tools: [tool] };
    assert.equal(
      (
        await s.app.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: s.headers,
          payload,
        })
      ).statusCode,
      200,
    );
    for (const [headers, m] of [
      [{ authorization: `Bearer ${s.otherToken}` }, assistant],
      [s.headers, { ...assistant, content: "changed" }],
      [
        s.headers,
        {
          ...assistant,
          x_gateway_state: assistant.x_gateway_state!.slice(0, -2) + "xx",
        },
      ],
    ] as const) {
      assert.equal(
        (
          await s.app.inject({
            method: "POST",
            url: "/v1/chat/completions",
            headers,
            payload: {
              ...payload,
              messages: [request.messages[0], m, messages[2]],
            },
          })
        ).statusCode,
        400,
      );
    }
  } finally {
    await s.close();
  }
});
test("upstream timeout, malformed tool output and incomplete stream fail closed", async () => {
  for (const [script, code] of [
    [[{ delayMs: 100, content: "late" }], 504],
    [
      [
        {
          toolCalls: [
            {
              ...call,
              function: { ...call.function, arguments: '{"amount":' },
            },
          ],
          finishReason: "tool_calls",
        },
      ],
      502,
    ],
    [[{ content: "cut", truncate: true }], 502],
  ] as const) {
    const s = await setup(script as any, { timeoutMs: 20 });
    try {
      const r = await s.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: s.headers,
        payload: { ...request, tools: [tool] },
      });
      assert.equal(r.statusCode, code);
      assert.equal(
        s.store.db.prepare("SELECT COUNT(*) AS n FROM reservations").get()!.n,
        0,
      );
    } finally {
      await s.close();
    }
  }
  const s = await setup([{ content: "partial", truncate: true }]);
  try {
    const r = await s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: { ...request, stream: true },
    });
    assert.ok(r.body.includes("UPSTREAM_ERROR"));
    assert.equal(r.body.includes("[DONE]"), false);
  } finally {
    await s.close();
  }
});
test("CORS allowlist exact; client cannot select provider endpoint or credentials", async () => {
  const s = await setup(undefined, { corsOrigins: ["https://allowed.test"] });
  try {
    assert.equal(
      (
        await s.app.inject({
          url: "/health",
          headers: { origin: "https://evil.test" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await s.app.inject({
          url: "/v1/models",
          headers: { ...s.headers, origin: "https://allowed.test" },
        })
      ).headers["access-control-allow-origin"],
      "https://allowed.test",
    );
    assert.equal(
      (
        await s.app.inject({
          method: "OPTIONS",
          url: "/v1/chat/completions",
          headers: { origin: "https://allowed.test" },
        })
      ).statusCode,
      204,
    );
  } finally {
    await s.close();
  }
});
test("HTTP cancellation propagates to upstream and reconciles admission", async (t) => {
  let aborted = false;
  const adapter = {
    name: "mock",
    async *generate(_r: any, signal: AbortSignal): AsyncGenerator<any> {
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        );
      });
      signal.throwIfAborted();
    },
  };
  const s = await setup(undefined, { adapters: [adapter], timeoutMs: 1000 });
  try {
    let base: string;
    try {
      base = await s.app.listen({ host: "127.0.0.1", port: 0 });
    } catch (e) {
      if ((e as any).code === "EPERM") {
        t.skip(
          "Runtime forbids listening sockets; socket cancellation not exercised",
        );
        return;
      }
      throw e;
    }
    const controller = new AbortController();
    const promise = fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: { ...s.headers, "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    }).catch(() => null);
    await new Promise((r) => setTimeout(r, 30));
    controller.abort();
    await promise;
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(aborted, true);
    assert.equal(
      s.store.db.prepare("SELECT status FROM usage").get()!.status,
      "cancelled",
    );
  } finally {
    await s.close();
  }
});

test("graceful shutdown cancels an in-flight provider and reconciles ledger", async () => {
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  let aborted = false;
  const adapter = {
    name: "mock",
    async *generate(_r: any, signal: AbortSignal): AsyncGenerator<any> {
      started();
      await new Promise<void>((r) =>
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            r();
          },
          { once: true },
        ),
      );
      signal.throwIfAborted();
    },
  };
  const s = await setup(undefined, { adapters: [adapter], timeoutMs: 1000 });
  try {
    const requestPromise = s.app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: s.headers,
      payload: request,
    });
    await ready;
    await s.app.close();
    await requestPromise;
    assert.equal(aborted, true);
    assert.equal(
      s.store.db.prepare("SELECT status FROM usage").get()!.status,
      "cancelled",
    );
  } finally {
    s.store.close();
  }
});
test("configured feature combinations and model output bounds reject explicitly", async () => {
  const { mockModel } = await import("../src/config.js");
  const s = await setup(undefined, {
    models: [
      {
        ...mockModel,
        capabilities: { text: true, streaming: false, functionTools: false },
        maxOutputTokens: 8,
      },
    ],
  });
  try {
    for (const payload of [
      { ...request, stream: true },
      { ...request, tools: [tool] },
      { ...request, max_completion_tokens: 9 },
    ])
      assert.equal(
        (
          await s.app.inject({
            method: "POST",
            url: "/v1/chat/completions",
            headers: s.headers,
            payload,
          })
        ).statusCode,
        400,
      );
  } finally {
    await s.close();
  }
});
