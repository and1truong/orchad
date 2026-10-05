import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runAgentTurn,
  type AgentEvent,
  type Result,
  type ToolDescriptor,
} from "@orchard/agent-client";
import { CounterFixture } from "../fixtures/counter.js";
import { HostPolicy, type Approval } from "../src/host/policy.js";

// Integrated path: real Mango gateway (mock-scripted provider) ↔ real
// @orchard/agent-client ↔ real HostPolicy ↔ CounterFixture (Guava-backend
// stand-in). Runs fully offline.

const lime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mango = path.join(lime, "..", "mango");

type Gateway = { url: string; token: string; stop: () => Promise<void> };

async function startGateway(script: unknown[]): Promise<Gateway> {
  const dir = mkdtempSync(path.join(tmpdir(), "lime-mango-"));
  const scriptFile = path.join(dir, "script.json");
  writeFileSync(scriptFile, JSON.stringify(script));
  const env = {
    ...process.env,
    SQLITE_PATH: path.join(dir, "mango.sqlite"),
    HOST: "127.0.0.1",
    PORT: "0",
    MODELS_FILE: "",
    MOCK_SCRIPT_FILE: scriptFile,
    NODE_ENV: "development",
  };
  const token = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/token-cli.ts", "issue", "e2e-lime", "mock-scripted"],
    { cwd: mango, env, encoding: "utf8" },
  ).trim();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/main.ts"],
    { cwd: mango, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const url = await new Promise<string>((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("mango startup timeout: " + buf.slice(-2000)));
    }, 30_000);
    const pump = (d: Buffer) => {
      buf += d;
      const m = buf.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    child.stdout.on("data", pump);
    child.stderr.on("data", pump);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`mango exited ${code}: ${buf.slice(-2000)}`));
    });
  });
  return {
    url,
    token,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once("exit", () => {
          rmSync(dir, { recursive: true, force: true });
          resolve();
        });
        child.kill("SIGINT");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }),
  };
}

function host(approve: (a: Approval, s: AbortSignal) => Promise<boolean>) {
  const fixture = new CounterFixture();
  const controller = new AbortController();
  const policy = new HostPolicy(
    fixture,
    {
      clientId: "e2e",
      sessionId: "s1",
      target: { ...fixture.target },
      reads: new Set(["demo_read"]),
    },
    approve,
    controller.signal,
  );
  const dispatched: { name: string; arguments: unknown; read: boolean }[] = [];
  let description: { tools: ToolDescriptor[] };
  let revision = 0;
  const executeTool = async (
    name: string,
    args: Record<string, unknown>,
    toolCallId: string,
  ): Promise<Result> => {
    const tool = description.tools.find((t) => t.name === name);
    const read = tool?.effect === "read";
    dispatched.push({ name, arguments: args, read });
    // Same envelope the sidepanel builds: reads carry no revision or
    // idempotency key, writes pin the latest revision and get a fresh key.
    const result = await policy.call({
      requestId: toolCallId,
      documentId: fixture.target.documentId,
      toolName: name,
      arguments: args,
      expectedRevision: read ? null : revision,
      idempotencyKey: read ? null : crypto.randomUUID(),
    });
    if (Number.isInteger(result.revision)) revision = result.revision!;
    return result as unknown as Result;
  };
  return {
    fixture,
    controller,
    policy,
    dispatched,
    executeTool,
    async describe() {
      description = (await fixture.describe()) as { tools: ToolDescriptor[] };
      revision = (await fixture.getContext()).revision;
      return description;
    },
  };
}

test("real Mango drives consent → approval → tool dispatch with sealed state", async (t) => {
  const gw = await startGateway([
    {
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "demo_increment", arguments: '{"amount":1}' },
        },
      ],
      continuation: { turn: 1 },
    },
    { content: "Counter incremented.", continuation: { turn: 2 } },
  ]);
  t.after(() => gw.stop());
  const approvals: Approval[] = [];
  const h = host(async (a) => {
    approvals.push(a);
    return true;
  });
  const description = await h.describe();
  const events: AgentEvent[] = [];
  const result = await runAgentTurn({
    gatewayBaseUrl: gw.url,
    gatewayToken: gw.token,
    model: "mock-scripted",
    messages: [{ role: "user", content: "Increment the counter once" }],
    tools: description.tools,
    executeTool: h.executeTool,
    onEvent: (e) => events.push(e),
  });
  assert.equal(result.finishReason, "completed");
  assert.equal(h.fixture.value, 1);
  assert.equal(h.fixture.calls, 1);
  // Approval bound to the write call exactly once.
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].call.toolName, "demo_increment");
  // One dispatch, complete arguments only (streamed 3-char deltas must not
  // trigger a partial dispatch).
  assert.equal(h.dispatched.length, 1);
  assert.deepEqual(h.dispatched[0].arguments, { amount: 1 });
  // Sealed continuation preserved on the assistant message.
  const assistant = result.messages.find((m) => m.role === "assistant");
  assert.equal(typeof assistant?.x_gateway_state, "string");
  const kinds = events.map((e) => e.type);
  assert.ok(kinds.includes("tool_requested"));
  assert.ok(kinds.includes("tool_completed"));
  assert.equal(kinds.lastIndexOf("completed"), kinds.length - 1);
  // Replaying history (opaque state back to the gateway) validates cleanly.
  const again = await runAgentTurn({
    gatewayBaseUrl: gw.url,
    gatewayToken: gw.token,
    model: "mock-scripted",
    messages: result.messages,
    tools: description.tools,
    executeTool: h.executeTool,
  });
  assert.equal(again.finishReason, "completed");
});

test("denied approval becomes APPROVAL_DENIED with zero page dispatch", async (t) => {
  const gw = await startGateway([
    {
      toolCalls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "demo_increment", arguments: '{"amount":1}' },
        },
      ],
    },
    { content: "Understood, nothing was changed." },
  ]);
  t.after(() => gw.stop());
  const h = host(async () => false);
  const description = await h.describe();
  const events: AgentEvent[] = [];
  const result = await runAgentTurn({
    gatewayBaseUrl: gw.url,
    gatewayToken: gw.token,
    model: "mock-scripted",
    messages: [{ role: "user", content: "Increment the counter once" }],
    tools: description.tools,
    executeTool: h.executeTool,
    onEvent: (e) => events.push(e),
  });
  assert.equal(result.finishReason, "completed");
  assert.equal(h.fixture.calls, 0);
  assert.equal(h.fixture.value, 0);
  const completed = events.find((e) => e.type === "tool_completed");
  assert.equal(
    completed?.type === "tool_completed" &&
      completed.payload.result.error?.code,
    "APPROVAL_DENIED",
  );
});

test("cancellation aborts the turn before any page dispatch", async (t) => {
  const gw = await startGateway([{ delayMs: 5_000, content: "too late" }]);
  t.after(() => gw.stop());
  const h = host(async () => true);
  const description = await h.describe();
  const controller = new AbortController();
  const running = runAgentTurn({
    gatewayBaseUrl: gw.url,
    gatewayToken: gw.token,
    model: "mock-scripted",
    messages: [{ role: "user", content: "Increment" }],
    tools: description.tools,
    executeTool: h.executeTool,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 150);
  const result = await running;
  assert.equal(result.finishReason, "cancelled");
  assert.equal(h.fixture.calls, 0);
});
