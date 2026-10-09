import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_PROVENANCE,
  APP_REQUEST_FORWARD,
  APP_REQUEST_TYPE,
  APP_RESULT_TYPE,
  MAX_PROMPT_BYTES,
  RATE_LIMIT,
  PAGE_TIMEOUT_MS,
  makeAppResult,
  parseAppRequestMessage,
  parseForwardedRequest,
  finalAssistantText,
  type AppResultMessage,
  type ForwardedAppRequest,
} from "../src/extension/app-request.js";
import { createRelay } from "../src/extension/app-request-relay.js";
import {
  appRequestIngress,
  workerMessageListener,
} from "../src/extension/worker.js";
import { AppRequestIngress } from "../src/extension/app-request-ingress.js";
import { installAgentRequest } from "../src/extension/page-adapter.js";
import type { Approval } from "../src/host/policy.js";
import type { Target } from "../src/shared/contract.js";

const rid = () => "appreq-" + crypto.randomUUID();
const VALID_PAGE = {
  tabId: 7,
  documentId: "chrome-doc-1",
  origin: "http://127.0.0.1:4313",
};
const target: Target = {
  targetId: "t",
  pageInstanceId: "p",
  origin: VALID_PAGE.origin,
  appId: "demo-counter",
  documentId: "demo-document",
  title: "t",
};

// ---------- Relay ----------

function relayHarness() {
  const posted: AppResultMessage[] = [];
  const sent: { type: string; requestId: string; prompt: string }[] = [];
  let top = true;
  let workerResult: ((m: unknown) => void) | null = null;
  let ack: { ok: boolean; error?: string } = { ok: true };
  const relay = createRelay({
    isTopFrame: () => top,
    postToPage: (r) => posted.push(r),
    sendToWorker: async (m) => {
      sent.push(m);
      return ack;
    },
    onWorkerResult: (h) => {
      workerResult = h;
    },
  });
  const pageMsg = (data: unknown, source: unknown = "window") =>
    relay.handlePageMessage({ source, data });
  const complete = (requestId: string, ok = true) =>
    workerResult?.(
      ok
        ? {
            type: APP_RESULT_TYPE,
            requestId,
            ok: true,
            text: "final turn text",
          }
        : { type: APP_RESULT_TYPE, requestId, ok: false, error: "denied" },
    );
  return {
    posted,
    sent,
    pageMsg,
    complete,
    setTop: (v: boolean) => (top = v),
    setAck: (v: { ok: boolean; error?: string }) => (ack = v),
  };
}

test("relay: accepts a valid top-frame lime:agentRequest and forwards to worker", async () => {
  const h = relayHarness();
  const requestId = rid();
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId, prompt: "do a thing" });
  await Promise.resolve();
  assert.deepEqual(h.sent, [
    { type: "lime:appRequest", requestId, prompt: "do a thing" },
  ]);
  assert.equal(h.posted.length, 0); // still pending — no early result
  h.complete(requestId);
  assert.equal(h.posted.length, 1);
  assert.deepEqual(h.posted[0], {
    type: APP_RESULT_TYPE,
    requestId,
    ok: true,
    text: "final turn text",
  });
});

test("relay: rejects wrong message shape and resolves page failure when id survives", async () => {
  const h = relayHarness();
  const requestId = rid();
  for (const bad of [
    { type: APP_REQUEST_TYPE, requestId, prompt: "x", extra: 1 },
    { type: APP_REQUEST_TYPE, requestId, prompt: 5 },
    { type: APP_REQUEST_TYPE, requestId: "wrong-format", prompt: "x" },
    { type: "lime:somethingElse", requestId, prompt: "x" },
    "string",
    null,
  ])
    h.pageMsg(bad);
  await Promise.resolve();
  assert.equal(h.sent.length, 0);
  // The two messages with a readable requestId get a failure resolution;
  // the rest are dropped silently.
  assert.equal(h.posted.length, 2);
  assert.equal(h.posted[0].ok, false);
});

test("relay: rejects oversized prompt", async () => {
  const h = relayHarness();
  const requestId = rid();
  h.pageMsg({
    type: APP_REQUEST_TYPE,
    requestId,
    prompt: "x".repeat(MAX_PROMPT_BYTES + 1),
  });
  await Promise.resolve();
  assert.equal(h.sent.length, 0);
  assert.equal(h.posted.at(-1)?.ok, false);
});

test("relay: rejects non-window source and nested frame", async () => {
  const h = relayHarness();
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: rid(), prompt: "x" }, "other");
  h.setTop(false);
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: rid(), prompt: "x" });
  await Promise.resolve();
  assert.equal(h.sent.length, 0);
  assert.equal(h.posted.length, 0); // dropped, not even a failure reply
});

test("relay: at most one pending request; completes then accepts next", async () => {
  const h = relayHarness();
  const first = rid();
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: first, prompt: "a" });
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: rid(), prompt: "b" });
  await Promise.resolve();
  assert.equal(h.sent.length, 1);
  assert.equal(h.posted.at(-1)?.error, "request already pending");
  h.complete(first);
  const second = rid();
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: second, prompt: "b" });
  await Promise.resolve();
  assert.equal(h.sent.length, 2);
});

test("relay: replayed requestId and rate limit are refused", async () => {
  const h = relayHarness();
  const reuse = rid();
  for (let i = 0; i < RATE_LIMIT; i++) {
    const id = i === 0 ? reuse : rid();
    h.pageMsg({ type: APP_REQUEST_TYPE, requestId: id, prompt: "x" });
    await Promise.resolve();
    h.complete(id);
  }
  // Sixth message reuses an already-seen id: rejected even under the limit.
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: reuse, prompt: "x" });
  await Promise.resolve();
  assert.equal(h.posted.at(-1)?.error, "duplicate requestId");
  // And the sliding window is now full.
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId: rid(), prompt: "x" });
  await Promise.resolve();
  assert.equal(h.posted.at(-1)?.error, "rate limit exceeded");
  assert.equal(h.sent.length, RATE_LIMIT);
});

test("relay: worker rejection resolves page promise as failure", async () => {
  const h = relayHarness();
  h.setAck({ ok: false, error: "no active consent" });
  const requestId = rid();
  h.pageMsg({ type: APP_REQUEST_TYPE, requestId, prompt: "x" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(h.posted.at(-1), {
    type: APP_RESULT_TYPE,
    requestId,
    ok: false,
    error: "no active consent",
  });
});

// ---------- Worker ingress ----------

const wire = (overrides: Record<string, unknown> = {}) => ({
  type: "lime:appRequest",
  requestId: rid(),
  prompt: "hi",
  ...overrides,
});
const sender = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "lime-ext",
    tab: { id: VALID_PAGE.tabId },
    documentId: VALID_PAGE.documentId,
    origin: VALID_PAGE.origin,
    frameId: 0,
    url: VALID_PAGE.origin + "/page",
    ...overrides,
  }) as chrome.runtime.MessageSender;

test("worker: valid lime sender stamps verified page facts into the forward", () => {
  const out = appRequestIngress(wire(), sender()) as ForwardedAppRequest;
  assert.equal(out.type, APP_REQUEST_FORWARD);
  assert.deepEqual(out.page, VALID_PAGE);
  assert.ok(parseForwardedRequest(out));
});

test("worker: origin falls back to sender.url when sender.origin is absent", () => {
  const s = sender();
  delete (s as Record<string, unknown>).origin;
  const out = appRequestIngress(wire(), s);
  assert.ok(!("ok" in out) && out.page.origin === VALID_PAGE.origin);
});

test("worker: malformed page messages never reach the forward", () => {
  for (const bad of [
    wire({ prompt: "x".repeat(MAX_PROMPT_BYTES + 1) }),
    wire({ requestId: "not-an-id" }),
    wire({ prompt: "" }),
    { ...wire(), unknown: true },
    { requestId: rid(), prompt: "x" },
    null,
    "x",
  ]) {
    const out = appRequestIngress(bad, sender());
    assert.ok("ok" in out && out.ok === false, JSON.stringify(bad));
  }
});

test("worker: unverifiable senders are rejected", () => {
  for (const s of [
    sender({ tab: undefined }),
    sender({ documentId: undefined }),
    sender({ frameId: 2 }),
    sender({ origin: "chrome-extension://evil", url: undefined }),
  ]) {
    const out = appRequestIngress(wire(), s);
    assert.ok("ok" in out && out.ok === false, JSON.stringify(s));
  }
});

test("worker listener: forwards valid requests and answers with the sidepanel verdict", async () => {
  const forwarded: unknown[] = [];
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        id: "lime-ext",
        getURL: (p: string) => "chrome-extension://lime-ext/" + p,
        sendMessage: async (m: unknown) => {
          forwarded.push(m);
          return { ok: true };
        },
      },
    },
  });
  try {
    const answers: unknown[] = [];
    const held = workerMessageListener(wire(), sender(), (v) =>
      answers.push(v),
    );
    assert.equal(held, true); // async response channel held
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(answers, [{ ok: true }]);
    const f = forwarded[0] as ForwardedAppRequest;
    assert.equal(f.type, APP_REQUEST_FORWARD);
    assert.deepEqual(f.page, VALID_PAGE);
  } finally {
    if (oldChrome) Object.defineProperty(globalThis, "chrome", oldChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
});

test("worker listener: rejects wrong sender.id, tab-less app requests and arbitrary tab messages", async () => {
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        id: "lime-ext",
        getURL: (p: string) => "chrome-extension://lime-ext/" + p,
        sendMessage: async () => {
          throw new Error("must not forward");
        },
      },
    },
  });
  try {
    const answers: unknown[] = [];
    const respond = (v: unknown) => answers.push(v);
    // Another extension's id: not ours at all.
    assert.equal(
      workerMessageListener(wire(), sender({ id: "other-ext" }), respond),
      false,
    );
    // Our message type but no tab sender (e.g. the sidepanel's own context).
    assert.equal(
      workerMessageListener(wire(), sender({ tab: undefined }), respond),
      false,
    );
    // Malformed wire shape: immediate failure answer.
    assert.equal(
      workerMessageListener(wire({ prompt: 1 }), sender(), respond),
      false,
    );
    assert.deepEqual(answers.at(-1), { ok: false, error: "malformed request" });
    // Arbitrary tab-originated messages are still rejected entirely.
    assert.equal(
      workerMessageListener({ type: "health" }, sender(), respond),
      false,
    );
    // And the health check itself only accepts the real sidepanel URL.
    assert.equal(
      workerMessageListener(
        { type: "health" },
        {
          id: "lime-ext",
          url: "chrome-extension://lime-ext/sidepanel.html",
          frameId: 0,
        },
        respond,
      ),
      false,
    );
    assert.deepEqual(answers.at(-1), { ok: true });
  } finally {
    if (oldChrome) Object.defineProperty(globalThis, "chrome", oldChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
});

// ---------- Sidepanel ingress / approval ----------

function ingressHarness() {
  const asks: Approval[] = [];
  const finishes: {
    page: { tabId: number; documentId: string; origin: string };
    requestId: string;
    result: { ok: boolean; text?: string; error?: string };
  }[] = [];
  const runs: string[] = [];
  let consented = true;
  let busy = false;
  let verdict: Promise<boolean> | boolean = true;
  const ingress = new AppRequestIngress({
    consentTarget: () => (consented ? { ...target } : null),
    pinnedPage: () => ({
      tabId: VALID_PAGE.tabId,
      documentId: VALID_PAGE.documentId,
    }),
    busy: () => busy,
    ask: (a) => {
      asks.push(a);
      return Promise.resolve(verdict);
    },
    finish: (page, requestId, result) =>
      finishes.push({ page, requestId, result }),
    run: async (p) => {
      runs.push(p);
      return { ok: true, text: "done: " + p };
    },
  });
  const forward = (overrides: Record<string, unknown> = {}) => ({
    type: APP_REQUEST_FORWARD,
    requestId: rid(),
    prompt: "turn the counter",
    page: { ...VALID_PAGE },
    ...overrides,
  });
  const call = (msg: unknown) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) =>
      ingress.handle(msg, resolve),
    );
  return {
    asks,
    finishes,
    runs,
    call,
    forward,
    ingress,
    setConsented: (v: boolean) => (consented = v),
    setBusy: (v: boolean) => (busy = v),
    setVerdict: (v: Promise<boolean> | boolean) => (verdict = v),
  };
}

test("ingress: valid forward enters the approval queue with untrusted prompt", async () => {
  const h = ingressHarness();
  const msg = h.forward();
  assert.deepEqual(await h.call(msg), { ok: true });
  assert.equal(h.asks.length, 1);
  const a = h.asks[0];
  assert.equal(a.appPrompt?.prompt, "turn the counter");
  assert.equal(a.appPrompt?.requestId, msg.requestId);
  assert.ok(a.expiresAt > Date.now());
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(h.runs, ["turn the counter"]);
  // The page gets the final turn text and nothing else.
  assert.deepEqual(h.finishes.at(-1)?.result, {
    ok: true,
    text: "done: turn the counter",
  });
});

test("ingress: deny starts no agent turn and resolves failure", async () => {
  const h = ingressHarness();
  h.setVerdict(false);
  assert.equal((await h.call(h.forward())).ok, true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.runs.length, 0);
  assert.equal(h.finishes.at(-1)?.result.ok, false);
});

test("ingress: expiry is a denial — no turn, failure result", async () => {
  const h = ingressHarness();
  // ApprovalQueue itself resolves false on expiry; same code path as deny.
  h.setVerdict(new Promise((r) => setTimeout(() => r(false), 10)));
  await h.call(h.forward());
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.runs.length, 0);
  assert.equal(h.finishes.at(-1)?.result.ok, false);
});

test("ingress: rejects without consent, on wrong origin, tab or document", async () => {
  for (const mutate of [
    (h: ReturnType<typeof ingressHarness>) => h.setConsented(false),
    (h: ReturnType<typeof ingressHarness>) =>
      ({ page: { ...VALID_PAGE, origin: "http://evil.example" } }),
    (h: ReturnType<typeof ingressHarness>) =>
      ({ page: { ...VALID_PAGE, tabId: 99 } }),
    (h: ReturnType<typeof ingressHarness>) =>
      ({ page: { ...VALID_PAGE, documentId: "chrome-doc-OLD" } }),
  ] as const) {
    const h = ingressHarness();
    const extra = mutate(h);
    const res = await h.call(h.forward(extra as Record<string, unknown>));
    assert.equal(res.ok, false);
    assert.equal(h.asks.length, 0);
    assert.equal(h.runs.length, 0);
  }
});

test("ingress: duplicate requestId and concurrent request are refused", async () => {
  const h = ingressHarness();
  const msg = h.forward();
  assert.equal((await h.call(msg)).ok, true);
  // Same requestId replayed while the first is still pending.
  assert.equal((await h.call(msg)).ok, false);
  // A different requestId is also refused while one is pending.
  assert.equal((await h.call(h.forward())).ok, false);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.runs.length, 1);
  // After completion a replay of the first id is still refused.
  assert.equal((await h.call(msg)).ok, false);
  // A genuinely new request is accepted again.
  assert.equal((await h.call(h.forward())).ok, true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(h.runs.length, 2);
});

test("ingress: busy agent turns refuse new app requests", async () => {
  const h = ingressHarness();
  h.setBusy(true);
  assert.equal((await h.call(h.forward())).ok, false);
  assert.equal(h.asks.length, 0);
});

test("ingress: consent loss/navigation resolves a pending request as failure", async () => {
  const h = ingressHarness();
  // Approval card stays open until we invalidate.
  h.setVerdict(new Promise(() => {}));
  const msg = h.forward();
  await h.call(msg);
  h.ingress.invalidateAll();
  assert.equal(h.finishes.at(-1)?.requestId, msg.requestId);
  assert.equal(h.finishes.at(-1)?.result.ok, false);
  assert.equal(h.runs.length, 0);
});

test("ingress: malformed forwards and raw page messages are refused", async () => {
  const h = ingressHarness();
  for (const bad of [
    null,
    "x",
    { type: "lime:agentRequest", requestId: rid(), prompt: "x" }, // raw page type, not the forward
    h.forward({ requestId: "bad-id" }),
    h.forward({ extra: 1 }),
  ])
    assert.equal((await h.call(bad)).ok, false);
  assert.equal(h.asks.length, 0);
});

test("ingress: a synchronous ask/run fault still settles the pending request", async () => {
  const h = ingressHarness();
  h.setVerdict(true);
  const ingress = new AppRequestIngress({
    consentTarget: () => ({ ...target }),
    pinnedPage: () => ({
      tabId: VALID_PAGE.tabId,
      documentId: VALID_PAGE.documentId,
    }),
    busy: () => false,
    ask: () => {
      throw new Error("queue exploded");
    },
    finish: (page, requestId, result) =>
      h.finishes.push({ page, requestId, result }),
    run: async () => ({ ok: true }),
  });
  const res = await new Promise<{ ok: boolean }>((resolve) =>
    ingress.handle(h.forward(), resolve),
  );
  assert.equal(res.ok, true); // acknowledged into the flow
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.finishes.at(-1)?.result.ok, false);
  // The slot was released — a later request is not blocked by the corpse.
  assert.equal(
    (
      await new Promise<{ ok: boolean }>((resolve) =>
        ingress.handle(h.forward(), resolve),
      )
    ).ok,
    true,
  );
});

test("provenance: app prompt is marked and result envelope is bounded", () => {
  // The marker the model sees in history for app-authored instructions.
  assert.match(APP_PROVENANCE, /Untrusted app request/);
  const r = makeAppResult("appreq-00000000-0000-4000-8000-000000000000", {
    ok: true,
    text: "t".repeat(10_000),
  });
  assert.equal(r.text?.length, 8192);
  assert.deepEqual(Object.keys(r).sort(), [
    "ok",
    "requestId",
    "text",
    "type",
  ]);
  const fail = makeAppResult("appreq-00000000-0000-4000-8000-000000000000", {
    ok: false,
    error: "e".repeat(10_000),
  });
  assert.equal(fail.error?.length, 8192);
});

test("finalAssistantText returns only the last assistant string", () => {
  assert.equal(
    finalAssistantText([
      { role: "user", content: "hi" },
      { role: "assistant", content: "working" },
      { role: "assistant", content: "final answer" },
    ]),
    "final answer",
  );
  assert.equal(
    finalAssistantText([{ role: "assistant", content: null }]),
    null,
  );
  assert.equal(finalAssistantText([]), null);
});

// ---------- Page-side installAgentRequest ----------

function pageHarness() {
  const posted: unknown[] = [];
  const listeners: ((e: unknown) => void)[] = [];
  const timers: (() => void)[] = [];
  const realSetTimeout = globalThis.setTimeout;
  const page = {
    agentBridgeV1: {} as Record<string, unknown>,
    location: { origin: "http://127.0.0.1:4313" },
    postMessage: (m: unknown, o: string) => {
      void o;
      posted.push(m);
    },
    addEventListener: (_t: string, f: (e: unknown) => void) =>
      listeners.push(f),
    removeEventListener: () => {},
  } as Record<string, unknown>;
  page.top = page;
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: page,
  });
  // Capture the request timeout instead of waiting 120 s.
  globalThis.setTimeout = ((cb: () => void) => {
    timers.push(cb);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  const restore = () => {
    globalThis.setTimeout = realSetTimeout;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  };
  const resultEvent = (requestId: string, ok: boolean) =>
    listeners.forEach((f) =>
      f({
        source: page,
        data: ok
          ? { type: "lime:agentResult", requestId, ok: true, text: "done" }
          : { type: "lime:agentResult", requestId, ok: false, error: "no" },
      }),
    );
  return { page, posted, timers, resultEvent, restore };
}

test("page API: installs requestAgentTurn and posts a well-formed request", async () => {
  const h = pageHarness();
  try {
    assert.deepEqual(installAgentRequest(), { installed: true });
    const api = (
      h.page.agentBridgeV1 as Record<string, unknown>
    ).requestAgentTurn as (p: string) => Promise<{
      ok: boolean;
      text?: string;
      error?: string;
    }>;
    const pending = api("increment the counter");
    const msg = h.posted[0] as {
      type: string;
      requestId: string;
      prompt: string;
    };
    assert.equal(msg.type, "lime:agentRequest");
    assert.match(msg.requestId, /^appreq-[0-9a-f-]{36}$/);
    assert.equal(msg.prompt, "increment the counter");
    // Only the final turn text resolves the promise.
    h.resultEvent(msg.requestId, true);
    assert.deepEqual(await pending, { ok: true, text: "done" });
  } finally {
    h.restore();
  }
});

test("page API: denial and timeout resolve ok:false", async () => {
  const h = pageHarness();
  try {
    installAgentRequest();
    const api = (
      h.page.agentBridgeV1 as Record<string, unknown>
    ).requestAgentTurn as (p: string) => Promise<{
      ok: boolean;
      error?: string;
    }>;
    const denied = api("x");
    const id = (h.posted[0] as { requestId: string }).requestId;
    h.resultEvent(id, false);
    assert.deepEqual(await denied, { ok: false, error: "no" });
    // Second request is free; fire the captured timeout.
    const timed = api("y");
    h.timers.forEach((fire) => fire());
    assert.equal((await timed).ok, false);
  } finally {
    h.restore();
  }
});

test("page API: bounds and single-pending are enforced before posting", async () => {
  const h = pageHarness();
  try {
    installAgentRequest();
    const api = (
      h.page.agentBridgeV1 as Record<string, unknown>
    ).requestAgentTurn as (p: string) => Promise<{
      ok: boolean;
      error?: string;
    }>;
    assert.equal((await api(5 as never)).ok, false);
    assert.equal((await api("x".repeat(5000))).ok, false);
    const first = api("a");
    assert.equal((await api("b")).ok, false); // one pending at a time
    const id = (h.posted[0] as { requestId: string }).requestId;
    h.resultEvent(id, true);
    await first;
  } finally {
    h.restore();
  }
});

test("page API: no bridge or re-install leaves the surface untouched", () => {
  const h = pageHarness();
  try {
    h.page.agentBridgeV1 = undefined;
    assert.deepEqual(installAgentRequest(), { installed: false });
    h.page.agentBridgeV1 = { requestAgentTurn: () => Promise.resolve({ ok: true }) };
    assert.deepEqual(installAgentRequest(), { installed: false });
  } finally {
    h.restore();
  }
});

test("page API: frozen app bridge retains original receiver and methods while request channel installs", async () => {
  const h = pageHarness();
  try {
    const original = Object.freeze({
      describe() {assert.equal(this, original); return "description";},
      getContext() {assert.equal(this, original); return "context";},
      invoke(value: string) {assert.equal(this, original); return value;},
    });
    h.page.agentBridgeV1 = original;
    assert.deepEqual(installAgentRequest(), {installed: true});
    assert.equal(Object.hasOwn(original, "requestAgentTurn"), false);
    const wrapper = h.page.agentBridgeV1 as any;
    assert.equal(Object.isFrozen(wrapper), true);
    assert.equal(wrapper.describe(), "description");
    assert.equal(wrapper.getContext(), "context");
    assert.equal(wrapper.invoke("result"), "result");
    const pending = wrapper.requestAgentTurn("approved intent"), id = (h.posted[0] as any).requestId;
    h.resultEvent(id, true);
    assert.deepEqual(await pending, {ok: true, text: "done"});
    assert.deepEqual(installAgentRequest(), {installed: false});
  } finally {h.restore();}
});

test("relay: duplicate cannot free the original pending slot; host timeout frees an abandoned slot", async (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const h = relayHarness(), first = rid();
  h.pageMsg({type: APP_REQUEST_TYPE, requestId: first, prompt: "original"});
  await Promise.resolve();
  h.pageMsg({type: APP_REQUEST_TYPE, requestId: first, prompt: "replay"});
  h.pageMsg({type: APP_REQUEST_TYPE, requestId: rid(), prompt: "concurrent"});
  assert.equal(h.sent.length, 1);
  assert.equal(h.posted.at(-1)?.error, "request already pending");
  t.mock.timers.tick(120000);
  assert.equal(h.posted.at(-1)?.error, "agent request timed out");
  h.pageMsg({type: APP_REQUEST_TYPE, requestId: rid(), prompt: "after deadline"});
  await Promise.resolve();
  assert.equal(h.sent.length, 2);
});

test("ingress: a cancelled approval's late verdict cannot run or erase a newer request", async () => {
  const h = ingressHarness();
  let oldVerdict!: (v: boolean) => void, newVerdict!: (v: boolean) => void;
  h.setVerdict(new Promise<boolean>(r => {oldVerdict = r;}));
  const old = h.forward(); await h.call(old); h.ingress.invalidateAll();
  h.setVerdict(new Promise<boolean>(r => {newVerdict = r;}));
  const current = h.forward(); assert.equal((await h.call(current)).ok, true);
  oldVerdict(true); await new Promise(r => setTimeout(r, 0));
  assert.equal(h.runs.length, 0);
  assert.equal((await h.call(h.forward())).ok, false);
  newVerdict(true); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(h.runs, [current.prompt]);
  assert.equal(h.finishes.filter(r => r.requestId === current.requestId).length, 1);
  assert.equal(h.finishes.at(-1)?.result.ok, true);
});

test("relay: a late negative host acknowledgement cannot duplicate a timed-out result", async (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  let ack!: (value: {ok: boolean; error: string}) => void;
  const posted: AppResultMessage[] = [];
  const relay = createRelay({
    isTopFrame: () => true,
    postToPage: result => posted.push(result),
    sendToWorker: () => new Promise(resolve => {ack = resolve;}),
    onWorkerResult: () => {},
  });
  relay.handlePageMessage({source: "window", data: {type: APP_REQUEST_TYPE, requestId: rid(), prompt: "abandoned"}});
  t.mock.timers.tick(PAGE_TIMEOUT_MS);
  ack({ok: false, error: "late rejection"}); await Promise.resolve();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].error, "agent request timed out");
});

test("ingress: invalidation before deferred approval cannot reopen a stale card", async () => {
  const h = ingressHarness(), accepted = h.call(h.forward());
  h.ingress.invalidateAll(); await accepted;
  await new Promise(r => setTimeout(r, 0));
  assert.equal(h.asks.length, 0); assert.equal(h.runs.length, 0);
  assert.equal(h.finishes.length, 1); assert.equal(h.finishes[0].result.ok, false);
});
