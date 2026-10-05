import { SqliteStore } from "./store.js";
import { createGateway } from "./server.js";
import { environmentConfig } from "./config.js";
const config = environmentConfig();
const store = new SqliteStore(process.env.SQLITE_PATH ?? "mango.sqlite", true);
const app = createGateway({
  ...config,
  store,
  logger: true,
  debugContent: process.env.DEBUG_CONTENT === "true",
  retryBudget: 0,
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  store.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
try {
  await app.listen({
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 4311),
  });
} catch {
  await shutdown();
  process.exitCode = 1;
}
