import {
  bounded,
  DescriptionSchema,
  ContextSchema,
  ResultSchema,
  CallSchema,
  failure,
  type Call,
  type Target,
} from "../shared/contract.js";
import type { PageAdapter } from "../host/policy.js";
// Fixed MAIN-world dispatcher. Chrome serializes this function; no closures, eval, arbitrary JS or command endpoints.
export async function dispatcher(
  method: "describe" | "getContext" | "invoke",
  payload: unknown = null,
): Promise<unknown> {
  if (window !== window.top) throw new Error("Only top frame supported");
  if (!["describe", "getContext", "invoke"].includes(method))
    throw new Error("Invalid method");
  const bridge = (
    window as unknown as {
      agentBridgeV1?: {
        describe: () => Promise<unknown>;
        getContext: () => Promise<unknown>;
        invoke: (v: unknown) => Promise<unknown>;
      };
    }
  ).agentBridgeV1;
  if (
    !bridge ||
    !["describe", "getContext", "invoke"].every(
      (k) =>
        typeof (bridge as unknown as Record<string, unknown>)[k] === "function",
    )
  )
    return { unsupported: true };
  if (method === "invoke") {
    // Chrome API argument conversion may strip null object properties.
    // Encode the complete validated envelope as data, then parse it here;
    // never evaluate strings or relax the six-field Bridge call shape.
    if (typeof payload === "string") {
      if(new TextEncoder().encode(payload).length>65536)throw new Error("Oversized request");
      payload=JSON.parse(payload);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Invalid invoke");
    const p = payload as Record<string, unknown>,
      keys = [
        "requestId",
        "documentId",
        "toolName",
        "arguments",
        "expectedRevision",
        "idempotencyKey",
      ];
    if (
      Object.keys(p).length !== keys.length ||
      !keys.every((k) => Object.hasOwn(p, k)) ||
      typeof p.requestId !== "string" ||
      typeof p.documentId !== "string" ||
      typeof p.toolName !== "string" ||
      !p.arguments ||
      typeof p.arguments !== "object" ||
      Array.isArray(p.arguments) ||
      !(
        p.expectedRevision === null ||
        (Number.isInteger(p.expectedRevision) &&
          (p.expectedRevision as number) >= 0)
      ) ||
      !(p.idempotencyKey === null || typeof p.idempotencyKey === "string")
    )
      throw new Error("Invalid invoke shape");
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 65536)
    throw new Error("Oversized request");
  const result =
    method === "describe"
      ? await bridge.describe()
      : method === "getContext"
        ? await bridge.getContext()
        : await bridge.invoke(payload);
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const nonnegative = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
  if (!object(result)) throw new Error("Invalid response object");
  if (method === "describe") {
    if (
      result.protocolVersion !== "0.1" ||
      typeof result.appId !== "string" ||
      !Array.isArray(result.tools) ||
      result.tools.length > 64
    )
      throw new Error("Invalid description");
    for (const t of result.tools)
      if (
        !object(t) ||
        typeof t.name !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(t.name) ||
        typeof t.description !== "string" ||
        !object(t.inputSchema) ||
        t.inputSchema.type !== "object" ||
        !["read", "write", "destructive"].includes(t.effect as string)
      )
        throw new Error("Invalid descriptor");
  }
  if (
    method === "getContext" &&
    (typeof result.appId !== "string" ||
      typeof result.documentId !== "string" ||
      !nonnegative(result.revision) ||
      !Array.isArray(result.selectionIds) ||
      !result.selectionIds.every((v) => typeof v === "string") ||
      typeof result.summary !== "string")
  )
    throw new Error("Invalid context");
  if (
    method === "invoke" &&
    (typeof result.ok !== "boolean" ||
      !(result.revision === null || nonnegative(result.revision)) ||
      !Object.hasOwn(result, "data") ||
      !Object.hasOwn(result, "error") ||
      (result.ok ? result.error !== null : !object(result.error)))
  )
    throw new Error("Invalid result");
  const serialized = JSON.stringify(result);
  if (!serialized || new TextEncoder().encode(serialized).length > 65536)
    throw new Error("Oversized or non-JSON page output");
  return JSON.parse(serialized);
}
// Fixed MAIN-world installer for the opt-in app-initiated prompt channel
// (issue #50). Chrome serializes this function; like the dispatcher it takes
// no closures. It adds `requestAgentTurn` to the app's own agentBridgeV1
// surface — an explicitly host-injected API, not part of the Bridge 0.1
// contract surface the app registers — only while the target is pinned and
// consented. The page promise resolves with the final agent-turn result or
// failure only; tool results never cross to the page.
export function installAgentRequest(): { installed: boolean } {
  const TIMEOUT_MS = 120_000,
    MAX_PROMPT_BYTES = 4096;
  const bridge = (
    window as unknown as {
      agentBridgeV1?: Record<string, unknown> & {
        requestAgentTurn?: (
          prompt: string,
        ) => Promise<{ ok: boolean; text?: string; error?: string }>;
      };
    }
  ).agentBridgeV1;
  if (!bridge || typeof bridge !== "object") return { installed: false };
  if (typeof bridge.requestAgentTurn === "function")
    return { installed: false };
  const pending = new Map<
    string,
    {
      resolve: (r: { ok: boolean; text?: string; error?: string }) => void;
      timer: ReturnType<typeof setTimeout>;
      listener: (e: MessageEvent) => void;
    }
  >();
  const finish = (
    requestId: string,
    result: { ok: boolean; text?: string; error?: string },
  ) => {
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);
    clearTimeout(entry.timer);
    window.removeEventListener("message", entry.listener);
    entry.resolve(result);
  };
  const requestAgentTurn = (prompt: unknown) => {
    if (typeof prompt !== "string" || prompt.length === 0)
      return Promise.resolve({ ok: false, error: "prompt must be a string" });
    if (new TextEncoder().encode(prompt).length > MAX_PROMPT_BYTES)
      return Promise.resolve({
        ok: false,
        error: "prompt exceeds 4 KiB",
      });
    if (pending.size >= 1)
      return Promise.resolve({
        ok: false,
        error: "an agent request is already pending",
      });
    const requestId = "appreq-" + crypto.randomUUID();
    return new Promise<{ ok: boolean; text?: string; error?: string }>((resolve) => {
      const listener = (event: MessageEvent) => {
        if (event.source !== window) return;
        const d = event.data;
        if (
          !d ||
          typeof d !== "object" ||
          d.type !== "lime:agentResult" ||
          d.requestId !== requestId
        )
          return;
        const result: { ok: boolean; text?: string; error?: string } = {
          ok: d.ok === true,
        };
        if (typeof d.text === "string") result.text = d.text;
        if (typeof d.error === "string") result.error = d.error;
        finish(requestId, result);
      };
      const timer = setTimeout(
        () => finish(requestId, { ok: false, error: "agent request timed out" }),
        TIMEOUT_MS,
      );
      pending.set(requestId, { resolve, timer, listener });
      window.addEventListener("message", listener);
      window.postMessage(
        { type: "lime:agentRequest", requestId, prompt },
        window.location.origin,
      );
    });
  };
  if (Object.isExtensible(bridge)) bridge.requestAgentTurn = requestAgentTurn;
  else {
    // Apps such as Pear freeze their contract object. Delegate the original
    // methods with their original receiver; never thaw or mutate that object.
    const wrapper: Record<string, unknown> = {...bridge, requestAgentTurn};
    for (const key of ["describe", "getContext", "invoke"]) {
      const method = bridge[key];
      if (typeof method === "function") wrapper[key] = (...args: unknown[]) => method.apply(bridge, args);
    }
    (window as unknown as {agentBridgeV1: unknown}).agentBridgeV1 = Object.freeze(wrapper);
  }
  return { installed: true };
}
export class ChromePageAdapter implements PageAdapter {
  private invalid = false;
  private constructor(
    readonly target: Target,
    readonly tabId: number,
    readonly documentId: string,
  ) {}
  static async discover(tabId: number) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) throw failure("FORBIDDEN", "No user-granted tab access");
    const origin = new URL(tab.url).origin;
    if (!/^https?:/.test(tab.url))
      throw failure("UNSUPPORTED", "Only HTTP(S) pages");
    const frames = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: "MAIN",
      func: dispatcher,
      args: ["describe"],
    });
    const f = frames[0];
    if (!f || f.frameId !== 0 || !f.documentId)
      throw failure("UNSUPPORTED", "No top-level document");
    if ((f.result as { unsupported?: boolean })?.unsupported)
      throw failure(
        "UNSUPPORTED",
        "This app has no Agent App Bridge; DOM automation is unavailable",
      );
    const d = bounded(DescriptionSchema, f.result);
    const contexts = await chrome.scripting.executeScript({
      target: { tabId, documentIds: [f.documentId] },
      world: "MAIN",
      func: dispatcher,
      args: ["getContext"],
    });
    const c = bounded(ContextSchema, contexts[0]?.result);
    if (c.appId !== d.appId)
      throw failure("STALE_CONTEXT", "App changed during discovery");
    return new ChromePageAdapter(
      {
        targetId: crypto.randomUUID(),
        pageInstanceId: crypto.randomUUID(),
        origin,
        appId: d.appId,
        documentId: c.documentId,
        title: tab.title || "Untitled",
      },
      tabId,
      f.documentId,
    );
  }
  invalidate() {
    this.invalid = true;
  }
  async current() {
    if (this.invalid)
      throw failure("STALE_CONTEXT", "Page navigation invalidated target");
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(this.tabId);
    } catch {
      throw failure("TARGET_CLOSED", "Target tab closed");
    }
    if (
      !tab.url ||
      new URL(tab.url).origin !== this.target.origin ||
      tab.status === "loading"
    )
      throw failure("STALE_CONTEXT", "Target origin/navigation changed");
    return { ...this.target };
  }
  private async dispatch(
    method: "describe" | "getContext" | "invoke",
    call: Call | null = null,
  ) {
    await this.current();
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.tabId, documentIds: [this.documentId] },
        world: "MAIN",
        func: dispatcher,
        args: [method, call===null?null:JSON.stringify(call)],
      });
      const r = results[0];
      if (!r || r.frameId !== 0 || r.documentId !== this.documentId)
        throw failure("STALE_CONTEXT", "Runtime document binding changed");
      if ((r.result as { unsupported?: boolean })?.unsupported)
        throw failure("UNSUPPORTED", "Bridge removed");
      return r.result;
    } catch (e) {
      if (e && typeof e === "object" && "ok" in e) throw e;
      // Classify truthfully: a closed target is TARGET_CLOSED, a gone
      // document binding is STALE_CONTEXT, and page-side faults (malformed
      // or oversized output, dispatcher rejection) are INTERNAL — never
      // silently one code for all three.
      const message = e instanceof Error ? e.message : "document unavailable";
      if (/no tab with id|tab was closed|target closed|browser is closed/i.test(message))
        throw failure("TARGET_CLOSED", "Target tab closed or navigated");
      if (
        /no document|document unavailable|frame was removed|cannot access|inspected target navigated/i.test(
          message,
        )
      )
        throw failure("STALE_CONTEXT", "Document unavailable: " + message);
      throw failure("INTERNAL", "Page output invalid: " + message);
    }
  }
  async describe() {
    return bounded(DescriptionSchema, await this.dispatch("describe"));
  }
  async getContext() {
    return bounded(ContextSchema, await this.dispatch("getContext"));
  }
  async invoke(c: Call) {
    return bounded(
      ResultSchema,
      await this.dispatch("invoke", bounded(CallSchema, c)),
    );
  }
}
