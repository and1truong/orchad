import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, } from "@earendil-works/pi-ai";
import { defineDoc, defineExtension, Harness, createRegistry, } from "@earendil-works/pi-durable";
import { MetaDoc, OpsDoc, RUNTIME_VERSION, SCHEMA_VERSION, } from "./journal.js";
import { createMangoProvider } from "./provider.js";
import { openOwnedStorage } from "./storage.js";
import { phaseOf } from "./status.js";
import { orchardTool } from "./tools.js";
import { transcriptToWire } from "./transcript.js";
const ControlDoc = defineDoc({
    kind: "orchard.control",
    version: SCHEMA_VERSION,
    scope: "conversation",
    history: "latest",
    fork: "current",
    initial: () => ({ cancelledAt: null }),
});
export class IncompatibleStorage extends Error {
    stored;
    constructor(stored) {
        super(`Storage version is incompatible: stored schema=${stored.schemaVersion} runtime=${stored.runtime}`);
        this.stored = stored;
        this.name = "IncompatibleStorage";
    }
}
/** Memory-only credential store: the gateway token lives here, never in the DB. */
class MemoryCredentials {
    #creds = new Map();
    async read(providerId) {
        return this.#creds.get(providerId);
    }
    async list() {
        return [...this.#creds.keys()].map((providerId) => ({
            providerId,
            type: "api_key",
        }));
    }
    async modify(providerId, fn) {
        const next = await fn(this.#creds.get(providerId));
        if (next === undefined)
            this.#creds.delete(providerId);
        else
            this.#creds.set(providerId, next);
        return next;
    }
    async delete(providerId) {
        this.#creds.delete(providerId);
    }
}
export async function openRunner(options, context = BACKGROUND_CONTEXT) {
    const owned = await openOwnedStorage(options.storagePath, context);
    const credentials = new MemoryCredentials();
    const gateway = {};
    let boundTargets = new Map();
    const revisionByTarget = new Map();
    const waiters = new Set();
    const park = () => new Promise((resolve) => waiters.add(resolve));
    const provider = createMangoProvider({
        getGatewayBaseUrl: () => gateway.current?.baseUrl ?? "",
        fetcher: options.fetcher,
        modelIds: ["orchard-model"],
        tools: () => [...boundTargets.values()].flatMap((b) => b.binding.tools),
        maxSteps: options.maxSteps ?? 8,
        maxToolCalls: options.maxToolCalls ?? 16,
    });
    const models = createModels({ credentials });
    models.setProvider(provider);
    const registry = createRegistry();
    const buildTools = () => [...boundTargets.values()].flatMap(({ binding, dispatch }) => binding.tools.map((descriptor) => orchardTool(descriptor, {
        targetId: binding.targetId,
        idempotent: binding.idempotentTools?.includes(descriptor.name) ?? false,
        getRevision: () => revisionByTarget.get(binding.targetId) ?? null,
        revalidate: binding.revalidate,
        whenBound: park,
        dispatch: async (envelope, attempt, ctx) => {
            const result = await dispatch(envelope, attempt, ctx);
            if (result.ok && typeof result.revision === "number")
                revisionByTarget.set(envelope.targetId, result.revision);
            return result;
        },
    })));
    let orchardExt = defineExtension({ name: "orchard", tools: buildTools() });
    registry.install(orchardExt);
    const republish = () => {
        orchardExt = defineExtension({ name: "orchard", tools: buildTools() });
        registry.install(orchardExt);
    };
    let harness;
    try {
        harness = await Harness.open(owned.storage, { models, registry, settings: { toolExecution: "sequential" } }, context);
    }
    catch (error) {
        owned.release();
        throw error;
    }
    // Store version gate: first open stamps schema+runtime; a later reopen with
    // a different build fails closed before any scheduling resumes.
    const meta = await harness.commit(async (tx) => {
        const draft = await tx.doc(MetaDoc);
        return { schemaVersion: draft.schemaVersion, runtime: draft.runtime };
    }, context);
    if (meta.schemaVersion !== SCHEMA_VERSION ||
        meta.runtime !== RUNTIME_VERSION) {
        await harness.close(context).catch(() => { });
        owned.release();
        throw new IncompatibleStorage(meta);
    }
    const root = await harness.root(context, {
        agent: {
            model: {
                provider: "mango",
                modelId: gateway.current?.model ?? "orchard-model",
            },
            ...(options.instructions ? { instructions: options.instructions } : {}),
            extensions: [orchardExt],
        },
    });
    const statusOf = async () => {
        const [inspection, opsDoc, ctrl, view] = await Promise.all([
            harness.inspect(context),
            harness.snapshot(OpsDoc, root.id, context),
            harness.snapshot(ControlDoc, root.id, context),
            root.context(context),
        ]);
        const ops = Object.values(opsDoc?.ops ?? {}).map((o) => ({
            opId: o.opId,
            toolName: o.envelope.toolName,
            status: o.status,
            attempts: o.attempts,
            error: o.error,
        }));
        const submissions = inspection.submissions
            .filter((s) => s.type === "input")
            .map((s) => ({
            requestId: s.requestId,
            status: s.status,
            reason: s.reason,
        }));
        const tasks = inspection.tasks.map((t) => ({
            name: t.record.kind,
            state: t.state.kind,
        }));
        let lastError;
        for (const m of [...view.messages].reverse()) {
            if (m.role === "assistant") {
                const a = m;
                if (a.errorMessage)
                    lastError = a.errorMessage;
                break;
            }
        }
        const { phase, reason } = phaseOf({
            scheduling: inspection.scheduling,
            tasks,
            submissions,
            ops,
            hostBound: boundTargets.size > 0,
            cancelled: false,
            lastError,
        });
        return {
            phase: ctrl?.cancelledAt != null
                ? "cancelled"
                : ops.some((o) => o.status === "parked") && boundTargets.size === 0
                    ? "waiting_for_host"
                    : phase,
            conversationId: String(root.id),
            submissions,
            ops,
            tasks,
            reason,
            detail: lastError,
        };
    };
    const notify = new Set();
    let lastPhase;
    const publish = () => {
        void statusOf()
            .then((s) => {
            if (s.phase !== lastPhase) {
                lastPhase = s.phase;
                for (const cb of [...notify])
                    try {
                        cb(s);
                    }
                    catch { }
            }
        })
            .catch(() => { });
    };
    harness.subscribeCommits(publish);
    const runner = {
        conversationId: String(root.id),
        get bound() {
            return boundTargets.size > 0;
        },
        async configure(g) {
            gateway.current = g;
            await credentials.modify("mango", async () => ({
                type: "api_key",
                key: g.token,
            }));
            await root.configure({ model: { provider: "mango", modelId: g.model } }, context);
        },
        async bind(bindings, dispatch) {
            for (const b of bindings)
                boundTargets.set(b.targetId, { binding: b, dispatch });
            republish();
            await root.configure({ extensions: [orchardExt] }, context);
            for (const wake of [...waiters])
                wake();
            waiters.clear();
            publish();
        },
        unbind() {
            boundTargets = new Map();
            republish();
            publish();
        },
        async submit({ prompt, requestId }) {
            const rid = requestId ?? crypto.randomUUID();
            await harness.commit(async (tx) => {
                const c = await tx.doc(ControlDoc, root.id);
                c.cancelledAt = null;
                return undefined;
            }, context);
            const sub = await root.submit({ type: "input", content: prompt, requestId: rid }, context);
            publish();
            return { submissionId: String(sub.id), requestId: rid };
        },
        async resume() {
            harness.resume();
            publish();
            return statusOf();
        },
        async cancel() {
            await harness.commit(async (tx) => {
                const c = await tx.doc(ControlDoc, root.id);
                c.cancelledAt = Date.now();
                return undefined;
            }, context);
            await root.abort(context);
            for (const wake of [...waiters])
                wake();
            publish();
            return statusOf();
        },
        status: statusOf,
        async transcript() {
            const view = await root.context(context);
            return transcriptToWire(view.messages);
        },
        async reconcile() {
            const [inspection, view] = await Promise.all([
                harness.inspect(context),
                root.context(context),
            ]);
            const liveCalls = new Set();
            for (const t of inspection.tasks) {
                const input = t.record.input;
                if (input?.callId)
                    liveCalls.add(input.callId);
            }
            const settledCalls = new Set();
            for (const m of view.messages)
                if (m.role === "toolResult")
                    settledCalls.add(m.toolCallId);
            await harness.commit(async (tx) => {
                const draft = await tx.doc(OpsDoc, root.id);
                for (const key of Object.keys(draft.ops)) {
                    const op = draft.ops[key];
                    if (op.status === "dispatched" && !liveCalls.has(op.callId)) {
                        draft.ops[key] = settledCalls.has(op.callId)
                            ? { ...op, status: "interrupted" }
                            : {
                                ...op,
                                status: "ambiguous",
                                error: "Dispatch outcome unknown: backend may have applied it",
                            };
                    }
                    else if (op.status === "parked" &&
                        !liveCalls.has(op.callId) &&
                        !settledCalls.has(op.callId))
                        draft.ops[key] = {
                            ...op,
                            status: "interrupted",
                            error: "Interrupted before dispatch",
                        };
                }
                return undefined;
            }, context);
            publish();
            return statusOf();
        },
        async resolveOp(callId, outcome) {
            await harness.commit(async (tx) => {
                const draft = await tx.doc(OpsDoc, root.id);
                const op = draft.ops[callId];
                if (!op)
                    throw new Error(`Unknown op ${callId}`);
                if (op.status === "completed" || op.status === "reconciled")
                    return undefined;
                draft.ops[callId] = {
                    ...op,
                    status: outcome.status === "reconciled" ? "reconciled" : "failed",
                    result: outcome.status === "reconciled"
                        ? outcome.result
                        : op.result,
                    error: outcome.status === "failed" ? outcome.error : op.error,
                };
                return undefined;
            }, context);
            publish();
        },
        watch(cb) {
            notify.add(cb);
            return () => {
                notify.delete(cb);
            };
        },
        async close() {
            for (const wake of [...waiters])
                wake();
            waiters.clear();
            await harness.close(context);
            owned.release();
        },
    };
    publish();
    return runner;
}
