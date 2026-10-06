import { z } from "zod";
import {
  ResultSchema,
  MAX_BYTES,
  failure,
  type Target,
  type Result,
} from "../shared/contract.js";
const Request = z
  .object({
    type: z.literal("request"),
    requestId: z.string().max(256),
    clientId: z.string().max(256),
    name: z.enum([
      "host_list_targets",
      "host_get_context",
      "host_list_tools",
      "host_call_tool",
    ]),
    arguments: z.unknown(),
  })
  .strict();
export interface Paired {
  clientId: string;
  bridgeToken: string;
  mcpToken: string;
}
export interface DurableStatus {
  phase: string;
  conversationId: string;
  submissions: unknown[];
  ops: {
    opId: string;
    toolName: string;
    status: string;
    attempts: number;
    error: string | null;
  }[];
  tasks: { name: string; state: string }[];
  reason?: string;
  detail?: string;
}
export class CompanionTransport {
  private ws: WebSocket | null = null;
  private credentials: Paired | null = null;
  private cancelled = new Map<string, AbortController>();
  private durablePending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private durableListeners = new Set<(s: DurableStatus) => void>();
  constructor(
    private onState: (s: string) => void,
    private onConfirmation: (confirm: () => void, deny: () => void) => void,
    private onPaired: (p: Paired) => void,
    private route: (
      clientId: string,
      name: string,
      args: unknown,
      signal: AbortSignal,
    ) => Promise<Result>,
  ) {}
  connect(base: string, code: string, targets: Target[]) {
    this.disconnect();
    const url = new URL(base);
    if (
      url.protocol !== "ws:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/bridge" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error("Companion must be loopback ws://HOST:PORT/bridge");
    this.open(url.href, () => ({ type: "pair", code, targets }));
  }
  reconnect(base: string) {
    const u = new URL(base);
    if (
      u.protocol !== "ws:" ||
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.pathname !== "/bridge" ||
      u.search ||
      u.hash ||
      u.username ||
      u.password
    )
      throw new Error("Invalid loopback bridge endpoint");
    if (!this.credentials) throw new Error("No in-memory bridge credential");
    const credentials = this.credentials;
    this.disconnect();
    this.open(base, () => ({ type: "auth", token: credentials.bridgeToken }));
  }
  private open(url: string, auth: () => unknown) {
    this.onState("connecting");
    const ws = (this.ws = new WebSocket(url));
    ws.onopen = () => ws.send(JSON.stringify(auth()));
    ws.onmessage = async (event) => {
      try {
        if (
          typeof event.data !== "string" ||
          new TextEncoder().encode(event.data).length > MAX_BYTES
        )
          throw new Error("Oversized bridge message");
        const m = JSON.parse(event.data);
        if (m.type === "confirmation") {
          this.onConfirmation(
            () => ws.send(JSON.stringify({ type: "confirm", accept: true })),
            () => ws.send(JSON.stringify({ type: "confirm", accept: false })),
          );
          return;
        }
        if (m.type === "paired") {
          const p = z
            .object({
              type: z.literal("paired"),
              clientId: z.string(),
              bridgeToken: z.string(),
              mcpToken: z.string(),
            })
            .strict()
            .parse(m);
          this.credentials = p;
          this.onPaired(p);
          this.onState("connected");
          return;
        }
        if (m.type === "authenticated") {
          this.onState("connected");
          return;
        }
        if (m.type === "cancel") {
          const c = this.cancelled.get(m.requestId);
          c?.abort();
          return;
        }
        // Trusted durable ops ride the same paired socket — companion pushes
        // status; replies resolve durable() calls by id.
        if (m.type === "durable_status") {
          const s = z
            .object({ type: z.literal("durable_status"), status: z.unknown() })
            .strict()
            .parse(m);
          for (const cb of this.durableListeners)
            cb(s.status as DurableStatus);
          return;
        }
        if (m.type === "durable_result") {
          const r = z
            .object({
              type: z.literal("durable_result"),
              id: z.string().max(64),
              ok: z.boolean(),
              data: z.unknown().optional(),
              error: z.string().max(1024).optional(),
            })
            .strict()
            .parse(m);
          const p = this.durablePending.get(r.id);
          if (p) {
            clearTimeout(p.timer);
            this.durablePending.delete(r.id);
            if (r.ok) p.resolve(r.data);
            else p.reject(new Error(r.error ?? "durable op failed"));
          }
          return;
        }
        const r = Request.parse(m);
        if (r.clientId !== this.credentials?.clientId)
          throw new Error("Wrong paired client");
        const controller = new AbortController();
        this.cancelled.set(r.requestId, controller);
        let result: Result;
        try {
          result = ResultSchema.parse(
            await this.route(
              r.clientId,
              r.name,
              r.arguments,
              controller.signal,
            ),
          );
        } catch {
          result = failure("INTERNAL", "Host route failed");
        }
        this.cancelled.delete(r.requestId);
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              type: "response",
              requestId: r.requestId,
              result,
            }),
          );
      } catch {
        ws.close(1008, "Invalid bridge boundary");
        this.onState("error");
      }
    };
    const dropDurable = () => {
      for (const [, p] of this.durablePending) {
        clearTimeout(p.timer);
        p.reject(new Error("Bridge disconnected"));
      }
      this.durablePending.clear();
    };
    ws.onclose = () => {
      // A superseded socket's late close must not abort requests already
      // routed over its replacement.
      if (this.ws !== ws) return;
      for (const c of this.cancelled.values()) c.abort();
      this.cancelled.clear();
      dropDurable();
      this.ws = null;
      this.onState(
        "disconnected — reconnect required; pending calls discarded",
      );
    };
    ws.onerror = () => this.onState("error");
  }
  revoke() {
    // send() throws on a CONNECTING socket and silently drops on a dead one;
    // a dead socket leaves the server-side pair alive but permanently
    // fail-closed (route() requires an OPEN bridge), so only notify while
    // OPEN and always wipe our copy of the credentials.
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: "revoke" }));
    this.credentials = null;
    this.disconnect();
  }
  /** Trusted durable-runner op; resolves with the op result or rejects. */
  durable(
    op:
      | "submit"
      | "status"
      | "resume"
      | "cancel"
      | "transcript"
      | "reconcile"
      | "resolve",
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("Bridge disconnected"));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.durablePending.delete(id);
        reject(new Error("Durable op timed out"));
      }, 30_000);
      this.durablePending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ type: "durable", id, op, ...params }));
    });
  }
  /** Subscribe to durable status pushes; returns an unsubscribe fn. */
  onDurableStatus(cb: (s: DurableStatus) => void): () => void {
    this.durableListeners.add(cb);
    return () => this.durableListeners.delete(cb);
  }
  disconnect() {
    for (const c of this.cancelled.values()) c.abort();
    this.cancelled.clear();
    for (const [, p] of this.durablePending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge disconnected"));
    }
    this.durablePending.clear();
    this.ws?.close();
    this.ws = null;
    this.onState("disconnected");
  }
}
