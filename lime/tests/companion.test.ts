import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startCompanion } from "../src/companion/server.js";
import { CounterFixture } from "../fixtures/counter.js";
import { HostPolicy } from "../src/host/policy.js";
import { success, type Result } from "../src/shared/contract.js";
const origin = "chrome-extension://" + "a".repeat(32);
function inbox(ws: WebSocket) {
  const queue: any[] = [],
    waiters: ((m: any) => void)[] = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    const w = waiters.shift();
    w ? w(m) : queue.push(m);
  });
  return () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : new Promise<any>((resolve) => waiters.push(resolve));
}
test("real MCP SDK over Streamable HTTP and authenticated WebSocket to shared fixture policy", async (t) => {
  const fixture = new CounterFixture();
  let approved = true,
    hold = false,
    cancellations = 0;
  const ctl = new AbortController();
  const policy = new HostPolicy(
    fixture,
    {
      clientId: "external-test",
      sessionId: "s",
      target: { ...fixture.target },
      sessionEpoch: null,
      reads: new Set(["demo_read"]),
    },
    async () => approved,
    ctl.signal,
  );
  const companion = await startCompanion({
    port: 0,
    extensionOrigins: [origin],
    requestTimeoutMs: 2000,
  });
  const url = `http://127.0.0.1:${companion.port}/mcp`,
    wsUrl = `ws://127.0.0.1:${companion.port}/bridge`;
  let ws = new WebSocket(wsUrl, { origin });
  let next = inbox(ws);
  await once(ws, "open");
  const code = companion.beginPairing();
  ws.send(
    JSON.stringify({
      type: "pair",
      code: code.code,
      targets: [fixture.target],
    }),
  );
  assert.equal((await next()).type, "confirmation");
  ws.send(JSON.stringify({ type: "confirm", accept: true }));
  const paired = await next();
  assert.equal(paired.type, "paired");
  assert.notEqual(paired.mcpToken, paired.bridgeToken);
  function serve(socket: WebSocket) {
    socket.on("message", async (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "cancel") {
        cancellations++;
        return;
      }
      if (m.type !== "request" || hold) return;
      let result: Result;
      const a = m.arguments;
      if (m.name === "host_list_targets")
        result = success({ targets: [fixture.target] });
      else if (m.name === "host_get_context") result = await policy.context();
      else if (m.name === "host_list_tools") result = await policy.tools();
      else result = await policy.call(a.call);
      if (socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({ type: "response", requestId: m.requestId, result }),
        );
    });
  }
  serve(ws);
  const client = new Client({ name: "lime-sdk-integration", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: "Bearer " + paired.mcpToken } },
  });
  await client.connect(transport);
  const invoke = (overrides: Record<string, unknown> = {}) =>
    client.callTool({
      name: "host_call_tool",
      arguments: {
        targetId: fixture.target.targetId,
        pageInstanceId: "fixture-page-0",
        call: {
          requestId: crypto.randomUUID(),
          documentId: "demo-document",
          toolName: "demo_increment",
          arguments: { amount: 1 },
          expectedRevision: 0,
          idempotencyKey: "key-1",
          ...overrides,
        },
      },
    });
  try {
    await t.test(
      "SDK initialization tools/list context describe and scoped targets",
      async () => {
        assert.equal((await client.listTools()).tools.length, 4);
        assert.equal(
          (
            await client.callTool({
              name: "host_get_context",
              arguments: {
                targetId: fixture.target.targetId,
                pageInstanceId: "fixture-page-0",
              },
            })
          ).isError,
          false,
        );
        assert.equal(
          (
            await client.callTool({
              name: "host_list_tools",
              arguments: {
                targetId: fixture.target.targetId,
                pageInstanceId: "fixture-page-0",
              },
            })
          ).isError,
          false,
        );
        assert.equal(
          (await client.callTool({ name: "host_list_targets", arguments: {} }))
            .isError,
          false,
        );
      },
    );
    await t.test(
      "approved write duplicate and conflict via actual SDK",
      async () => {
        const r = await invoke();
        assert.deepEqual((r.structuredContent as Result).data, {
          value: 1,
          revision: 1,
        });
        assert.equal(r.isError, false);
        assert.deepEqual(
          JSON.parse((r as { content: { text: string }[] }).content[0].text),
          r.structuredContent,
        );
        assert.equal((await invoke()).isError, false);
        assert.equal(fixture.value, 1);
        assert.equal(
          (
            (await invoke({ arguments: { amount: 2 } }))
              .structuredContent as Result
          ).error?.code,
          "IDEMPOTENCY_CONFLICT",
        );
        assert.equal(
          (
            (await invoke({ idempotencyKey: "key-2" }))
              .structuredContent as Result
          ).error?.code,
          "STALE_CONTEXT",
        );
      },
    );
    await t.test("denied MCP write does not dispatch", async () => {
      approved = false;
      const before = fixture.calls;
      const r = await invoke({ expectedRevision: 1, idempotencyKey: "deny" });
      assert.equal(
        (r.structuredContent as Result).error?.code,
        "APPROVAL_DENIED",
      );
      assert.equal(fixture.calls, before);
      approved = true;
    });
    await t.test("no external approved flag or target escape", async () => {
      const r = await invoke({ approved: true });
      assert.equal(
        (r.structuredContent as Result).error?.code,
        "INVALID_ARGUMENT",
      );
      const outside = await client.callTool({
        name: "host_get_context",
        arguments: { targetId: "outside", pageInstanceId: "fixture-page-0" },
      });
      assert.equal(
        (outside.structuredContent as Result).error?.code,
        "FORBIDDEN",
      );
    });
    await t.test(
      "every MCP HTTP request authenticates and rejects forged Origin Host and URL token",
      async () => {
        for (const [headers, status] of [
          [{}, 401],
          [{ Authorization: "Bearer " + paired.bridgeToken }, 401],
          [
            {
              Authorization: "Bearer " + paired.mcpToken,
              Origin: "https://evil.example",
            },
            403,
          ],
        ] as const) {
          assert.equal((await fetch(url, { headers })).status, status);
        }
        const status = await new Promise<number>((resolve) => {
          const req = httpRequest(
            url,
            {
              headers: {
                Authorization: "Bearer " + paired.mcpToken,
                Host: "evil.example",
              },
            },
            (res) => {
              res.resume();
              resolve(res.statusCode!);
            },
          );
          req.end();
        });
        assert.equal(status, 403);
        assert.equal(
          (await fetch(url + "?token=" + paired.mcpToken)).status,
          404,
        );
      },
    );
    await t.test(
      "forged WebSocket origin and oversized HTTP request",
      async () => {
        const forged = new WebSocket(wsUrl, { origin: "https://evil.example" });
        forged.on("error", () => {});
        const denied = await new Promise<number>((resolve) =>
          forged.on("unexpected-response", (_req, res) => {
            res.resume();
            resolve(res.statusCode!);
            forged.terminate();
          }),
        );
        assert.equal(denied, 403);
        assert.equal(
          (
            await fetch(url, {
              method: "POST",
              headers: {
                Authorization: "Bearer " + paired.mcpToken,
                "Content-Type": "application/json",
              },
              body: "x".repeat(70000),
            })
          ).status,
          413,
        );
      },
    );
    await t.test(
      "disconnect gives unknown outcome and reconnect does not replay",
      async () => {
        hold = true;
        const count = fixture.calls;
        const pending = invoke({
          expectedRevision: 1,
          idempotencyKey: "no-replay",
        });
        await new Promise((r) => setTimeout(r, 40));
        ws.close();
        const r = await pending;
        assert.equal((r.structuredContent as Result).error?.code, "INTERNAL");
        ws = new WebSocket(wsUrl, { origin });
        next = inbox(ws);
        await once(ws, "open");
        ws.send(JSON.stringify({ type: "auth", token: paired.bridgeToken }));
        assert.equal((await next()).type, "authenticated");
        hold = false;
        serve(ws);
        await new Promise((r) => setTimeout(r, 40));
        assert.equal(fixture.calls, count);
        assert.equal(
          (
            await client.callTool({
              name: "host_get_context",
              arguments: {
                targetId: fixture.target.targetId,
                pageInstanceId: "fixture-page-0",
              },
            })
          ).isError,
          false,
        );
      },
    );
    await t.test("SDK cancellation propagates across bridge", async () => {
      hold = true;
      const controller = new AbortController();
      const request = client.callTool(
        {
          name: "host_get_context",
          arguments: {
            targetId: fixture.target.targetId,
            pageInstanceId: "fixture-page-0",
          },
        },
        undefined,
        { signal: controller.signal },
      );
      const checked = assert.rejects(request);
      await new Promise((r) => setTimeout(r, 30));
      controller.abort();
      await checked;
      for (let i = 0; i < 30 && cancellations === 0; i++)
        await new Promise((r) => setTimeout(r, 10));
      assert.ok(cancellations > 0);
      hold = false;
    });
    await t.test(
      "revoked pairing invalidates existing MCP credential",
      async () => {
        companion.revoke(paired.clientId);
        assert.equal(
          (
            await fetch(url, {
              headers: { Authorization: "Bearer " + paired.mcpToken },
            })
          ).status,
          401,
        );
      },
    );
  } finally {
    await client.close();
    ws.terminate();
    await companion.close();
  }
});
