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
export class CompanionTransport {
  private ws: WebSocket | null = null;
  private credentials: Paired | null = null;
  private cancelled = new Map<string, AbortController>();
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
    ws.onclose = () => {
      for (const c of this.cancelled.values()) c.abort();
      this.cancelled.clear();
      if (this.ws === ws) {
        this.ws = null;
        this.onState(
          "disconnected — reconnect required; pending calls discarded",
        );
      }
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
  disconnect() {
    for (const c of this.cancelled.values()) c.abort();
    this.cancelled.clear();
    this.ws?.close();
    this.ws = null;
    this.onState("disconnected");
  }
}
