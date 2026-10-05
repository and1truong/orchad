import { createServer } from "node:http";
// Mock HTTP boundary, no provider adapter or reasoning loop. Test token only.
// scripted=true answers each turn deterministically — a demo_increment tool
// call whenever the last message is not a tool result, else a plain stop —
// so a live extension can reach the approval/dispatch flow end to end. The
// default stays the deliberately truncated stream that proves partial
// arguments never dispatch.
export async function startMockGateway(port = 4311, scripted = false) {
  let calls = 0;
  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end('{"ok":true}');
      return;
    }
    if (req.headers.authorization !== "Bearer lime-fixture-token") {
      res.writeHead(401).end();
      return;
    }
    if (req.url === "/v1/models") {
      res.setHeader("Content-Type", "application/json");
      res.end('{"data":[{"id":"mock-counter"}]}');
      return;
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      if (scripted) {
        let raw = "";
        for await (const part of req) raw += part;
        const body = JSON.parse(raw || "{}");
        const last = (body.messages ?? []).at(-1);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        if (last?.role === "tool") {
          res.write(
            'data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n',
          );
        } else {
          // Fresh id per call: the client rejects ids already in history.
          const id = "mock-call-" + ++calls;
          res.write(
            `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"${id}","type":"function","function":{"name":"demo_increment","arguments":"{\\"amount\\":1}"}}]},"finish_reason":"tool_calls"}]}\n\n`,
          );
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"mock-tool","type":"function","function":{"name":"demo_increment","arguments":"{\\\"amount\\\":"}}]},"finish_reason":null}]}\n\n',
      );
      res.end();
      return; // Deliberately incomplete: consumer must reject without dispatch.
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    port: (server.address() as { port: number }).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
if (process.argv[1]?.endsWith("/fixtures/gateway.ts")) {
  await startMockGateway();
  console.log(
    "Mock gateway boundary http://127.0.0.1:4311 · token lime-fixture-token · partial arguments fixture",
  );
}
