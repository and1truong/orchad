import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { StateCodec } from "../src/state.js";
import { SqliteStore } from "../src/store.js";
import { setup, request } from "./helpers.js";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("state bound to principal/provider/model/message and authenticated; expiration", () => {
  const key = randomBytes(32),
    codec = new StateCodec(key),
    message = { role: "assistant" as const, content: "public" };
  const token = codec.seal("alice", "gemini", "a", message, { sig: "fixture" });
  assert.deepEqual(codec.open(token, "alice", "gemini", "a", message), {
    sig: "fixture",
  });
  for (const [p, provider, model] of [
    ["bob", "gemini", "a"],
    ["alice", "openai", "a"],
    ["alice", "gemini", "b"],
  ])
    assert.throws(() => codec.open(token, p, provider, model, message));
  assert.throws(() =>
    codec.open(token, "alice", "gemini", "a", {
      ...message,
      content: "changed",
    }),
  );
  const expired = new StateCodec(key, -1).seal(
    "alice",
    "gemini",
    "a",
    message,
    {},
  );
  assert.throws(() => codec.open(expired, "alice", "gemini", "a", message));
});
test("reservation is atomic across connections; crash recovery charges unknown usage", () => {
  const dir = mkdtempSync(join(tmpdir(), "mango-ledger-"));
  const path = join(dir, "ledger.sqlite");
  const a = new SqliteStore(path);
  try {
    const p = {
      id: "p",
      models: ["mock-scripted"],
      rpm: 3,
      concurrency: 2,
      quota: 100,
    };
    a.provision(p);
    assert.equal(a.reserve("r1", p, 70), true);
    const b = new SqliteStore(path);
    try {
      assert.equal(b.reserve("r2", p, 70), false);
      assert.equal(
        a.db.prepare("SELECT COUNT(*) AS n FROM reservations").get()!.n,
        1,
      );
    } finally {
      b.close();
    }
    a.close();
    const recovered = new SqliteStore(path, true);
    try {
      assert.equal(
        recovered.db.prepare("SELECT spent FROM principals").get()!.spent,
        70,
      );
      const usage = recovered.db.prepare("SELECT * FROM usage").get()!;
      assert.equal(usage.status, "interrupted");
      assert.equal(usage.input_tokens, null);
      assert.equal(usage.output_tokens, null);
      assert.equal(usage.usage_status, "unknown");
    } finally {
      recovered.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("no retry after streaming content or observing a tool call; budgeted pre-output retries", async () => {
  for (const kind of ["before", "text", "tool"]) {
    let attempts = 0;
    const adapter = {
      name: "mock",
      async *generate(): AsyncGenerator<any> {
        attempts++;
        if (attempts === 1) {
          if (kind === "text") yield { type: "delta", content: "first" };
          if (kind === "tool")
            yield {
              type: "delta",
              tool_calls: [
                { index: 0, id: "c", function: { name: "x", arguments: "" } },
              ],
            };
          const { UpstreamError } = await import("../src/providers/types.js");
          throw new UpstreamError(503, true);
        }
        yield { type: "delta", content: "done" };
        yield {
          type: "final",
          finishReason: "stop",
          usage: { input: 1, output: 1 },
        };
      },
    };
    const s = await setup(undefined, { adapters: [adapter], retryBudget: 1 });
    try {
      await s.app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: s.headers,
        payload: { ...request, stream: true },
      });
      assert.equal(attempts, kind === "before" ? 2 : 1);
    } finally {
      await s.close();
    }
  }
});
test("default structured logs redact bearer, cookies, prompt, tool results and provider exceptions", async () => {
  const script = `import {setup,request} from './tests/helpers.ts';
 const adapter={name:'mock',async *generate(){throw new Error('PROVIDER_SECRET_CANARY');}};
 const s=await setup(undefined,{logger:true,adapters:[adapter]});
 await s.app.inject({method:'POST',url:'/v1/chat/completions',headers:{...s.headers,cookie:'COOKIE_SECRET_CANARY'},payload:{...request,messages:[{role:'user',content:'PROMPT_SECRET_CANARY'}]}});
 await s.app.inject({method:'POST',url:'/v1/chat/completions',headers:{...s.headers,cookie:'COOKIE_SECRET_CANARY'},payload:{...request,messages:[{role:'assistant',content:null,tool_calls:[{id:'c',type:'function',function:{name:'x',arguments:'{}'}}]},{role:'tool',tool_call_id:'c',content:'TOOL_RESULT_SECRET_CANARY'}]}});
 await s.close();process.stderr.write(s.token);`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "",
    secret = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (secret += d));
  const status = await new Promise((r) => child.once("close", r));
  assert.equal(status, 0);
  assert.ok(out.includes("Inference finished"));
  for (const canary of [
    "COOKIE_SECRET_CANARY",
    "PROMPT_SECRET_CANARY",
    "TOOL_RESULT_SECRET_CANARY",
    "PROVIDER_SECRET_CANARY",
    secret,
  ])
    assert.equal(out.includes(canary), false);
});
