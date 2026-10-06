import { defineTool } from "@earendil-works/pi-durable";
import { OpsDoc } from "./journal.js";
const RESULT_CAP = 65536;
const internal = (message) => ({
    ok: false,
    revision: null,
    data: null,
    error: { code: "INTERNAL", message, retryable: false },
});
const cancelled = () => ({
    ok: false,
    revision: null,
    data: null,
    error: { code: "CANCELLED", message: "Run cancelled", retryable: false },
});
function validResult(v) {
    if (!v || typeof v !== "object" || Array.isArray(v))
        return false;
    const r = v;
    return (typeof r.ok === "boolean" &&
        (r.revision === null || Number.isInteger(r.revision)) &&
        r.ok === (r.error === null) &&
        (r.error === null ||
            (typeof r.error === "object" &&
                r.error !== null &&
                typeof r.error.code === "string")));
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
export function orchardTool(descriptor, opts) {
    const isWrite = descriptor.effect !== "read";
    const replay = !isWrite || opts.idempotent ? "safe" : "unsafe";
    return defineTool({
        name: descriptor.name,
        description: descriptor.description,
        parameters: descriptor.inputSchema,
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
                        arguments: args,
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
            }
            else {
                // Re-entry after recovery: the envelope persists, but the host must
                // prove live consent/binding again before anything is sent.
                try {
                    await opts.revalidate?.(op.envelope);
                }
                catch (error) {
                    const result = internal(`Host revalidation failed: ${error instanceof Error ? error.message : "blocked"}`);
                    await settle(api, convId, op, result, "failed", context);
                    return resultMessage(result, op);
                }
            }
            if (op.status === "parked" && op.attempts === 0) {
                // Intent checkpoint (fresh op): op id + envelope + idempotencyKey
                // persist before the dispatch they describe can ever leave the
                // process. A recovered 'dispatched' op keeps its mark — downgrading
                // it to 'parked' would wrongly claim it never reached the host.
                await api.commit(async (tx) => {
                    const draft = await tx.doc(OpsDoc, convId);
                    draft.ops[api.callId] = op;
                    return undefined;
                }, context);
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
            await api.commit(async (tx) => {
                const draft = await tx.doc(OpsDoc, convId);
                draft.ops[api.callId] = op;
                return undefined;
            }, context);
            let result;
            try {
                const raw = await opts.dispatch(op.envelope, { opId: op.opId, attemptNo: op.attempts }, context);
                result = validResult(raw) ? raw : internal("Invalid host result");
            }
            catch {
                result = context?.abortSignal?.aborted ? cancelled() : internal("Host tool execution failed");
            }
            let serialized = JSON.stringify(result);
            if (serialized.length > RESULT_CAP) {
                result = internal("Host result exceeds size limit");
                serialized = JSON.stringify(result);
            }
            await settle(api, convId, op, result, result.ok ? "completed" : "failed", context);
            return {
                content: [{ type: "text", text: serialized }],
                details: { opId: op.opId, attempts: op.attempts },
                isError: !result.ok,
            };
        },
    });
}
async function settle(api, convId, op, result, status, context) {
    await api.commit(async (tx) => {
        const draft = await tx.doc(OpsDoc, convId);
        draft.ops[op.callId] = {
            ...op,
            status,
            result: result,
            error: result.ok ? null : (result.error?.message ?? "failed"),
        };
        return undefined;
    }, context);
}
function resultMessage(result, op) {
    const r = validResult(result) ? result : internal("Invalid stored result");
    return {
        content: [{ type: "text", text: JSON.stringify(r) }],
        details: { opId: op.opId, attempts: op.attempts },
        isError: !r.ok,
    };
}
