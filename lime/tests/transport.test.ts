import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CompanionTransport, type Paired } from "../src/extension/companion-transport.js";
import { startCompanion } from "../src/companion/server.js";
import { CounterFixture } from "../fixtures/counter.js";
import { HostPolicy } from "../src/host/policy.js";
import { failure, type Result } from "../src/shared/contract.js";
// Real extension-side transport against the real companion. The undici global
// WebSocket cannot set headers, so patch it with a ws subclass that injects
// the allowlisted extension Origin the server requires.
const origin = "chrome-extension://" + "a".repeat(32);
class TestSocket extends WebSocket {
  constructor(url: string) {
    super(url, { origin });
  }
}
const native = globalThis.WebSocket;
(globalThis as { WebSocket: unknown }).WebSocket = TestSocket;
test.after(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = native;
});
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
test("real CompanionTransport: pairing, routed calls, cancel, reconnect, revoke", async () => {
  const fixture = new CounterFixture();
  const ctl = new AbortController();
  const policy = new HostPolicy(
    fixture,
    {
      clientId: "transport-test",
      sessionId: "s",
      target: { ...fixture.target },
      reads: new Set(["demo_read"]),
    },
    async () => true,
    ctl.signal,
  );
  const companion = await startCompanion({
    port: 0,
    extensionOrigins: [origin],
    requestTimeoutMs: 5000,
  });
  const wsUrl = `ws://127.0.0.1:${companion.port}/bridge`,
    mcpUrl = `http://127.0.0.1:${companion.port}/mcp`;
  const flow: {
    confirm: (() => void) | null;
    paired: Paired | null;
  } = { confirm: null, paired: null };
  let holdRoutes = false,
    routed = 0;
  const states: string[] = [],
    aborted: string[] = [];
  const transport = new CompanionTransport(
    (s) => states.push(s),
    (yes) => {
      flow.confirm = yes;
    },
    (p) => (flow.paired = p),
    async (clientId, name, args, signal): Promise<Result> => {
      routed++;
      signal.addEventListener("abort", () => aborted.push(name), {
        once: true,
      });
      if (holdRoutes)
        return new Promise<Result>((resolve) => {
          const end = () => resolve(failure("CANCELLED", "aborted"));
          if (signal.aborted) end();
          else signal.addEventListener("abort", end, { once: true });
        });
      if (name === "host_get_context") return policy.context(signal);
      if (name === "host_call_tool")
        return policy.call((args as { call: unknown }).call, signal);
      return failure("UNSUPPORTED", "test route");
    },
  );
  try {
    // Pairing handshake: code -> confirmation -> user confirm -> paired.
    const code = companion.beginPairing();
    transport.connect(wsUrl, code.code, [fixture.target]);
    for (let i = 0; i < 50 && !flow.confirm; i++) await tick(20);
    assert.ok(flow.confirm, "confirmation prompt reached the sidebar");
    flow.confirm();
    for (let i = 0; i < 50 && !flow.paired; i++) await tick(20);
    assert.ok(flow.paired, "paired credentials delivered");
    const creds = flow.paired;
    assert.notEqual(creds.mcpToken, creds.bridgeToken);
    assert.equal(states.at(-1), "connected");
    // Real MCP SDK -> companion -> bridge -> real transport -> shared policy.
    const client = new Client({ name: "transport-int", version: "0.1.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpUrl), {
        requestInit: { headers: { Authorization: "Bearer " + creds.mcpToken } },
      }),
    );
    const ctx = await client.callTool({
      name: "host_get_context",
      arguments: {
        targetId: fixture.target.targetId,
        pageInstanceId: fixture.target.pageInstanceId,
      },
    });
    assert.equal(ctx.isError, false);
    const outside = await client.callTool({
      name: "host_get_context",
      arguments: { targetId: "outside", pageInstanceId: "x" },
    });
    assert.equal(
      (outside.structuredContent as Result).error?.code,
      "FORBIDDEN",
    );
    const write = await client.callTool({
      name: "host_call_tool",
      arguments: {
        targetId: fixture.target.targetId,
        pageInstanceId: fixture.target.pageInstanceId,
        call: {
          requestId: "tr-1",
          documentId: "demo-document",
          toolName: "demo_increment",
          arguments: { amount: 1 },
          expectedRevision: 0,
          idempotencyKey: "tr-key",
        },
      },
    });
    assert.deepEqual((write.structuredContent as Result).data, {
      value: 1,
      revision: 1,
    });
    // SDK cancellation travels the bridge: server sends cancel, transport
    // aborts the in-flight route signal.
    holdRoutes = true;
    const cancelCtl = new AbortController();
    const cancelled = client.callTool(
      {
        name: "host_get_context",
        arguments: {
          targetId: fixture.target.targetId,
          pageInstanceId: fixture.target.pageInstanceId,
        },
      },
      undefined,
      { signal: cancelCtl.signal },
    );
    const rejected = assert.rejects(cancelled);
    await tick(80);
    cancelCtl.abort();
    await rejected;
    for (let i = 0; i < 50 && !aborted.includes("host_get_context"); i++)
      await tick(20);
    assert.ok(aborted.includes("host_get_context"));
    // Disconnect: pending call resolves unknown-outcome; reconnect never replays.
    const before = routed;
    const dropped = client.callTool({
      name: "host_get_context",
      arguments: {
        targetId: fixture.target.targetId,
        pageInstanceId: fixture.target.pageInstanceId,
      },
    });
    await tick(80);
    transport.disconnect();
    assert.equal(
      ((await dropped).structuredContent as Result).error?.code,
      "INTERNAL",
    );
    holdRoutes = false;
    transport.reconnect(wsUrl);
    for (let i = 0; i < 50 && states.at(-1) !== "connected"; i++)
      await tick(20);
    assert.equal(states.at(-1), "connected");
    await tick(80);
    assert.equal(routed, before + 1, "held call aborted once, zero replay");
    const again = await client.callTool({
      name: "host_get_context",
      arguments: {
        targetId: fixture.target.targetId,
        pageInstanceId: fixture.target.pageInstanceId,
      },
    });
    assert.equal(again.isError, false);
    // Revoke: server forgets the pair and the MCP bearer dies with it.
    transport.revoke();
    for (let i = 0; i < 50; i++) {
      if (
        (
          await fetch(mcpUrl, {
            headers: { Authorization: "Bearer " + creds.mcpToken },
          })
        ).status === 401
      )
        break;
      await tick(20);
    }
    assert.equal(
      (
        await fetch(mcpUrl, {
          headers: { Authorization: "Bearer " + creds.mcpToken },
        })
      ).status,
      401,
    );
    await client.close();
  } finally {
    await companion.close();
  }
});
