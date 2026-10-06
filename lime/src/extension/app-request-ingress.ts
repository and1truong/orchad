// Sidepanel-side handler for app-initiated prompt requests (issue #50).
// The worker stamps verified sender facts and forwards; this class re-checks
// them against the LIVE consent target (never a cached binding), enforces
// single-pending + replay protection, drives the human approval card, runs
// the approved turn through the normal agent/HostPolicy path, and reports
// only the final turn output back toward the page.

import {
  parseForwardedRequest,
  type AppResult,
  type StampedPage,
} from "./app-request.js";
import type { Approval } from "../host/policy.js";
import type { Target, Tool, Call } from "../shared/contract.js";

export interface AppIngressDeps {
  // Live consent target, or null when there is no valid consent.
  consentTarget(): Target | null;
  // Chrome-side binding of the pinned document (runtime ids).
  pinnedPage(): { tabId: number; documentId: string } | null;
  // True while a user- or app-initiated turn is already running.
  busy(): boolean;
  // Enqueue the untrusted-prompt approval card; resolves with the verdict.
  ask(approval: Approval): Promise<boolean>;
  // Deliver the final result toward the page (chrome.tabs.sendMessage bound
  // to the pinned runtime document).
  finish(page: StampedPage, requestId: string, result: AppResult): void;
  // Run exactly one agent turn with the provenance-marked prompt; resolves
  // with the final turn text/failure only.
  run(prompt: string): Promise<AppResult>;
}

interface Pending {
  requestId: string;
  page: StampedPage;
}

const PSEUDO_TOOL: Tool = {
  name: "agent_turn",
  description: "App-initiated agent prompt (untrusted instruction)",
  inputSchema: { type: "object" },
  effect: "write",
};

export class AppRequestIngress {
  private pending: Pending | null = null;
  private seen: string[] = [];
  constructor(private deps: AppIngressDeps) {}

  // Handle one worker-forwarded request; `respond` gets the immediate
  // verdict (queued vs rejected — approval itself resolves later).
  handle(message: unknown, respond: (v: { ok: boolean; error?: string }) => void) {
    const req = parseForwardedRequest(message);
    if (!req) return respond({ ok: false, error: "malformed request" });
    const target = this.deps.consentTarget();
    const pinned = this.deps.pinnedPage();
    // Fail closed whenever consent is absent, revoked or retargeted. The
    // checks pin the request to the exact origin AND the exact runtime
    // document/tab — tab id alone is insufficient.
    if (!target || !pinned)
      return respond({ ok: false, error: "no active consent" });
    if (req.page.tabId !== pinned.tabId)
      return respond({ ok: false, error: "unpinned tab" });
    if (req.page.documentId !== pinned.documentId)
      return respond({ ok: false, error: "stale document" });
    if (req.page.origin !== target.origin)
      return respond({ ok: false, error: "origin mismatch" });
    if (this.pending || this.seen.includes(req.requestId))
      return respond({ ok: false, error: "duplicate or pending request" });
    if (this.deps.busy())
      return respond({ ok: false, error: "agent turn already running" });
    this.seen.push(req.requestId);
    if (this.seen.length > 256) this.seen.shift();
    this.pending = { requestId: req.requestId, page: req.page };
    const approval: Approval = {
      clientId: "app:" + target.origin,
      sessionId: "app-request",
      target: { ...target },
      tool: PSEUDO_TOOL,
      call: {
        requestId: req.requestId,
        documentId: target.documentId,
        toolName: PSEUDO_TOOL.name,
        arguments: {},
        expectedRevision: null,
        idempotencyKey: null,
      } as Call,
      targetObjects: [],
      canonicalArguments: "",
      expiresAt: Date.now() + 60_000,
      appPrompt: { requestId: req.requestId, prompt: req.prompt },
    };
    respond({ ok: true });
    // Deferred so a synchronous throw in ask/run settles the pending entry
    // instead of leaking it (a stuck entry would block all later requests).
    Promise.resolve()
      .then(() => this.deps.ask(approval))
      .then((yes) =>
        yes
          ? this.deps.run(req.prompt)
          : Promise.resolve<AppResult>({
              ok: false,
              error: "denied or expired",
            }),
      )
      .then(
        (result) => this.settle(req.requestId, result),
        () =>
          this.settle(req.requestId, { ok: false, error: "agent turn failed" }),
      );
  }

  // Consent revocation, navigation or host teardown: a pending request must
  // resolve as failure, never hang and never run later.
  invalidateAll() {
    const p = this.pending;
    this.pending = null;
    if (p)
      this.deps.finish(p.page, p.requestId, {
        ok: false,
        error: "consent revoked or target changed",
      });
  }

  private settle(requestId: string, result: AppResult) {
    const p = this.pending;
    this.pending = null;
    if (!p || p.requestId !== requestId) return;
    this.deps.finish(p.page, requestId, result);
  }
}
