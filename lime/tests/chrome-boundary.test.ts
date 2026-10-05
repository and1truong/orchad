import test from "node:test";
import assert from "node:assert/strict";
import {
  ChromePageAdapter,
  dispatcher,
} from "../src/extension/page-adapter.js";
import { CounterFixture } from "../fixtures/counter.js";
import { HostPolicy } from "../src/host/policy.js";
// Chrome runtime double. These tests are NOT native/live browser verification.
async function runtime(
  run: (fixture: CounterFixture, requests: any[]) => Promise<void>,
) {
  const fixture = new CounterFixture(),
    requests: any[] = [];
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome"),
    oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const page = { agentBridgeV1: fixture, top: null as unknown };
  page.top = page;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: page,
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      tabs: {
        get: async () => ({
          url: "http://127.0.0.1:4313/",
          title: "Runtime fixture",
          status: "complete",
        }),
      },
      scripting: {
        executeScript: async (options: any) => {
          requests.push(options);
          if (
            options.target.documentIds &&
            !options.target.documentIds.includes("runtime-document")
          )
            throw new Error("Document unavailable");
          return [
            {
              frameId: 0,
              documentId: "runtime-document",
              result: await options.func(...options.args),
            },
          ];
        },
      },
    },
  });
  try {
    await run(fixture, requests);
  } finally {
    for (const [name, old] of [
      ["chrome", oldChrome],
      ["window", oldWindow],
    ] as const) {
      if (old) Object.defineProperty(globalThis, name, old);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}
test("Chrome adapter double: fixed MAIN dispatcher, top frame, runtime document and policy", () =>
  runtime(async (fixture, requests) => {
    const adapter = await ChromePageAdapter.discover(7);
    assert.equal(requests[0].world, "MAIN");
    assert.deepEqual(requests[0].target.frameIds, [0]);
    assert.equal(requests[0].func, dispatcher);
    assert.deepEqual(requests[1].target.documentIds, ["runtime-document"]);
    const p = new HostPolicy(
      adapter,
      {
        clientId: "sidebar",
        sessionId: "s",
        target: adapter.target,
        sessionEpoch: null,
        reads: new Set(),
      },
      async () => true,
      new AbortController().signal,
    );
    assert.equal(
      (
        await p.call({
          requestId: "r",
          documentId: "demo-document",
          toolName: "demo_increment",
          arguments: { amount: 1 },
          expectedRevision: 0,
          idempotencyKey: "key-1",
        })
      ).ok,
      true,
    );
    assert.equal(fixture.value, 1);
    adapter.invalidate();
    assert.equal((await p.context()).error?.code, "STALE_CONTEXT");
  }));
test("MAIN validation denies arbitrary methods and malformed invoke", () =>
  runtime(async () => {
    await assert.rejects(() => dispatcher("eval" as never));
    await assert.rejects(() => dispatcher("invoke", { approved: true }));
  }));
test("MAIN output shape and payload limits validated before returning", () =>
  runtime(async (fixture) => {
    fixture.getContext = async () => ({
      appId: "demo-counter",
      documentId: "demo-document",
      sessionEpoch: null,
      revision: -1,
      selectionIds: [],
      summary: "",
    });
    await assert.rejects(() => dispatcher("getContext"));
    fixture.getContext = async () => ({
      appId: "demo-counter",
      documentId: "demo-document",
      sessionEpoch: null,
      revision: 0,
      selectionIds: [],
      summary: "x".repeat(70000),
    });
    await assert.rejects(() => dispatcher("getContext"));
  }));
test("adapter dispatch classifies closed target, stale document and page faults", () =>
  runtime(async (fixture) => {
    const adapter = await ChromePageAdapter.discover(7);
    const consent = {
      clientId: "sidebar",
      sessionId: "s",
      target: adapter.target,
      sessionEpoch: null,
      reads: new Set<string>(),
    };
    const policy = new HostPolicy(
      adapter,
      consent,
      async () => true,
      new AbortController().signal,
    );
    const chromeObj = (globalThis as unknown as { chrome: any }).chrome;
    // Chrome reports a tab that closed between current() and the injection.
    chromeObj.scripting.executeScript = async () => {
      throw new Error("No tab with id: 7");
    };
    assert.equal((await policy.context()).error?.code, "TARGET_CLOSED");
    // A document binding that vanished is STALE_CONTEXT, not a page bug.
    chromeObj.scripting.executeScript = async () => {
      throw new Error("No document with id runtime-document");
    };
    assert.equal((await policy.context()).error?.code, "STALE_CONTEXT");
    // An honest page fault (e.g. oversized output) is INTERNAL with its
    // real message — not STALE_CONTEXT, never INVALID_ARGUMENT.
    chromeObj.scripting.executeScript = async () => {
      throw new Error("Oversized or non-JSON page output");
    };
    const fault = await policy.context();
    assert.equal(fault.error?.code, "INTERNAL");
    assert.match(fault.error!.message, /Oversized or non-JSON page output/);
  }));
test("Chrome adapter double: unsupported page explicit, no fallback", () =>
  runtime(async () => {
    Reflect.deleteProperty(
      (globalThis as unknown as { window: object }).window,
      "agentBridgeV1",
    );
    await assert.rejects(
      () => ChromePageAdapter.discover(7),
      (e) =>
        !!e &&
        typeof e === "object" &&
        "error" in e &&
        (e as { error: { code: string } }).error.code === "UNSUPPORTED",
    );
  }));
