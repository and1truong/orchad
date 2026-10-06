import { createInterface } from "node:readline";
import { startCompanion } from "./server.js";
const origins = (process.env.LIME_EXTENSION_ORIGINS || "")
  .split(",")
  .filter(Boolean);
const port = Number(process.env.LIME_COMPANION_PORT || 4312);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid loopback port");
// Durable runner: off unless all three gateway fields are provided. Token
// comes from the environment only — it is handed to the runner in memory and
// never written anywhere.
const gateway = {
  baseUrl: process.env.LIME_GATEWAY_URL || "",
  token: process.env.LIME_GATEWAY_TOKEN || "",
  model: process.env.LIME_GATEWAY_MODEL || "",
};
const storagePath =
  process.env.LIME_DURABLE_DB ||
  `${process.env.HOME}/.local/share/lime/runs.db`;
const idempotentTools = (process.env.LIME_IDEMPOTENT_TOOLS || "")
  .split(",")
  .filter(Boolean);
const companion = await startCompanion({
  extensionOrigins: origins,
  port,
  durable:
    gateway.baseUrl && gateway.token && gateway.model
      ? { storagePath, gateway, idempotentTools }
      : undefined,
});
console.log(
  `Lime companion listening on http://127.0.0.1:${companion.port}/mcp. Type pair to initiate pairing; revoke CLIENT_ID to revoke.`,
);
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
terminal.on("line", (line) => {
  if (line.trim() === "pair") {
    const p = companion.beginPairing();
    console.log("One-time pairing code (expires in 60 seconds): " + p.code);
  } else if (line.startsWith("revoke ")) {
    companion.revoke(line.slice(7).trim());
    console.log("Revocation requested");
  }
});
process.on("SIGINT", () => {
  terminal.close();
  void companion.close().then(() => process.exit(0));
});
