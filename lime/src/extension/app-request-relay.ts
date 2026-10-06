// Isolated-world relay for the app-initiated prompt channel (issue #50).
// Injected by the sidepanel via chrome.scripting.executeScript into exactly
// the pinned + consented document — never manifest-registered on <all_urls>.
//
// This relay is intentionally narrow: it forwards ONE page postMessage type
// (lime:agentRequest) to the worker and ONE runtime message type
// (lime:agentResult) back to the page. It is not a generic page <-> extension
// RPC bridge and performs no tool dispatch itself.

import {
  APP_RESULT_TYPE,
  APP_REQUEST_WIRE,
  AppRequestBook,
  RateLimiter,
  makeAppResult,
  malformedRequestId,
  parseAppRequestMessage,
  parseAppResultMessage,
  type AppResult,
  type AppResultMessage,
} from "./app-request.js";

export interface RelayDeps {
  // True only for the top frame of the pinned document.
  isTopFrame(): boolean;
  // Deliver a result envelope to the page (window.postMessage).
  postToPage(result: AppResultMessage): void;
  // Forward a validated request to the worker; resolves with the worker's
  // immediate verdict (queued for approval vs rejected up front).
  sendToWorker(message: {
    type: typeof APP_REQUEST_WIRE;
    requestId: string;
    prompt: string;
  }): Promise<{ ok: boolean; error?: string }>;
  // Register a handler for runtime messages from the extension
  // (chrome.tabs.sendMessage results addressed to this document).
  onWorkerResult(handler: (message: unknown) => void): void;
}

export function createRelay(deps: RelayDeps) {
  const book = new AppRequestBook();
  const rate = new RateLimiter();

  const deliver = (requestId: string, result: AppResult) =>
    deps.postToPage(makeAppResult(requestId, result));

  function handlePageMessage(event: { source: unknown; data: unknown }) {
    // Top frame only, same-window messages only. A nested frame or a message
    // from another window can never enter the channel.
    if (!deps.isTopFrame() || event.source !== "window") return;
    const parsed = parseAppRequestMessage(event.data);
    if (!parsed) {
      // It claimed our type but failed the strict shape: resolve the page's
      // promise with a failure when a usable requestId survives, else drop.
      const requestId = malformedRequestId(event.data);
      if (requestId) deliver(requestId, { ok: false, error: "malformed request" });
      return;
    }
    const { requestId, prompt } = parsed;
    const blocked = book.enter(requestId);
    if (blocked || !rate.allow()) {
      book.leave(requestId);
      deliver(requestId, {
        ok: false,
        error: blocked ?? "rate limit exceeded",
      });
      return;
    }
    deps
      .sendToWorker({ type: APP_REQUEST_WIRE, requestId, prompt })
      .then((ack) => {
        if (ack?.ok) return; // accepted into the approval flow; await result
        book.leave(requestId);
        deliver(requestId, {
          ok: false,
          error: ack?.error || "rejected by host",
        });
      })
      .catch((e: unknown) => {
        book.leave(requestId);
        deliver(requestId, {
          ok: false,
          error: e instanceof Error ? e.message : "host unreachable",
        });
      });
  }

  function handleWorkerResult(message: unknown) {
    const result = parseAppResultMessage(message);
    if (!result || !book.has(result.requestId)) return;
    book.leave(result.requestId);
    deps.postToPage(result);
  }

  deps.onWorkerResult(handleWorkerResult);
  return { handlePageMessage, handleWorkerResult };
}

// --- Live wiring (injected file only) -------------------------------------
// Runs once per isolated world. A double-injection (e.g. consent re-clicked
// on the same document) must not register a second listener pair — the flag
// lives on the isolated world's own window, invisible to the page.
declare const chrome: any;

const w = globalThis as any;
if (
  typeof chrome !== "undefined" &&
  chrome?.runtime?.id &&
  !w.__limeAppRequestRelay
) {
  w.__limeAppRequestRelay = true;
  const relay = createRelay({
    isTopFrame: () => w.top === w,
    postToPage: (result) =>
      w.postMessage(result, w.location?.origin ?? "*"),
    sendToWorker: (message) =>
      new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(message, (ack: unknown) => {
            void chrome.runtime.lastError; // swallow "receiving end" noise
            resolve(
              ack && typeof ack === "object"
                ? (ack as { ok: boolean; error?: string })
                : { ok: false, error: "host unreachable" },
            );
          });
        } catch (e) {
          resolve({
            ok: false,
            error: e instanceof Error ? e.message : "send failed",
          });
        }
      }),
    onWorkerResult: (handler) =>
      chrome.runtime.onMessage.addListener(
        (message: unknown, sender: { id?: string; tab?: unknown }) => {
          // Only extension-context senders (no tab) carrying our result type.
          if (sender?.id !== chrome.runtime.id || sender?.tab) return false;
          if (
            message &&
            typeof message === "object" &&
            (message as { type?: string }).type === APP_RESULT_TYPE
          )
            handler(message);
          return false;
        },
      ),
  });
  w.addEventListener("message", (event: MessageEvent) =>
    relay.handlePageMessage({ source: event.source === w ? "window" : event.source, data: event.data }),
  );
}
