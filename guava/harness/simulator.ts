import {
  canonical,
  failure,
  success,
  type Bridge,
  type Context,
  type Invoke,
  type Result,
  type TargetDescriptor,
} from "../src/shared/contract.ts";
// Scripted simulation, no LLM. This is NOT a production trusted host or MCP server.
const allowedReads = new Set([
  "canvas_get_graph",
  "canvas_get_neighbors",
  "evidence_search",
  "evidence_get",
]);
const allowedWrites = new Set([
  "canvas_apply_patch",
  "canvas_undo",
  "investigation_propose_conclusion",
  "demo_increment",
]);
export class HostSimulator {
  private target: TargetDescriptor | null = null;
  private bridge: Bridge | null = null;
  private consent = false;
  private session = "";
  private generation = 0;
  constructor(
    private runtimeOrigin: string,
    private getSession: () => Promise<string> = async () => "fixture-session",
  ) {}
  async discover(bridge?: Bridge) {
    this.generation++;
    this.consent = false;
    this.target = null;
    this.bridge = bridge ?? null;
    if (!bridge) return failure("UNSUPPORTED", "Page has no Agent App Bridge");
    try {
      const descriptor = await bridge.describe();
      const ctx = await bridge.getContext();
      if (
        descriptor.protocolVersion !== "0.1" ||
        descriptor.appId !== ctx.appId
      )
        return failure("UNSUPPORTED", "Unsupported descriptor");
      this.session = await this.getSession();
      this.target = {
        targetId: crypto.randomUUID(),
        pageInstanceId: crypto.randomUUID(),
        origin: this.runtimeOrigin,
        appId: descriptor.appId,
        documentId: ctx.documentId,
        title: ctx.summary.slice(0, 80),
      };
      return success(ctx.revision, { targets: [this.target] });
    } catch {
      return failure("UNAUTHORIZED", "Page is not authenticated");
    }
  }
  grantConsent() {
    this.consent = true;
  }
  revokeConsent() {
    this.consent = false;
    this.generation++;
  }
  close() {
    this.bridge = null;
    this.target = null;
    this.consent = false;
    this.generation++;
  }
  async context(targetId: string, pageInstanceId: string): Promise<Result> {
    const check = await this.binding(targetId, pageInstanceId);
    if (!check.ok) return check;
    return check;
  }
  private async binding(
    targetId: string,
    pageInstanceId: string,
  ): Promise<Result> {
    if (!this.consent)
      return failure("FORBIDDEN", "Simulation consent required");
    if (
      !this.target ||
      !this.bridge ||
      this.target.targetId !== targetId ||
      this.target.pageInstanceId !== pageInstanceId
    )
      return failure("TARGET_CLOSED", "Pinned target is no longer valid");
    try {
      const ctx = await this.bridge.getContext();
      if (
        ctx.documentId !== this.target.documentId ||
        ctx.appId !== this.target.appId ||
        (await this.getSession()) !== this.session
      ) {
        this.close();
        return failure("TARGET_CLOSED", "Document or session changed");
      }
      return success(ctx.revision, ctx);
    } catch {
      this.close();
      return failure("TARGET_CLOSED", "Page closed or logged out");
    }
  }
  async call(
    targetId: string,
    pageInstanceId: string,
    raw: Invoke,
    approve?: (preview: {
      target: TargetDescriptor;
      call: Invoke;
      expiresAt: number;
    }) => Promise<boolean>,
  ): Promise<Result> {
    const bound = await this.binding(targetId, pageInstanceId);
    if (!bound.ok) return bound;
    const call = structuredClone(raw);
    if (call.documentId !== this.target!.documentId)
      return failure("TARGET_CLOSED", "Document binding mismatch");
    if (!allowedReads.has(call.toolName) && !allowedWrites.has(call.toolName))
      return failure("FORBIDDEN", "Unknown tool denied by simulator policy");
    const descriptor = await this.bridge!.describe();
    if (!descriptor.tools.some((t) => t.name === call.toolName))
      return failure("UNSUPPORTED", "Tool is not registered");
    if (allowedWrites.has(call.toolName)) {
      if (!approve)
        return failure(
          "APPROVAL_DENIED",
          "No approval UI; write not dispatched",
        );
      const expiresAt = Date.now() + 60_000;
      const generation = this.generation;
      const preview = {
        target: structuredClone(this.target!),
        call: structuredClone(call),
        expiresAt,
      };
      const fingerprint = canonical(preview);
      const accepted = await approve(preview);
      if (!accepted)
        return failure("APPROVAL_DENIED", "User denied; page not called");
      if (
        Date.now() > expiresAt ||
        generation !== this.generation ||
        canonical(preview) !== fingerprint
      )
        return failure(
          "APPROVAL_DENIED",
          "Approval expired or payload changed",
        );
      const recheck = await this.binding(targetId, pageInstanceId);
      if (!recheck.ok) return recheck;
    }
    return this.bridge!.invoke(call);
  }
}
