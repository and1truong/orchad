import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  BindingSchema,
  HostCallSchema,
  TargetSchema,
  ResultSchema,
  MAX_BYTES,
  bounded,
  failure,
  success,
  type Target,
  type Result,
} from "../shared/contract.js";
const token = () => randomBytes(32).toString("base64url");
const equal = (a: string, b: string) => {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
const EmptySchema = z.object({}).strict();
const tools = [
  {
    name: "host_list_targets",
    description: "List only user-consented targets",
    inputSchema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
  },
  ...["host_get_context", "host_list_tools"].map((name) => ({
    name,
    description: "Read pinned target inside paired scope",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetId: { type: "string" },
        pageInstanceId: { type: "string" },
      },
      required: ["targetId", "pageInstanceId"],
      additionalProperties: false,
    },
  })),
  {
    name: "host_call_tool",
    description:
      "Request a page tool; mutation requires trusted sidebar approval",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetId: { type: "string" },
        pageInstanceId: { type: "string" },
        call: {
          type: "object",
          properties: {
            requestId: { type: "string" },
            documentId: { type: "string" },
            toolName: { type: "string" },
            arguments: { type: "object" },
            expectedRevision: { type: ["integer", "null"], minimum: 0 },
            idempotencyKey: { type: ["string", "null"] },
          },
          required: [
            "requestId",
            "documentId",
            "toolName",
            "arguments",
            "expectedRevision",
            "idempotencyKey",
          ],
          additionalProperties: false,
        },
      },
      required: ["targetId", "pageInstanceId", "call"],
      additionalProperties: false,
    },
  },
];
interface Pair {
  clientId: string;
  bridgeToken: string;
  mcpToken: string;
  targets: Target[];
  socket: WebSocket | null;
  revoked: boolean;
}
interface Pending {
  pair: Pair;
  resolve: (r: Result) => void;
  timer: ReturnType<typeof setTimeout>;
  remove: () => void;
}
export interface CompanionOptions {
  port?: number;
  extensionOrigins: string[];
  requestTimeoutMs?: number;
}
export async function startCompanion(options: CompanionOptions) {
  if (
    !options.extensionOrigins.length ||
    !options.extensionOrigins.every((x) =>
      /^chrome-extension:\/\/[a-p]{32}$/.test(x),
    )
  )
    throw new Error("Explicit extension origin allowlist required");
  const pairs = new Map<string, Pair>(),
    pending = new Map<string, Pending>(),
    sessions = new Map<
      string,
      { transport: StreamableHTTPServerTransport; server: Server; pair: Pair }
    >();
  let pairing: { code: string; expiresAt: number } | null = null;
  let boundPort = options.port ?? 4312;
  const originAllowed = (origin: string | undefined) =>
    !!origin && options.extensionOrigins.includes(origin);
  const hostAllowed = (host: string | undefined) =>
    host === `127.0.0.1:${boundPort}` || host === `localhost:${boundPort}`;
  function complete(id: string, result: Result) {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    p.remove();
    pending.delete(id);
    p.resolve(result);
  }
  function disconnected(pair: Pair) {
    pair.socket = null;
    for (const [id, p] of pending)
      if (p.pair === pair)
        complete(
          id,
          failure(
            "INTERNAL",
            "Extension disconnected; execution outcome unknown. No replay.",
          ),
        );
  }
  function revoke(clientId: string) {
    const pair = pairs.get(clientId);
    if (!pair) return;
    pair.revoked = true;
    pairs.delete(clientId);
    pair.socket?.close(1000, "Revoked");
    disconnected(pair);
    for (const [id, s] of sessions)
      if (s.pair === pair) {
        void s.server.close();
        sessions.delete(id);
      }
  }
  async function route(
    pair: Pair,
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<Result> {
    if (pair.revoked) return failure("UNAUTHORIZED", "Pairing revoked");
    if (!pair.socket || pair.socket.readyState !== WebSocket.OPEN)
      return failure("FORBIDDEN", "No connected sidebar/approver");
    try {
      if (name === "host_list_targets") EmptySchema.parse(args);
      else {
        const b =
          name === "host_call_tool"
            ? bounded(HostCallSchema, args)
            : bounded(BindingSchema, args);
        if (
          !pair.targets.some(
            (t) =>
              t.targetId === b.targetId &&
              t.pageInstanceId === b.pageInstanceId,
          )
        )
          return failure("FORBIDDEN", "Target outside paired scope");
      }
    } catch {
      return failure("INVALID_ARGUMENT", "Malformed host arguments");
    }
    if (signal.aborted) return failure("CANCELLED", "MCP request cancelled");
    if (pending.size >= 64)
      return failure("FORBIDDEN", "Companion capacity reached");
    const requestId = randomUUID();
    const result = await new Promise<Result>((resolve) => {
      const cancel = () => {
        pair.socket?.send(JSON.stringify({ type: "cancel", requestId }));
        complete(
          requestId,
          failure(
            "CANCELLED",
            "MCP cancellation; dispatched mutation outcome may be unknown",
          ),
        );
      };
      const timer = setTimeout(() => {
        pair.socket?.send(JSON.stringify({ type: "cancel", requestId }));
        complete(
          requestId,
          failure(
            "TIMEOUT",
            "Execution timed out; outcome may be unknown. No replay.",
          ),
        );
      }, options.requestTimeoutMs ?? 65_000);
      pending.set(requestId, {
        pair,
        resolve,
        timer,
        remove: () => signal.removeEventListener("abort", cancel),
      });
      signal.addEventListener("abort", cancel, { once: true });
      // Listeners registered on an already-aborted signal never fire; an abort
      // landing between the earlier check and registration would otherwise be
      // missed until timeout.
      if (signal.aborted) cancel();
      if (!pending.has(requestId)) return;
      pair.socket!.send(
        JSON.stringify({
          type: "request",
          requestId,
          clientId: pair.clientId,
          name,
          arguments: args,
        }),
      );
    });
    if (name === "host_list_targets" && result.ok) {
      const parsed = z
        .object({ targets: z.array(TargetSchema).max(32) })
        .strict()
        .safeParse(result.data);
      if (!parsed.success)
        return failure("INVALID_ARGUMENT", "Malformed targets");
      return success({
        targets: parsed.data.targets.filter((t) =>
          pair.targets.some(
            (p) =>
              p.targetId === t.targetId &&
              p.pageInstanceId === t.pageInstanceId &&
              p.origin === t.origin &&
              p.documentId === t.documentId &&
              p.appId === t.appId,
          ),
        ),
      });
    }
    return result;
  }
  const http = createServer(async (req, res) => {
    if (
      !hostAllowed(req.headers.host) ||
      (req.headers.origin !== undefined && !originAllowed(req.headers.origin))
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    const auth = req.headers.authorization;
    const pair = auth?.startsWith("Bearer ")
      ? [...pairs.values()].find(
          (p) => !p.revoked && equal(p.mcpToken, auth.slice(7)),
        )
      : undefined;
    if (!pair) {
      res.writeHead(401).end();
      return;
    }
    if (!["POST", "GET", "DELETE"].includes(req.method || "")) {
      res.writeHead(405).end();
      return;
    }
    try {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const sid = req.headers["mcp-session-id"];
      let entry = typeof sid === "string" ? sessions.get(sid) : undefined;
      if (sid && (!entry || entry.pair !== pair)) {
        res.writeHead(403).end();
        return;
      }
      if (!entry) {
        if (req.method !== "POST" || !isInitializeRequest(body)) {
          res.writeHead(400).end();
          return;
        }
        if (sessions.size >= 64) {
          res.writeHead(429).end();
          return;
        }
        const server = new Server(
          { name: "orchard-lime-companion", version: "0.1.0" },
          { capabilities: { tools: {} } },
        );
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools,
        }));
        server.setRequestHandler(
          CallToolRequestSchema,
          async (request, extra) => {
            const name = request.params.name;
            const result = tools.some((t) => t.name === name)
              ? await route(
                  pair,
                  name,
                  request.params.arguments ?? {},
                  extra.signal,
                )
              : failure("UNSUPPORTED", "Unknown host tool");
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(result) },
              ],
              structuredContent: result,
              isError: !result.ok,
            };
          },
        );
        const transport: StreamableHTTPServerTransport =
          new StreamableHTTPServerTransport({
            sessionIdGenerator: randomUUID,
            onsessioninitialized: (id) => {
              sessions.set(id, { transport, server, pair });
            },
            enableJsonResponse: true,
          });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await server.connect(transport);
        entry = { transport, server, pair };
      }
      await entry.transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent)
        res.writeHead(e instanceof RangeError ? 413 : 400).end();
      else res.end();
    }
  });
  http.headersTimeout = 10_000;
  http.requestTimeout = 15_000;
  http.keepAliveTimeout = 5_000;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_BYTES,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/bridge" ||
      !hostAllowed(req.headers.host) ||
      !originAllowed(req.headers.origin) ||
      wss.clients.size >= 16
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    let pair: Pair | null = null,
      awaiting: { targets: Target[] } | null = null;
    let deadline = setTimeout(
      () => ws.close(1008, "Authentication deadline"),
      5000,
    );
    ws.on("message", (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (!pair) {
          if (m.type === "pair") {
            const p = z
              .object({
                type: z.literal("pair"),
                code: z.string().max(128),
                targets: z.array(TargetSchema).min(1).max(32),
              })
              .strict()
              .parse(m);
            if (
              awaiting ||
              !pairing ||
              pairing.expiresAt < Date.now() ||
              !equal(pairing.code, p.code)
            ) {
              ws.close(1008, "Invalid or expired code");
              return;
            }
            pairing = null;
            awaiting = { targets: p.targets };
            clearTimeout(deadline);
            deadline = setTimeout(
              () => ws.close(1008, "Confirmation expired"),
              30000,
            );
            ws.send(
              JSON.stringify({
                type: "confirmation",
                targets: p.targets,
                expiresAt: Date.now() + 30000,
              }),
            );
            return;
          }
          if (m.type === "confirm") {
            z.object({ type: z.literal("confirm"), accept: z.boolean() })
              .strict()
              .parse(m);
            if (!awaiting || !m.accept) {
              ws.close(1008, "Pairing denied");
              return;
            }
            pair = {
              clientId: randomUUID(),
              bridgeToken: token(),
              mcpToken: token(),
              targets: awaiting.targets,
              socket: ws,
              revoked: false,
            };
            pairs.set(pair.clientId, pair);
            clearTimeout(deadline);
            ws.send(
              JSON.stringify({
                type: "paired",
                clientId: pair.clientId,
                bridgeToken: pair.bridgeToken,
                mcpToken: pair.mcpToken,
              }),
            );
            return;
          }
          const a = z
            .object({ type: z.literal("auth"), token: z.string().max(128) })
            .strict()
            .parse(m);
          const found = [...pairs.values()].find(
            (p) => !p.revoked && equal(p.bridgeToken, a.token),
          );
          if (!found) {
            ws.close(1008, "Invalid credential");
            return;
          }
          // A reconnect replaces the transport, never pending operations or scope.
          if (found.socket) {
            found.socket.close(1000, "Replaced");
            disconnected(found);
          }
          pair = found;
          pair.socket = ws;
          clearTimeout(deadline);
          ws.send(
            JSON.stringify({ type: "authenticated", clientId: pair.clientId }),
          );
          return;
        }
        if (m.type === "revoke") {
          z.object({ type: z.literal("revoke") })
            .strict()
            .parse(m);
          revoke(pair.clientId);
          return;
        }
        const r = z
          .object({
            type: z.literal("response"),
            requestId: z.string().max(256),
            result: ResultSchema,
          })
          .strict()
          .parse(m);
        const p = pending.get(r.requestId);
        if (p?.pair === pair)
          complete(r.requestId, bounded(ResultSchema, r.result));
      } catch {
        ws.close(1008, "Malformed bridge message");
      }
    });
    ws.on("close", () => {
      clearTimeout(deadline);
      if (pair?.socket === ws) disconnected(pair);
    });
    ws.on("error", () => {});
  });
  await new Promise<void>((resolve) =>
    http.listen(boundPort, "127.0.0.1", resolve),
  );
  boundPort = (http.address() as { port: number }).port;
  return {
    port: boundPort,
    beginPairing: () => {
      pairing = { code: token(), expiresAt: Date.now() + 60_000 };
      return { ...pairing };
    },
    revoke,
    close: async () => {
      for (const id of pairs.keys()) revoke(id);
      for (const s of sessions.values()) await s.server.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
async function readBody(req: IncomingMessage) {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BYTES) throw new RangeError("Payload too large");
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString());
}
