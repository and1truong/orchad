import type { Context } from "@earendil-works/chord";
import { defineTool, type ToolExecutionApi } from "@earendil-works/pi-durable";
import type { ConversationId, JsonObject } from "@earendil-works/pi-durable";
import type { TSchema } from "@earendil-works/pi-ai";
import type { Result, ToolDescriptor } from "@orchard/agent-client";
import { OpsDoc, type OpEnvelope, type OpRecord } from "./journal.js";

const RESULT_CAP = 65536;

export type HostDispatch = (
  envelope: OpEnvelope,
  attempt: { opId: string; attemptNo: number },
  context: Context,
) => Promise<Result>;

export type HostToolOptions = {
  /** Host target the envelope addresses (document id, tab descriptor, ...). */
  targetId: string;
  /**
   * True only when the backend was verified to dedup this tool's writes by
   * idempotencyKey (e.g. the Guava service). Host opt-in per tool; the
   * runner never assumes an unknown mutation is safe.
   */
  idempotent: boolean;
  /** Latest revision the host reported for this target (writes only). */
  getRevision: () => number | null;
  /** Re-check live host state before ANY re-entry (recovered parked or
   *  dispatched op). Throw to block: consent/binding/approval must be
   *  re-established by the host. */
  revalidate?: (envelope: OpEnvelope) => Promise<void>;
  /** Resolves once the host binding for this target is live. */
  whenBound: () => Promise<void>;
  dispatch: HostDispatch;
};

const internal = (message: string): Result => ({
  ok: false,
  revision: null,
  data: null,
  error: { code: "INTERNAL", message, retryable: false },
});

const cancelled = (): Result => ({
  ok: false,
  revision: null,
  data: null,
  error: { code: "CANCELLED", message: "Run cancelled", retryable: false },
});

function validResult(v: unknown): v is Result {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.ok === "boolean" &&
    (r.revision === null || Number.isInteger(r.revision)) &&
    r.ok === (r.error === null) &&
    (r.error === null ||
      (typeof r.error === "object" &&
        r.error !== null &&
        typeof (r.error as Record<string, unknown>).code === "string"))
  );
}

/**
 * One Orchard host tool. replay is 'safe' only for reads and verified
 * idempotent writes: a 'safe' pi.tool task re-runs execute() on recovery,
 * where the journal makes the re-dispatch carry the SAME op id, envelope and
 * idempotencyKey. 'unsafe' (any other mutation) is never re-run — pi settles
 * it 'interrupted' without touching our execute, leaving the journal op
 * 'dispatched' for reconciliation. Live policy (consent, approvals, CAS) runs
 * inside dispatch() on every attempt, including the first.
 */
export function orchardTool(
  descriptor: ToolDescriptor,
  opts: HostToolOptions,
) {
  const isWrite = descriptor.effect !== "read";
  const replay = !isWrite || opts.idempotent ? ("safe" as const) : ("unsafe" as const);
  return defineTool({
    name: descriptor.name,
    description: descriptor.description,
    parameters: descriptor.inputSchema as unknown as TSchema,
    replay,
    execute: async (args, api, context) => {
      const convId = api.conversationId;
      const noop = undefined;
      const snapshot = await api.snapshot(OpsDoc, convId, context);
      let op = snapshot?.ops[api.callId];
      if (op && (op.status === "completed" || op.status === "failed")) {
        // Defensive: a settled op is never re-executed even if a stale task
        // somehow reaches execute again.
        return resultMessage(op.result ?? internal("Op already settled"), op);
      }
      if (!op) {
        op = {
          opId: api.callId,
          callId: api.callId,
          taskId: String(api.taskId),
          envelope: {
            targetId: opts.targetId,
            requestId: api.callId,
            toolName: descriptor.name,
            arguments: args as JsonObject,
            argumentsRaw: JSON.stringify(args),
            expectedRevision: isWrite ? opts.getRevision() : null,
            idempotencyKey: isWrite ? crypto.randomUUID() : null,
          },
          replayClass: replay,
          status: "parked",
          attempts: 0,
          dispatchedAt: Date.now(),
          lastAttemptAt: null,
          result: null,
          error: null,
        };
      } else {
        // Re-entry after recovery: the envelope persists, but the host must
        // prove live consent/binding again before anything is sent.
        try {
          await opts.revalidate?.(op.envelope);
        } catch (error) {
          const result = internal(
            `Host revalidation failed: ${error instanceof Error ? error.message : "blocked"}`,
          );
          await settle(api, convId, op, result, "failed", context);
          return resultMessage(result, op);
        }
      }
      if (op.status === "parked" && op.attempts === 0) {
        // Intent checkpoint (fresh op): op id + envelope + idempotencyKey
        // persist before the dispatch they describe can ever leave the
        // process. A recovered 'dispatched' op keeps its mark — downgrading
        // it to 'parked' would wrongly claim it never reached the host.
        await api.commit(
          async (tx) => {
            const draft = await tx.doc(OpsDoc, convId);
            draft.ops[api.callId] = op!;
            return undefined;
          },
          context,
        );
      }
      // Park while the host is unbound: the op stays 'parked', provably never
      // dispatched, and wakes on the next bind().
      await opts.whenBound();
      if (context?.abortSignal?.aborted) {
        const result = cancelled();
        await settle(api, convId, op, result, "failed", context);
        return resultMessage(result, op);
      }
      op = {
        ...op,
        status: "dispatched",
        attempts: op.attempts + 1,
        lastAttemptAt: Date.now(),
      };
      await api.commit(
        async (tx) => {
          const draft = await tx.doc(OpsDoc, convId);
          draft.ops[api.callId] = op!;
          return undefined;
        },
        context,
      );
      let result: Result;
      try {
        const raw = await opts.dispatch(
          op.envelope,
          { opId: op.opId, attemptNo: op.attempts },
          context,
        );
        // A malformed result is still an unprovable outcome.
        result = validResult(raw)
          ? raw
          : internal("Invalid host result; outcome unknown — no replay");
      } catch {
        // A dispatch that threw may still have reached the host — outcome is
        // unprovable either way, so it must classify 'ambiguous' below.
        result = context?.abortSignal?.aborted
          ? cancelled()
          : internal("Host tool execution threw; outcome unknown — no replay");
      }
      let serialized = JSON.stringify(result);
      if (serialized.length > RESULT_CAP) {
        result = internal("Host result exceeds size limit");
        serialized = JSON.stringify(result);
      }
      // A failed result is not always a failed dispatch: an 'outcome unknown'
      // INTERNAL/TIMEOUT means the backend may have applied it — that is the
      // ambiguous case the journal exists for, never a silent retry and never
      // a plain 'failed' that lets the model immediately re-issue the call.
      // Other retryable errors keep the op interrupted for reconciliation.
      const opStatus: OpRecord["status"] = result.ok
        ? "completed"
        : /outcome.{0,16}unknown|no replay/i.test(result.error?.message ?? "") &&
            (result.error?.code === "INTERNAL" || result.error?.code === "TIMEOUT")
          ? "ambiguous"
          : result.error?.retryable
            ? "interrupted"
            : "failed";
      await settle(api, convId, op, result, opStatus, context);
      return {
        content: [{ type: "text" as const, text: serialized }],
        details: { opId: op.opId, attempts: op.attempts },
        isError: !result.ok,
      };
    },
  });
}

async function settle(
  api: ToolExecutionApi,
  convId: ConversationId,
  op: OpRecord,
  result: Result,
  status: OpRecord["status"],
  context: Context,
) {
  await api.commit(
    async (tx) => {
      const draft = await tx.doc(OpsDoc, convId);
      const current = draft.ops[op.callId];
      // A late dispatch result must not overwrite a human verdict already
      // recorded while the op was in flight.
      const keep = current?.status === "reconciled";
      draft.ops[op.callId] = {
        ...op,
        status: keep ? "reconciled" : status,
        result: result as unknown as JsonObject,
        error: result.ok ? null : (result.error?.message ?? "failed"),
      };
      return undefined;
    },
    context,
  );
}

function resultMessage(result: unknown, op: OpRecord) {
  const r = validResult(result) ? result : internal("Invalid stored result");
  return {
    content: [{ type: "text" as const, text: JSON.stringify(r) }],
    details: { opId: op.opId, attempts: op.attempts },
    isError: !r.ok,
  };
}
