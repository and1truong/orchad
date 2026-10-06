// App-initiated prompt channel: shared constants and pure validators used by
// the isolated-world relay, the worker ingress and the sidepanel. Nothing in
// this file touches chrome.* so every check is unit-testable in Node.
//
// Trust model (issue #50): a page may PROPOSE an agent turn, never start one.
// The request crosses three independent validators — relay (shape/rate/
// concurrency), worker (sender/tab/document identity), sidepanel (live
// consent target) — then enters the same human approval queue mutations use.

// Page -> relay -> worker wire type (the only postMessage the page may send).
export const APP_REQUEST_TYPE = "lime:agentRequest";
// Host -> relay -> page wire type (the only postMessage the page receives).
export const APP_RESULT_TYPE = "lime:agentResult";
// runtime.sendMessage type for relay -> worker.
export const APP_REQUEST_WIRE = "lime:appRequest";
// runtime.sendMessage type for worker -> sidepanel (sender facts stamped by
// the worker; the sidepanel never trusts the raw page message).
export const APP_REQUEST_FORWARD = "lime:appRequest:ui";

// requestId is host-generated inside the page API: "appreq-" + UUID v4.
export const REQUEST_ID_PATTERN =
  /^appreq-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Prompt cap for the page-initiated channel (much smaller than the 64 KiB
// contract boundary — an app prompt is an instruction, not a payload).
export const MAX_PROMPT_BYTES = 4096;
// Final turn text returned to the page is bounded like contract strings.
export const MAX_RESULT_CHARS = 8192;
// Page-side promise deadline (~2 minutes per issue).
export const PAGE_TIMEOUT_MS = 120_000;
// Relay abuse controls: one in-flight request per tab, bounded rate.
export const MAX_PENDING_PER_TAB = 1;
export const RATE_LIMIT = 4;
export const RATE_WINDOW_MS = 60_000;
// Sidepanel replay guard keeps a bounded requestId history.
export const SEEN_LIMIT = 256;

// Provenance marker prepended to app-authored prompts in conversation
// history. The model must be able to tell these apart from user text.
export const APP_PROVENANCE = "Untrusted app request (instruction, not data): ";

export interface AppRequestMessage {
  requestId: string;
  prompt: string;
}

export interface AppResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface AppResultMessage extends AppResult {
  type: typeof APP_RESULT_TYPE;
  requestId: string;
}

export interface StampedPage {
  tabId: number;
  documentId: string;
  origin: string;
}

export interface ForwardedAppRequest {
  type: typeof APP_REQUEST_FORWARD;
  requestId: string;
  prompt: string;
  page: StampedPage;
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function promptBytes(prompt: string): number {
  return new TextEncoder().encode(prompt).length;
}

// Strict shape check for the page postMessage: exactly {type, requestId,
// prompt}, expected requestId format, prompt within the byte cap. Unknown
// fields are rejected — this channel is not a generic page RPC.
export function parseAppRequestMessage(data: unknown): AppRequestMessage | null {
  if (!object(data) || data.type !== APP_REQUEST_TYPE) return null;
  const keys = Object.keys(data);
  if (keys.length !== 3 || !keys.includes("requestId") || !keys.includes("prompt"))
    return null;
  const { requestId, prompt } = data;
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId))
    return null;
  if (typeof prompt !== "string" || prompt.length === 0) return null;
  if (promptBytes(prompt) > MAX_PROMPT_BYTES) return null;
  return { requestId, prompt };
}

// The page message type alone is enough to answer with a failure when a
// requestId is still readable — the page promise must never hang.
export function malformedRequestId(data: unknown): string | null {
  if (!object(data) || data.type !== APP_REQUEST_TYPE) return null;
  return typeof data.requestId === "string" &&
    REQUEST_ID_PATTERN.test(data.requestId)
    ? data.requestId
    : null;
}

// Shape check for host -> page results. Accepts at most the four known keys;
// ok:false may carry only error, ok:true only text.
export function parseAppResultMessage(data: unknown): AppResultMessage | null {
  if (!object(data) || data.type !== APP_RESULT_TYPE) return null;
  const keys = Object.keys(data);
  if (keys.length < 3 || keys.length > 4) return null;
  if (!keys.includes("requestId") || !keys.includes("ok")) return null;
  const { requestId, ok, text, error } = data;
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId))
    return null;
  if (typeof ok !== "boolean") return null;
  if (ok && typeof text !== "string") return null;
  if (!ok && typeof error !== "string") return null;
  const out: AppResultMessage = { type: APP_RESULT_TYPE, requestId, ok };
  if (typeof text === "string") out.text = text;
  if (typeof error === "string") out.error = error;
  return out;
}

// Build the bounded result envelope the page receives. Only final turn text
// or a failure string ever crosses — tool traces never leave the host.
export function makeAppResult(requestId: string, r: AppResult): AppResultMessage {
  const bounded = (s: string) => s.slice(0, MAX_RESULT_CHARS);
  return r.ok
    ? { type: APP_RESULT_TYPE, requestId, ok: true, text: bounded(r.text ?? "") }
    : {
        type: APP_RESULT_TYPE,
        requestId,
        ok: false,
        error: bounded(r.error ?? "request failed"),
      };
}

// Sliding-window rate limiter for the relay (injectable clock for tests).
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    private limit = RATE_LIMIT,
    private windowMs = RATE_WINDOW_MS,
    private now: () => number = () => Date.now(),
  ) {}
  allow(): boolean {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(t);
    return true;
  }
}

// Per-tab pending + replay bookkeeping. One in-flight request at a time;
// a requestId may never be replayed once seen (bounded memory: FIFO evict).
export class AppRequestBook {
  private pending = new Set<string>();
  private seen: string[] = [];
  constructor(private seenLimit = SEEN_LIMIT) {}
  // Returns null when acceptable, otherwise the rejection reason.
  enter(requestId: string): string | null {
    if (this.seen.includes(requestId) || this.pending.has(requestId))
      return "duplicate requestId";
    if (this.pending.size >= MAX_PENDING_PER_TAB) return "request already pending";
    this.pending.add(requestId);
    this.seen.push(requestId);
    if (this.seen.length > this.seenLimit) this.seen.shift();
    return null;
  }
  leave(requestId: string) {
    this.pending.delete(requestId);
  }
  has(requestId: string) {
    return this.pending.has(requestId);
  }
}

// Worker-side strict check of the forwarded payload shape (the object the
// worker itself constructed — guards against a malformed internal forward).
export function parseForwardedRequest(data: unknown): ForwardedAppRequest | null {
  if (!object(data) || data.type !== APP_REQUEST_FORWARD) return null;
  const keys = Object.keys(data);
  if (keys.length !== 4) return null;
  const { requestId, prompt, page } = data;
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId))
    return null;
  if (typeof prompt !== "string" || promptBytes(prompt) > MAX_PROMPT_BYTES)
    return null;
  if (!object(page)) return null;
  if (Object.keys(page).length !== 3) return null;
  if (
    typeof page.tabId !== "number" ||
    !Number.isInteger(page.tabId) ||
    typeof page.documentId !== "string" ||
    page.documentId.length === 0 ||
    page.documentId.length > 128 ||
    typeof page.origin !== "string" ||
    !/^https?:\/\//.test(page.origin)
  )
    return null;
  return {
    type: APP_REQUEST_FORWARD,
    requestId,
    prompt,
    page: {
      tabId: page.tabId,
      documentId: page.documentId,
      origin: page.origin,
    },
  };
}

// Extract the final assistant text from a completed turn's message list.
// Only this string may cross to the page — tool calls/results stay private,
// so a non-string assistant payload (e.g. a bare tool call) yields null.
export function finalAssistantText(
  messages: { role: string; content: unknown }[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    return typeof m.content === "string" ? m.content : null;
  }
  return null;
}
