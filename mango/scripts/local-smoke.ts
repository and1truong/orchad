import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "mango-process-"));
const env = {
  ...process.env,
  SQLITE_PATH: join(dir, "ledger.sqlite"),
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  PORT: "0",
  MODELS_FILE: "",
  MOCK_SCRIPT_FILE: "",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  GEMINI_API_KEY: "",
  GATEWAY_STATE_KEY: "",
  DEBUG_CONTENT: "false",
};
const cli = resolve("dist/src/token-cli.js"),
  main = resolve("dist/src/main.js");
const token = spawnSync(
  process.execPath,
  [cli, "issue", "smoke-user", "mock-scripted"],
  { env, encoding: "utf8" },
);
if (token.status !== 0) throw new Error("Token provisioning failed");
const child = spawn(process.execPath, [main], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
const exit = new Promise<number | null>((resolve) =>
  child.once("exit", resolve),
);
try {
  const address = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Server startup timed out")),
      5000,
    );
    child.stdout.on("data", (data) => {
      output += data;
      const match = output.match(
        /Server listening at (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Server exited before readiness"));
    });
  });
  const health = await fetch(address + "/health");
  if (!health.ok || ((await health.json()) as any).status !== "ok")
    throw new Error("Health failed");
  const denied = await fetch(address + "/v1/models");
  if (denied.status !== 401) throw new Error("Authentication failed");
  const result = await fetch(address + "/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.stdout.trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-scripted",
      messages: [{ role: "user", content: "Process smoke" }],
    }),
  });
  if (
    !result.ok ||
    ((await result.json()) as any).choices[0].message.content !==
      "Offline mock response."
  )
    throw new Error("Inference failed");
  child.kill("SIGTERM");
  const code = await exit;
  if (code !== 0) throw new Error("Graceful shutdown failed");
  console.log(
    "Built service smoke passed: health, auth, offline inference, SIGTERM.",
  );
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await exit;
  }
  rmSync(dir, { recursive: true, force: true });
}
