import {
  bounded,
  CallSchema,
  ContextSchema,
  DescriptionSchema,
  ResultSchema,
  canonical,
  failure,
  hostSafeSchema,
  success,
  validateArguments,
  type Call,
  type Context,
  type Description,
  type Result,
  type Target,
  type Tool,
} from "../shared/contract.js";
export interface PageAdapter {
  target: Target;
  current(): Promise<Target>;
  describe(): Promise<unknown>;
  getContext(): Promise<unknown>;
  invoke(call: Call): Promise<unknown>;
}
export interface Approval {
  clientId: string;
  sessionId: string;
  target: Target;
  tool: Tool;
  call: Call;
  targetObjects: string[];
  canonicalArguments: string;
  expiresAt: number;
}
export interface Consent {
  clientId: string;
  sessionId: string;
  target: Target;
  // Opaque app-session marker pinned from getContext at consent time (null
  // when the app binds no session). Login, logout, account switch or session
  // rotation changes it and invalidates this consent and everything derived
  // from it (pairings, approvals) before further context or dispatch.
  sessionEpoch: string | null;
  reads: Set<string>;
}
export class HostPolicy {
  private valid = true;
  private seen = new Map<string, string>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    readonly adapter: PageAdapter,
    readonly consent: Consent,
    private approve:
      ((a: Approval, signal: AbortSignal) => Promise<boolean>) | null,
    readonly signal: AbortSignal,
  ) {}
  revoke() {
    this.valid = false;
  }
  private async binding(requestSignal?: AbortSignal): Promise<Context> {
    const signal = requestSignal
      ? AbortSignal.any([this.signal, requestSignal])
      : this.signal;
    if (signal.aborted) throw failure("CANCELLED", "Run cancelled");
    if (!this.valid) throw failure("FORBIDDEN", "Consent revoked");
    const current = await boundary(this.adapter.current(), signal);
    for (const key of [
      "targetId",
      "pageInstanceId",
      "origin",
      "appId",
      "documentId",
    ] as const)
      if (current[key] !== this.consent.target[key])
        throw failure(
          "STALE_CONTEXT",
          "Target changed; select and consent again",
        );
    const c = bounded(
      ContextSchema,
      await boundary(this.adapter.getContext(), signal),
    );
    if (c.documentId !== current.documentId || c.appId !== current.appId)
      throw failure("STALE_CONTEXT", "Document changed");
    // A session epoch appearing, changing or disappearing voids the consent
    // this policy was granted under — fail closed before returning context.
    if ((c.sessionEpoch ?? null) !== this.consent.sessionEpoch) {
      this.revoke();
      throw failure("STALE_CONTEXT", "App session changed; consent again");
    }
    return c;
  }
  async context(signal?: AbortSignal): Promise<Result> {
    return this.guard(async () => success(await this.binding(signal)));
  }
  async tools(signal?: AbortSignal): Promise<Result> {
    return this.guard(async () => {
      await this.binding(signal);
      return success(
        bounded(
          DescriptionSchema,
          await boundary(this.adapter.describe(), signal ?? this.signal),
        ),
      );
    });
  }
  private async guard(fn: () => Promise<Result>): Promise<Result> {
    try {
      return await fn();
    } catch (e) {
      // Caller faults are reported at their own sites (call envelope parse
      // below, argument validation). Everything reaching this catch is a
      // host/page boundary fault: classify by shape, never INVALID_ARGUMENT.
      if (ResultSchema.safeParse(e).success) return e as Result;
      const message =
        e instanceof Error ? e.message : "Unknown page boundary fault";
      if (e instanceof Error && e.name === "AbortError")
        return failure("CANCELLED", "Aborted at page boundary");
      if (adapterClosed(e)) return failure("TARGET_CLOSED", message);
      return failure("INTERNAL", message);
    }
  }
  call(raw: unknown, requestSignal?: AbortSignal): Promise<Result> {
    const task = this.tail.then(() =>
      this.guard(() => this.execute(raw, requestSignal)),
    );
    this.tail = task;
    return task;
  }
  private async execute(
    raw: unknown,
    requestSignal?: AbortSignal,
  ): Promise<Result> {
    let call: Call;
    try {
      call = bounded(CallSchema, raw);
    } catch (e) {
      // The only caller-fault site: the agent's own call envelope.
      return failure(
        "INVALID_ARGUMENT",
        "Malformed call envelope: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
    const signal = requestSignal
      ? AbortSignal.any([this.signal, requestSignal])
      : this.signal;
    if (signal.aborted) return failure("CANCELLED", "Request cancelled");
    const context = await this.binding(signal);
    if (call.documentId !== context.documentId)
      return failure("STALE_CONTEXT", "Call targets a different document");
    const description = bounded(
      DescriptionSchema,
      await boundary(this.adapter.describe(), signal),
    );
    if (description.appId !== context.appId)
      return failure("STALE_CONTEXT", "App changed");
    const tool = description.tools.find((t) => t.name === call.toolName);
    if (!tool) return failure("UNSUPPORTED", "Unknown tool");
    // A page-declared schema outside the host-safe dialect is the page's
    // fault, not the caller's; only genuine argument violations blame the
    // agent.
    if (!hostSafeSchema(tool.inputSchema))
      return failure(
        "UNSUPPORTED",
        "Tool inputSchema outside the host-safe dialect",
      );
    if (!validateArguments(tool, call.arguments))
      return failure("INVALID_ARGUMENT", "Arguments fail inputSchema");
    // Page effect never grants read permission: only explicitly user-consented names can auto-run.
    const read = tool.effect === "read" && this.consent.reads.has(tool.name);
    if (tool.effect === "read" && !read)
      return failure("FORBIDDEN", "Read tool not consented");
    if (
      read &&
      (call.expectedRevision !== null || call.idempotencyKey !== null)
    )
      return failure(
        "INVALID_ARGUMENT",
        "Read requires null revision and idempotency key",
      );
    if (
      !read &&
      (call.expectedRevision === null || call.idempotencyKey === null)
    )
      return failure(
        "INVALID_ARGUMENT",
        "Mutation requires revision and idempotency key",
      );
    const semantic = canonical({
      clientId: this.consent.clientId,
      sessionId: this.consent.sessionId,
      target: this.consent.target,
      call,
    });
    const old = this.seen.get(call.requestId);
    if (old && old !== semantic)
      return failure(
        "IDEMPOTENCY_CONFLICT",
        "requestId reused for different payload",
      );
    if (this.seen.size >= 1024)
      return failure("FORBIDDEN", "Session request budget exhausted");
    this.seen.set(call.requestId, semantic);
    if (!read) {
      if (!this.approve)
        return failure("APPROVAL_DENIED", "No active approver");
      const expiresAt = Date.now() + 60_000;
      const a: Approval = {
        clientId: this.consent.clientId,
        sessionId: this.consent.sessionId,
        target: { ...this.consent.target },
        tool,
        call: structuredClone(call),
        targetObjects: extractIds(call.arguments),
        canonicalArguments: canonical(call.arguments),
        expiresAt,
      };
      const approved = await waitApproval(this.approve, a, signal);
      if (!approved)
        return failure(
          signal.aborted ? "CANCELLED" : "APPROVAL_DENIED",
          "Approval denied, expired or cancelled",
        );
      if (Date.now() > expiresAt)
        return failure("APPROVAL_DENIED", "Approval expired");
    }
    await this.binding(signal);
    if (signal.aborted)
      return failure("CANCELLED", "Cancelled before dispatch");
    // No retry here. The app performs atomic revision/idempotency validation, including completed-key lookup first.
    try {
      return bounded(
        ResultSchema,
        await boundary(this.adapter.invoke(call), signal),
      );
    } catch (e) {
      return failure(
        "INTERNAL",
        "Dispatch outcome unknown; do not replay automatically. " +
          (e instanceof Error ? e.message : ""),
      );
    }
  }
}
// Walk the argument tree so nested explicit IDs (e.g. items:[{id:...}]) are
// also surfaced in the approval card, not just top-level *id/*ids keys.
function extractIds(args: Record<string, unknown>): string[] {
  const found: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 8 || found.length >= 64)
      return;
    for (const [key, v] of Object.entries(value)) {
      if (/ids?$/i.test(key)) {
        if (typeof v === "string") found.push(v);
        else if (Array.isArray(v))
          for (const x of v) if (typeof x === "string") found.push(x);
      }
      visit(v, depth + 1);
    }
  };
  visit(args, 0);
  return [...new Set(found)].slice(0, 64);
}
async function waitApproval(
  fn: (a: Approval, s: AbortSignal) => Promise<boolean>,
  a: Approval,
  s: AbortSignal,
): Promise<boolean> {
  if (s.aborted) return false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      s.removeEventListener("abort", cancel);
      resolve(v);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(cancel, Math.max(0, a.expiresAt - Date.now()));
    s.addEventListener("abort", cancel, { once: true });
    fn(a, s).then(finish, () => finish(false));
  });
}

// Adapters that cannot throw a Result envelope report a closed target with
// a named error or the platform's closed-tab message; catch both here.
function adapterClosed(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "TargetClosedError") return true;
  return /no tab with id|tab was closed|target closed|browser is closed/i.test(
    e.message,
  );
}

function boundary<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: unknown, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      error ? reject(error) : resolve(value as T);
    };
    const cancel = () => finish(failure("CANCELLED", "Boundary cancelled"));
    const timer = setTimeout(
      () =>
        finish(
          failure(
            "TIMEOUT",
            "Page boundary timed out; dispatch may have unknown outcome",
          ),
        ),
      15000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    promise.then(
      (v) => finish(null, v),
      (e) => finish(e),
    );
  });
}
