import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Context } from "@earendil-works/chord";
import {
  createModels,
  type Credential,
  type CredentialStore,
} from "@earendil-works/pi-ai";
import {
  defineDoc,
  defineExtension,
  Harness,
  createRegistry,
  type Conversation,
} from "@earendil-works/pi-durable";
import type {
  Result,
  ToolDescriptor,
  Message,
} from "@orchard/agent-client";
import {
  MetaDoc,
  OpsDoc,
  RUNTIME_VERSION,
  SCHEMA_VERSION,
  type OpEnvelope,
  type OpRecord,
} from "./journal.js";
import { createMangoProvider } from "./provider.js";
import { openOwnedStorage } from "./storage.js";
import { phaseOf, type RunStatus } from "./status.js";
import { orchardTool } from "./tools.js";
import { transcriptToWire } from "./transcript.js";

const ControlDoc = defineDoc<{ cancelledAt: number | null }>({
  kind: "orchard.control",
  version: SCHEMA_VERSION,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ cancelledAt: null }),
});

export class IncompatibleStorage extends Error {
  constructor(
    public readonly stored: { schemaVersion: number; runtime: string },
  ) {
    super(
      `Storage version is incompatible: stored schema=${stored.schemaVersion} runtime=${stored.runtime}`,
    );
    this.name = "IncompatibleStorage";
  }
}

/** Memory-only credential store: the gateway token lives here, never in the DB. */
class MemoryCredentials implements CredentialStore {
  #creds = new Map<string, Credential>();
  async read(providerId: string) {
    return this.#creds.get(providerId);
  }
  async list() {
    return [...this.#creds.keys()].map((providerId) => ({
      providerId,
      type: "api_key" as const,
    }));
  }
  async modify(
    providerId: string,
    fn: (c: Credential | undefined) => Promise<Credential | undefined>,
  ) {
    const next = await fn(this.#creds.get(providerId));
    if (next === undefined) this.#creds.delete(providerId);
    else this.#creds.set(providerId, next);
    return next;
  }
  async delete(providerId: string) {
    this.#creds.delete(providerId);
  }
}

export type RunnerGateway = {
  baseUrl: string;
  /** Live bearer token — memory only, never persisted. */
  token: string;
  model: string;
};

export type HostBinding = {
  targetId: string;
  tools: ToolDescriptor[];
  /**
   * Current committed revision of this target at bind time. Write ops CAS on
   * it (expectedRevision); refreshed from host results after each dispatch.
   */
  revision?: () => number | null;
  /** Names of write tools whose backend dedups by idempotencyKey. */
  idempotentTools?: readonly string[];
  /** Host consent/approval gate consulted before any re-dispatch. */
  revalidate?: (envelope: OpEnvelope) => Promise<void>;
};

export type HostDispatchFn = (
  envelope: OpEnvelope,
  attempt: { opId: string; attemptNo: number },
  context: Context,
) => Promise<Result>;

export type RunnerOptions = {
  storagePath: string;
  fetcher?: typeof fetch;
  instructions?: string;
  maxSteps?: number;
  maxToolCalls?: number;
};

export type DurableRunner = {
  readonly conversationId: string;
  /** Supply/replace live gateway credentials. Nothing is persisted. */
  configure(gateway: RunnerGateway): Promise<void>;
  /** Rebind host targets; parked dispatches wake + revalidate + dispatch. */
  bind(bindings: HostBinding[], dispatch: HostDispatchFn): Promise<void>;
  unbind(): void;
  readonly bound: boolean;
  /** Durably admit user input; same requestId returns the same submission. */
  submit(input: {
    prompt: string;
    requestId?: string;
  }): Promise<{ submissionId: string; requestId: string }>;
  /** Re-enable scheduling (after reopen or host reconnect). */
  resume(): Promise<RunStatus>;
  /** Persist cancel intent, abort live tasks, release parked work. */
  cancel(): Promise<RunStatus>;
  status(): Promise<RunStatus>;
  /** Wire transcript for display/replay. */
  transcript(): Promise<{ messages: Message[]; dropped: number }>;
  /** Cross-check journal vs committed entries; classify ambiguous ops. */
  reconcile(): Promise<RunStatus>;
  /** Host/user verdict for an ambiguous op. */
  resolveOp(
    callId: string,
    outcome:
      | { status: "reconciled"; result?: unknown }
      | { status: "failed"; error: string },
  ): Promise<void>;
  /** Notify on phase change. */
  watch(cb: (status: RunStatus) => void): () => void;
  close(): Promise<void>;
};

export async function openRunner(
  options: RunnerOptions,
  context: Context = BACKGROUND_CONTEXT,
): Promise<DurableRunner> {
  const owned = await openOwnedStorage(options.storagePath, context);
  const credentials = new MemoryCredentials();
  const gateway: { current?: RunnerGateway } = {};
  // Every target ever bound this session keeps its tools published: a model
  // call for an offline host mints a parked op instead of "unknown tool",
  // which is what 'waiting_for_host' means. boundTargets is the live subset.
  const knownTargets = new Map<string, HostBinding>();
  let boundTargets = new Map<string, { binding: HostBinding; dispatch: HostDispatchFn }>();
  const revisionByTarget = new Map<string, number>();
  // Parked ops wait on their own target: bind() wakes only ops whose target
  // actually came back; other targets stay parked, provably undispatched.
  const waiters = new Map<string, Set<() => void>>();
  const park = (targetId: string) =>
    boundTargets.has(targetId)
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const set = waiters.get(targetId) ?? new Set();
          set.add(resolve);
          waiters.set(targetId, set);
        });
  const wake = (targetId: string) => {
    for (const resolve of waiters.get(targetId) ?? []) resolve();
    waiters.delete(targetId);
  };
  const wakeAll = () => {
    for (const set of waiters.values()) for (const resolve of set) resolve();
    waiters.clear();
  };

  const provider = createMangoProvider({
    getGatewayBaseUrl: () => gateway.current?.baseUrl ?? "",
    fetcher: options.fetcher,
    modelIds: () => [gateway.current?.model ?? "orchard-model"],
    tools: () => uniqueTools().flatMap((b) => b.tools),
    maxSteps: options.maxSteps ?? 8,
    maxToolCalls: options.maxToolCalls ?? 16,
  });
  const models = createModels({ credentials });
  models.setProvider(provider);

  const registry = createRegistry();
  // Several bindings may expose the same tool (re-pin after a panel reopen
  // creates a fresh targetId for the same document). First binding wins per
  // tool name — the model has no way to disambiguate two anyway — and live
  // bindings are visited first so a minted op targets a dispatchable host.
  const orderedBindings = () => [
    ...[...boundTargets.values()].map((x) => x.binding),
    ...knownTargets.values(),
  ];
  const uniqueTools = () => {
    const seen = new Set<string>();
    const out: HostBinding[] = [];
    for (const b of orderedBindings()) {
      const fresh = b.tools.filter((t) => !seen.has(t.name));
      for (const t of fresh) seen.add(t.name);
      if (fresh.length) out.push({ ...b, tools: fresh });
    }
    return out;
  };
  const buildTools = () =>
    uniqueTools().flatMap((binding) =>
      binding.tools.map((descriptor) =>
        orchardTool(descriptor, {
          targetId: binding.targetId,
          idempotent:
            binding.idempotentTools?.includes(descriptor.name) ?? false,
          getRevision: () => revisionByTarget.get(binding.targetId) ?? null,
          revalidate: binding.revalidate,
          whenBound: () => park(binding.targetId),
          dispatch: async (envelope, attempt, ctx) => {
            // Resolved at dispatch time so a recovered op rides the CURRENT
            // binding, not whatever closure was live when the task started.
            const live = boundTargets.get(envelope.targetId);
            if (!live)
              return {
                ok: false,
                revision: null,
                data: null,
                error: {
                  code: "TARGET_CLOSED",
                  message: "Host target is not bound",
                  retryable: true,
                },
              };
            const result = await live.dispatch(envelope, attempt, ctx);
            if (result.ok && typeof result.revision === "number")
              revisionByTarget.set(envelope.targetId, result.revision);
            return result;
          },
        }),
      ),
    );
  let orchardExt = defineExtension({ name: "orchard", tools: buildTools() });
  registry.install(orchardExt);
  const republish = () => {
    orchardExt = defineExtension({ name: "orchard", tools: buildTools() });
    registry.install(orchardExt);
  };

  let harness: Harness;
  try {
    harness = await Harness.open(
      owned.storage,
      { models, registry, settings: { toolExecution: "sequential" } },
      context,
    );
  } catch (error) {
    owned.release();
    throw error;
  }
  // Store version gate: first open stamps schema+runtime; a later reopen with
  // a different build fails closed before any scheduling resumes.
  const meta = await harness.commit(async (tx) => {
    const draft = await tx.doc(MetaDoc);
    return { schemaVersion: draft.schemaVersion, runtime: draft.runtime };
  }, context);
  if (
    meta.schemaVersion !== SCHEMA_VERSION ||
    meta.runtime !== RUNTIME_VERSION
  ) {
    await harness.close(context).catch(() => {});
    owned.release();
    throw new IncompatibleStorage(meta);
  }

  const root: Conversation = await harness.root(context, {
    agent: {
      model: {
        provider: "mango",
        modelId: gateway.current?.model ?? "orchard-model",
      },
      ...(options.instructions ? { instructions: options.instructions } : {}),
      extensions: [orchardExt],
    },
  });

  const statusOf = async (): Promise<RunStatus> => {
    const [inspection, opsDoc, ctrl, view, subsPage] = await Promise.all([
      harness.inspect(context),
      harness.snapshot(OpsDoc, root.id, context),
      harness.snapshot(ControlDoc, root.id, context),
      root.context(context),
      owned.storage.scanSubmissions(
        { conversationId: root.id },
        64,
        undefined,
        context,
      ),
    ]);
    const ops = Object.values(opsDoc?.ops ?? {}).map((o) => ({
      opId: o.opId,
      toolName: o.envelope.toolName,
      status: o.status,
      attempts: o.attempts,
      error: o.error,
    }));
    // Inspection hides settled submissions, but the settlement is the only
    // record of a terminally failed run — the context view drops a trailing
    // error assistant, so an unanswered input is read back from storage.
    const inputSubs = subsPage.items.filter((s) => s.type === "input");
    const submissions = inputSubs.map((s) => ({
      requestId: s.requestId,
      status: s.status,
      reason: s.reason,
    }));
    const tasks = inspection.tasks.map((t) => ({
      name: t.record.kind,
      state: t.state.kind,
    }));
    let lastError: string | undefined;
    let tailSettled = false;
    let inputPending = false;
    for (const m of [...view.messages].reverse()) {
      if (m.role === "assistant") {
        const a = m as { stopReason?: string; errorMessage?: string };
        if (a.errorMessage) lastError = a.errorMessage;
        else if (a.stopReason === "stop") tailSettled = true;
        break;
      }
      if (m.role === "user") {
        inputPending = true;
        break;
      }
    }
    const lastUnanswered = [...inputSubs]
      .reverse()
      .find((s) => s.status === "unanswered");
    if (lastUnanswered)
      lastError ??=
        typeof lastUnanswered.detail === "string"
          ? lastUnanswered.detail
          : (lastUnanswered.reason ?? "model_error");
    const { phase, reason } = phaseOf({
      tasks,
      submissions,
      ops,
      hostBound: boundTargets.size > 0,
      cancelled: ctrl?.cancelledAt != null,
      inputPending,
      tailSettled,
      lastError,
    });
    return {
      phase,
      conversationId: String(root.id),
      submissions,
      ops,
      tasks,
      reason,
      detail: lastError,
    };
  };

  const notify = new Set<(s: RunStatus) => void>();
  let lastPhase: string | undefined;
  const publish = () => {
    void statusOf()
      .then((s) => {
        if (s.phase !== lastPhase) {
          lastPhase = s.phase;
          for (const cb of [...notify])
            try {
              cb(s);
            } catch {}
        }
      })
      .catch(() => {});
  };
  harness.subscribeCommits(publish);

  const runner: DurableRunner = {
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
      await root.configure(
        { model: { provider: "mango", modelId: g.model } },
        context,
      );
      // Publish the (possibly new) model id into Models' catalog.
      await models.refresh({ providers: ["mango"] }).catch(() => {});
    },
    async bind(bindings, dispatch) {
      for (const b of bindings) {
        boundTargets.set(b.targetId, { binding: b, dispatch });
        knownTargets.set(b.targetId, b);
        // Seed the CAS baseline once per rebind; after that, successful
        // results carry the authoritative revision forward. A stale bind-time
        // snapshot must never regress a revision a result already advanced.
        if (b.revision) {
          const rev = b.revision();
          if (
            typeof rev === "number" &&
            rev > (revisionByTarget.get(b.targetId) ?? -1)
          )
            revisionByTarget.set(b.targetId, rev);
        }
      }
      republish();
      await root.configure({ extensions: [orchardExt] }, context);
      for (const b of bindings) wake(b.targetId);
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
      const sub = await root.submit(
        { type: "input", content: prompt, requestId: rid },
        context,
      );
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
      wakeAll();
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
      const liveCalls = new Set<string>();
      for (const t of inspection.tasks) {
        const input = t.record.input as { callId?: string } | undefined;
        if (input?.callId) liveCalls.add(input.callId);
      }
      const settledCalls = new Set<string>();
      for (const m of view.messages)
        if (m.role === "toolResult")
          settledCalls.add((m as { toolCallId: string }).toolCallId);
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
          } else if (
            op.status === "parked" &&
            !liveCalls.has(op.callId) &&
            !settledCalls.has(op.callId)
          )
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
        if (!op) throw new Error(`Unknown op ${callId}`);
        if (op.status === "completed" || op.status === "reconciled")
          return undefined;
        draft.ops[callId] = {
          ...op,
          status: outcome.status === "reconciled" ? "reconciled" : "failed",
          result:
            outcome.status === "reconciled"
              ? (outcome.result as OpRecord["result"])
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
      wakeAll();
      await harness.close(context);
      owned.release();
    },
  };
  publish();
  return runner;
}
