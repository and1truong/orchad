import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteStore } from "../../../mango/src/store.js";
import { createGateway } from "../../../mango/src/server.js";
import { MockProvider } from "../../../mango/src/providers/mock.js";
import { mockModel } from "../../../mango/src/config.js";
import type { ScriptTurn } from "../../../mango/src/providers/types.js";
import type { ToolCall } from "@orchard/agent-client";

export const MODEL = "mock-scripted";

export const incrCall = (id = "call-1", args = '{"amount":1}'): ToolCall => ({
  id,
  type: "function",
  function: { name: "demo_increment", arguments: args },
});

export async function fakeGateway(script: ScriptTurn[]) {
  const store = new SqliteStore(":memory:");
  const token = store.provision({
    id: "alice",
    models: [MODEL],
    rpm: 1000,
    concurrency: 8,
    quota: 1_000_000,
  });
  const app = createGateway({
    store,
    models: [mockModel],
    adapters: [new MockProvider(script)],
  });
  await app.ready();
  const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  return {
    token,
    baseUrl,
    async close() {
      await app.close();
      store.close();
    },
  };
}

export const tmpDb = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "durable-"));
  return { dir, db: path.join(dir, "runs.db") };
};

/** Poll a predicate up to ~4s — deterministic fault injection needs the
 *  persisted mark, not a timing guess. */
export async function until<T>(
  fn: () => Promise<T> | T,
  pred: (v: T) => boolean,
  what = "condition",
): Promise<T> {
  const deadline = Date.now() + 4000;
  let last = await fn();
  while (!pred(last)) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, 25));
    last = await fn();
  }
  return last;
}
