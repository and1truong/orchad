import { z } from "zod";
import {
  openRunner,
  type DurableRunner,
  type HostBinding,
  type OpEnvelope,
  type RunnerGateway,
  type RunStatus,
} from "@orchard/agent-durable";
import type { Result as ClientResult } from "@orchard/agent-client";
import {
  ToolSchema,
  ContextSchema,
  type Result,
  type Target,
} from "../shared/contract.js";

export type DurableOptions = {
  /** App-data SQLite path; one DB per user, single owner process. */
  storagePath: string;
  /** Live Mango gateway credentials — memory only, never persisted. */
  gateway: RunnerGateway;
  /** Write tool names whose backends dedup by idempotencyKey (e.g. Guava). */
  idempotentTools?: readonly string[];
  maxSteps?: number;
  maxToolCalls?: number;
};

const OpSchema = z
  .object({
    type: z.literal("durable"),
    id: z.string().min(1).max(64),
    op: z.enum([
      "submit",
      "status",
      "resume",
      "cancel",
      "transcript",
      "reconcile",
      "resolve",
    ]),
    prompt: z.string().max(8192).optional(),
    requestId: z.string().max(128).optional(),
    callId: z.string().max(128).optional(),
    verdict: z
      .object({
        status: z.enum(["reconciled", "failed"]),
        result: z.unknown().optional(),
        error: z.string().max(1024).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

interface PairLike {
  clientId: string;
  targets: Target[];
  socket: { readyState: number; send(data: string): void } | null;
  revoked: boolean;
}

const OPEN = 1;

/**
 * Trusted durable ops on the paired bridge socket — never on /mcp, never for
 * guest/external clients. The runner lives in the companion process, which
 * is exactly why a sidepanel close/reopen does not kill a run: the bridge
 * socket dying only unbinds the host (dispatches park, provably unsent);
 * `authenticated` rebinds and `whenBound` wakes them.
 */
export class DurableBridge {
  #runner: Promise<DurableRunner> | null = null;
  #bound: PairLike | null = null;
  #unwatch: (() => void) | null = null;
  #epochs = new Map<string, string | null>();

  constructor(
    private options: DurableOptions,
    private route: (
      pair: PairLike,
      name: string,
      args: unknown,
      signal: AbortSignal,
    ) => Promise<Result>,
  ) {}

  private runner(): Promise<DurableRunner> {
    return (this.#runner ??= openRunner({
      storagePath: this.options.storagePath,
      maxSteps: this.options.maxSteps,
      maxToolCalls: this.options.maxToolCalls,
    }).then(async (r) => {
      await r.configure(this.options.gateway);
      this.#unwatch = r.watch((s) => this.push(s));
      return r;
    }));
  }

  private push(status: RunStatus) {
    const p = this.#bound;
    if (p?.socket?.readyState === OPEN && !p.revoked)
      p.socket.send(JSON.stringify({ type: "durable_status", status }));
  }

  /** Rebind all paired targets; safe to call on every connect/op. */
  async bind(pair: PairLike): Promise<void> {
    if (!pair.socket || pair.socket.readyState !== OPEN || pair.revoked) return;
    const r = await this.runner();
    const bindings: HostBinding[] = [];
    for (const t of pair.targets.slice(0, 32)) {
      const ctx = await this.route(
        pair,
        "host_get_context",
        { targetId: t.targetId, pageInstanceId: t.pageInstanceId },
        new AbortController().signal,
      );
      if (!ctx.ok) continue; // consent/consentee not ready — ops park instead
      const context = ContextSchema.safeParse(ctx.data);
      if (!context.success) continue;
      const tools = await this.route(
        pair,
        "host_list_tools",
        { targetId: t.targetId, pageInstanceId: t.pageInstanceId },
        new AbortController().signal,
      );
      const listed = z
        .object({ tools: z.array(ToolSchema).max(64) })
        .strict()
        .safeParse(tools.ok ? tools.data : null);
      if (!listed.success) continue;
      const target = t;
      const epoch = context.data.sessionEpoch ?? null;
      this.#epochs.set(t.targetId, epoch);
      bindings.push({
        targetId: t.targetId,
        revision: () => context.data.revision,
        tools: listed.data.tools.map((d) => ({
          name: d.name,
          description: d.description,
          inputSchema: d.inputSchema as Record<string, unknown>,
          effect: d.effect,
        })),
        idempotentTools: this.options.idempotentTools,
        // Re-entry must re-prove consent: pair live, socket open, target still
        // paired AND the app's session epoch unchanged since this binding.
        revalidate: async (envelope: OpEnvelope) => {
          if (pair.revoked || pair.socket?.readyState !== OPEN)
            throw new Error("host unbound");
          if (!pair.targets.some((x) => x.targetId === envelope.targetId))
            throw new Error("target outside paired scope");
          const now = await this.route(
            pair,
            "host_get_context",
            { targetId: envelope.targetId, pageInstanceId: target.pageInstanceId },
            new AbortController().signal,
          );
          const fresh = now.ok ? ContextSchema.safeParse(now.data) : null;
          if (!fresh?.success)
            throw new Error("host context unreachable");
          if ((fresh.data.sessionEpoch ?? null) !== epoch)
            throw new Error("session epoch changed — consent expired");
        },
      });
    }
    if (bindings.length === 0) return;
    this.#bound = pair;
    await r.bind(
      bindings,
      async (envelope, _attempt, _ctx) =>
        this.route(
          pair,
          "host_call_tool",
          {
            targetId: envelope.targetId,
            pageInstanceId:
              pair.targets.find((x) => x.targetId === envelope.targetId)
                ?.pageInstanceId ?? "",
            call: {
              requestId: envelope.requestId,
              documentId:
                pair.targets.find((x) => x.targetId === envelope.targetId)
                  ?.documentId ?? envelope.targetId,
              toolName: envelope.toolName,
              arguments: envelope.arguments,
              expectedRevision: envelope.expectedRevision,
              idempotencyKey: envelope.idempotencyKey,
            },
          },
          _ctx?.abortSignal ?? new AbortController().signal,
        ) as Promise<ClientResult>,
    );
    // A fresh status push so a reopened sidepanel repaints immediately.
    this.push(await r.status());
  }

  async unbind(pair: PairLike): Promise<void> {
    if (this.#bound === pair) {
      this.#bound = null;
      (await this.runner().catch(() => null))?.unbind();
    }
  }

  /** Bridge message handler; `m` already JSON-parsed and size-bounded. */
  async handle(
    pair: PairLike,
    raw: unknown,
  ): Promise<{ id: string; ok: boolean; data?: unknown; error?: string } | null> {
    let m: z.infer<typeof OpSchema>;
    try {
      m = OpSchema.parse(raw);
    } catch {
      return null;
    }
    const reply = (ok: boolean, data?: unknown, error?: string) => ({
      id: m.id,
      ok,
      data,
      error,
    });
    try {
      // Rebind lazily — a sidepanel reopen/refresh lands here after
      // `authenticated`; parked ops wake inside bind().
      await this.bind(pair);
      const r = await this.runner();
      switch (m.op) {
        case "submit": {
          if (!m.prompt) return reply(false, undefined, "prompt required");
          return reply(true, await r.submit({
            prompt: m.prompt,
            requestId: m.requestId,
          }));
        }
        case "status":
          return reply(true, await r.status());
        case "resume":
          return reply(true, await r.resume());
        case "cancel":
          return reply(true, await r.cancel());
        case "transcript":
          return reply(true, await r.transcript());
        case "reconcile":
          return reply(true, await r.reconcile());
        case "resolve": {
          if (!m.callId || !m.verdict)
            return reply(false, undefined, "callId + verdict required");
          await r.resolveOp(
            m.callId,
            m.verdict.status === "reconciled"
              ? { status: "reconciled", result: m.verdict.result }
              : { status: "failed", error: m.verdict.error ?? "rejected" },
          );
          return reply(true, await r.status());
        }
      }
    } catch (e) {
      return reply(
        false,
        undefined,
        e instanceof Error ? e.message.slice(0, 300) : "durable op failed",
      );
    }
  }

  async close(): Promise<void> {
    this.#unwatch?.();
    await this.#runner?.then((r) => r.close()).catch(() => {});
  }
}
