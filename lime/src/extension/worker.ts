import {
  APP_REQUEST_FORWARD,
  APP_REQUEST_WIRE,
  MAX_PROMPT_BYTES,
  REQUEST_ID_PATTERN,
  promptBytes,
  type ForwardedAppRequest,
} from "./app-request.js";

if (typeof chrome !== "undefined" && chrome?.sidePanel)
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});

// Ingress gate for the app-initiated prompt channel (issue #50). Accepts a
// lime:appRequest message ONLY from our own registered content script in a
// real tab, stamps the sender facts Chrome verified, and forwards it to the
// sidepanel — which alone decides whether a live consent covers the page.
// Everything else from a tab sender is still rejected, so the page surface
// stays exactly one message type wide.
export function appRequestIngress(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): ForwardedAppRequest | { ok: false; error: string } {
  const m = message as Record<string, unknown> | null;
  const keys = m && typeof m === "object" ? Object.keys(m) : [];
  if (
    !m ||
    keys.length !== 3 ||
    m.type !== APP_REQUEST_WIRE ||
    typeof m.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(m.requestId) ||
    typeof m.prompt !== "string" ||
    m.prompt.length === 0 ||
    promptBytes(m.prompt) > MAX_PROMPT_BYTES
  )
    return { ok: false, error: "malformed request" };
  const tabId = sender.tab?.id;
  const documentId = sender.documentId;
  if (typeof tabId !== "number" || typeof documentId !== "string" || !documentId)
    return { ok: false, error: "unverifiable sender" };
  if (sender.frameId !== undefined && sender.frameId !== 0)
    return { ok: false, error: "subframe senders rejected" };
  let origin: string;
  try {
    origin = sender.origin ?? new URL(sender.url ?? "").origin;
    if (!/^https?:/.test(origin)) throw new Error("bad origin");
  } catch {
    return { ok: false, error: "unverifiable origin" };
  }
  return {
    type: APP_REQUEST_FORWARD,
    requestId: m.requestId,
    prompt: m.prompt,
    page: { tabId, documentId, origin },
  };
}

// Worker owns no run, secret or queued write. Suspension cannot replay anything.
export function workerMessageListener(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (v: unknown) => void,
): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (
    message &&
    typeof message === "object" &&
    (message as { type?: string }).type === APP_REQUEST_WIRE
  ) {
    if (!sender.tab) return false;
    const ingress = appRequestIngress(message, sender);
    if ("ok" in ingress && ingress.ok === false) {
      respond(ingress);
      return false;
    }
    // Hand the stamped request to the sidepanel; its immediate verdict is
    // what the relay hears (queued vs rejected). The agent result itself
    // returns later through chrome.tabs.sendMessage to the relay document.
    chrome.runtime
      .sendMessage(ingress)
      .then((answer) =>
        respond(
          answer && typeof answer === "object" && "ok" in answer
            ? answer
            : { ok: false, error: "host did not answer" },
        ),
      )
      .catch(() => respond({ ok: false, error: "host unavailable" }));
    return true;
  }
  if (
    sender.tab ||
    sender.url !== chrome.runtime.getURL("sidepanel.html") ||
    (sender.frameId && sender.frameId !== 0)
  )
    return false;
  if (
    (message as { type?: string } | null)?.type === "health" &&
    Object.keys(message as object).length === 1
  )
    respond({ ok: true });
  return false;
}

if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage)
  chrome.runtime.onMessage.addListener(workerMessageListener);
