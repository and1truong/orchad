import { SqliteStore, type Principal } from "../src/store.js";
import { createGateway, type GatewayOptions } from "../src/server.js";
import { MockProvider } from "../src/providers/mock.js";
import { mockModel } from "../src/config.js";
import type { ScriptTurn } from "../src/providers/types.js";
export const userMessages = [
  { role: "user" as const, content: "Test request" },
];
export const request = { model: "mock-scripted", messages: userMessages };
export async function setup(
  script?: ScriptTurn[],
  overrides: Partial<GatewayOptions> = {},
  principal: Partial<Principal> = {},
) {
  const store = new SqliteStore(":memory:");
  const p: Principal = {
    id: "alice",
    models: ["mock-scripted"],
    rpm: 100,
    concurrency: 2,
    quota: 1_000_000,
    ...principal,
  };
  const token = store.provision(p);
  const otherToken = store.provision({
    ...p,
    id: "bob",
    models: ["mock-scripted"],
  });
  const app = createGateway({
    store,
    models: [mockModel],
    adapters: [new MockProvider(script)],
    ...overrides,
  });
  await app.ready();
  return {
    app,
    store,
    token,
    otherToken,
    headers: { authorization: `Bearer ${token}` },
    async close() {
      await app.close();
      store.close();
    },
  };
}
export function fragmentedResponse(frames: any[], bytes = 1) {
  const text = frames
    .map(
      (f) => `data: ${typeof f === "string" ? f : JSON.stringify(f)}\r\n\r\n`,
    )
    .join("");
  const encoded = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (offset === encoded.length) {
          c.close();
          return;
        }
        c.enqueue(encoded.slice(offset, offset + bytes));
        offset = Math.min(offset + bytes, encoded.length);
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
