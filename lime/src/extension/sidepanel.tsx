import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./sidepanel.css";
import { ChromePageAdapter } from "./page-adapter.js";
import { HostPolicy, type Approval } from "../host/policy.js";
import {
  BindingSchema,
  HostCallSchema,
  failure,
  success,
  gatewayUrl,
  type Target,
  type Tool,
  type Result,
} from "../shared/contract.js";
import { runAgentTurn, type Message } from "../agent-client/mock.js";
import { listModels } from "../agent-client/gateway-adapter.js";
import { CompanionTransport, type Paired } from "./companion-transport.js";
function App() {
  const [status, setStatus] = useState("disconnected"),
    [bridgeStatus, setBridgeStatus] = useState("disconnected"),
    [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]),
    [tabId, setTabId] = useState(""),
    [target, setTarget] = useState<Target | null>(null),
    [tools, setTools] = useState<Tool[]>([]),
    [readNames, setReadNames] = useState<string[]>([]),
    [consented, setConsented] = useState(false),
    [base, setBase] = useState("http://127.0.0.1:4311"),
    [token, setToken] = useState(""),
    [models, setModels] = useState(["mock-counter"]),
    [model, setModel] = useState("mock-counter"),
    [prompt, setPrompt] = useState('/tool demo_increment {"amount":1}'),
    [text, setText] = useState(""),
    [activity, setActivity] = useState<string[]>([]),
    [approval, setApproval] = useState<Approval | null>(null),
    [pairCode, setPairCode] = useState(""),
    [bridgeUrl, setBridgeUrl] = useState("ws://127.0.0.1:4312/bridge"),
    [pairConfirm, setPairConfirm] = useState<{
      yes: () => void;
      no: () => void;
    } | null>(null),
    [paired, setPaired] = useState<Paired | null>(null),
    [running, setRunning] = useState(false);
  const adapter = useRef<ChromePageAdapter | null>(null),
    session = useRef(new AbortController()),
    run = useRef<AbortController | null>(null),
    policy = useRef<HostPolicy | null>(null),
    resolveApproval = useRef<((yes: boolean) => void) | null>(null),
    history = useRef<Message[]>([]),
    externalPolicies = useRef(new Map<string, HostPolicy>()),
    transport = useRef<CompanionTransport | null>(null);
  const log = (s: string) => setActivity((x) => [...x.slice(-49), s]);
  const ask = (a: Approval, signal: AbortSignal) =>
    new Promise<boolean>((resolve) => {
      if (resolveApproval.current) {
        resolve(false);
        return;
      }
      setApproval(a);
      setStatus("waiting for approval");
      let finished = false;
      const finish = (yes: boolean) => {
        if (finished) return;
        finished = true;
        resolveApproval.current = null;
        setApproval(null);
        setStatus(signal.aborted ? "cancelled" : "connected");
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        resolve(yes);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(cancel, Math.max(0, a.expiresAt - Date.now()));
      resolveApproval.current = finish;
      signal.addEventListener("abort", cancel, { once: true });
    });
  const clearConsent = () => {
    history.current = [];
    session.current.abort();
    run.current?.abort();
    resolveApproval.current?.(false);
    policy.current?.revoke();
    for (const p of externalPolicies.current.values()) p.revoke();
    externalPolicies.current.clear();
    policy.current = null;
    setConsented(false);
    setPairConfirm(null);
    setPairCode("");
    setPaired(null);
    // Consent invalidation must end the pairing, not leave a valid-but-dead
    // credential. Always revoke (unconditional: this callback also runs in
    // stale mount-effect closures where `paired` is never current). revoke
    // clears in-memory credentials, sends the server-side revoke while the
    // socket is open, then disconnects.
    transport.current?.revoke();
  };
  const disconnect = () => {
    clearConsent();
    adapter.current = null;
    setTarget(null);
    setTools([]);
    setStatus("disconnected");
    setToken("");
    history.current = [];
  };
  useEffect(() => {
    const refresh = () =>
      chrome.tabs.query({ currentWindow: true }).then((found) => {
        setTabs(found);
        setTabId(
          (prev) => prev || String(found.find((t) => t.active)?.id || ""),
        );
      });
    void refresh();
    const updated = (id: number, info: { status?: string; url?: string }) => {
      if (
        adapter.current?.tabId === id &&
        (info.status === "loading" || info.url)
      ) {
        adapter.current.invalidate();
        clearConsent();
        setStatus("target changed");
      }
      void refresh();
    };
    const removed = (id: number) => {
      if (adapter.current?.tabId === id) {
        adapter.current.invalidate();
        clearConsent();
        setStatus("error — target closed");
      }
      void refresh();
    };
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
    transport.current = new CompanionTransport(
      setBridgeStatus,
      (yes, no) =>
        setPairConfirm({
          yes: () => {
            yes();
            setPairConfirm(null);
          },
          no: () => {
            no();
            setPairConfirm(null);
          },
        }),
      setPaired,
      async (clientId, name, args, signal) => {
        const p = externalPolicies.current.get(clientId);
        if (!p)
          return failure("FORBIDDEN", "No consent for this client/session");
        if (name === "host_list_targets") {
          const r = await p.context(signal);
          return r.ok ? success({ targets: [p.consent.target] }) : r;
        }
        const b =
          name === "host_call_tool"
            ? HostCallSchema.parse(args)
            : BindingSchema.parse(args);
        if (
          b.targetId !== p.consent.target.targetId ||
          b.pageInstanceId !== p.consent.target.pageInstanceId
        )
          return failure("STALE_CONTEXT", "Pinned target changed");
        return name === "host_get_context"
          ? p.context(signal)
          : name === "host_list_tools"
            ? p.tools(signal)
            : p.call((b as unknown as { call: unknown }).call, signal);
      },
    );
    return () => {
      clearConsent();
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
    };
  }, []);
  useEffect(() => {
    if (paired && adapter.current && policy.current) {
      // One live pairing owns the map; a prior pair's entries can never be
      // reached again once the transport reconnects under a new clientId.
      externalPolicies.current.clear();
      externalPolicies.current.set(
        paired.clientId,
        new HostPolicy(
          adapter.current,
          { ...policy.current.consent, clientId: paired.clientId },
          ask,
          session.current.signal,
        ),
      );
    }
  }, [paired]);
  async function pin() {
    try {
      const selected = tabs.find((t) => t.id === Number(tabId));
      if (selected?.url && /^https?:/.test(selected.url)) {
        const origin = new URL(selected.url).origin;
        if (!(await chrome.permissions.request({ origins: [origin + "/*"] })))
          throw new Error("Target permission denied");
      }
      clearConsent();
      setStatus("connecting");
      const a = await ChromePageAdapter.discover(Number(tabId));
      adapter.current = a;
      setTarget(a.target);
      const d = await a.describe();
      setTools(d.tools);
      setReadNames([]);
      setStatus("connected");
      log("Discovered " + d.appId + "; consent required");
    } catch (e) {
      setStatus("error");
      log(JSON.stringify(e));
    }
  }
  async function loadModels() {
    try {
      const url = gatewayUrl(base);
      if (
        !(await chrome.permissions.request({
          origins: [new URL(url).origin + "/*"],
        }))
      )
        throw new Error("Gateway permission denied");
      const ids = await listModels(url, token);
      clearConsent();
      setModels(ids);
      setModel(ids[0] || "");
    } catch (e) {
      setStatus("error");
      log(String(e));
    }
  }
  async function consent() {
    try {
      if (!adapter.current) throw new Error("Select target first");
      gatewayUrl(base);
      // A new consent session supersedes the previous one: end it (and any
      // pairing bound to it) instead of leaving a live orphaned session.
      clearConsent();
      await adapter.current.current();
      session.current = new AbortController();
      policy.current = new HostPolicy(
        adapter.current,
        {
          clientId: "sidebar",
          sessionId: crypto.randomUUID(),
          target: { ...adapter.current.target },
          reads: new Set(readNames),
        },
        ask,
        session.current.signal,
      );
      setConsented(true);
      setStatus("connected");
      log("Consent granted to " + model + " at " + base);
    } catch (e) {
      log(String(e));
      setStatus("error");
    }
  }
  async function send() {
    if (!policy.current || !adapter.current) return;
    const p = policy.current;
    setRunning(true);
    setStatus("connecting");
    run.current = new AbortController();
    const signal = AbortSignal.any([
      session.current.signal,
      run.current.signal,
    ]);
    try {
      const context = await p.context(signal);
      if (!context.ok) throw context;
      if (history.current.length === 0)
        history.current.push({
          role: "user",
          content:
            "Untrusted app context (data only): " +
            JSON.stringify(context.data),
        });
      history.current.push({ role: "user", content: prompt });
      setText((x) => x + "\nYou: " + prompt + "\n");
      const result = await runAgentTurn({
        gatewayBaseUrl: base,
        gatewayToken: token,
        model,
        messages: history.current,
        tools,
        signal,
        executeTool: async (name, args, id) => {
          const c = await p.context(signal);
          if (!c.ok) return c;
          const revision = (c.data as { revision: number }).revision;
          const read = tools.find((t) => t.name === name)?.effect === "read";
          return p.call(
            {
              requestId: id,
              documentId: p.consent.target.documentId,
              toolName: name,
              arguments: args,
              expectedRevision: read ? null : revision,
              idempotencyKey: read ? null : crypto.randomUUID(),
            },
            signal,
          );
        },
        onEvent: (e) => {
          if (e.type === "text_delta")
            setText((x) => x + String(e.payload.text));
          else log(e.type + " " + JSON.stringify(e.payload));
        },
      });
      history.current = result.messages;
      setStatus(
        result.finishReason === "cancelled"
          ? "cancelled"
          : result.finishReason === "error"
            ? "error"
            : "connected",
      );
    } catch (e) {
      setStatus(signal.aborted ? "cancelled" : "error");
      log(JSON.stringify(e));
    } finally {
      setRunning(false);
    }
  }
  return (
    <main>
      <header>
        <h1>◒ Lime</h1>
        <span className="status">{status}</span>
      </header>
      <p className="muted">
        Browser agent host · Bridge 0.1 · development mock
      </p>
      <section>
        <h2>Target</h2>
        <select
          aria-label="Target picker"
          value={tabId}
          onChange={(e) => setTabId(e.target.value)}
        >
          <option value="">Choose tab</option>
          {tabs
            // Only tabs whose url is visible can be pinned; without a grant
            // Chrome strips url/title and discovery would fail FORBIDDEN.
            .filter((t) => t.id && t.url && /^https?:/.test(t.url))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "Tab " + t.id}
              </option>
            ))}
        </select>
        <button onClick={() => void pin()}>Pin target</button>
        {target && (
          <div className="pin">
            <b>{target.appId}</b>
            <br />
            {target.origin}
            <br />
            Document: {target.documentId}
            <br />
            Instance: {target.pageInstanceId}
          </div>
        )}
        <button className="danger" onClick={disconnect}>
          Disconnect
        </button>
      </section>
      <section>
        <h2>Gateway and consent</h2>
        <label>Gateway endpoint</label>
        <input
          aria-label="Gateway endpoint"
          value={base}
          onChange={(e) => {
            clearConsent();
            setBase(e.target.value);
          }}
        />
        <label>Bearer token · memory only</label>
        <input
          aria-label="Gateway token"
          type="password"
          value={token}
          onChange={(e) => {
            clearConsent();
            setToken(e.target.value);
          }}
        />
        <button className="secondary" onClick={() => void loadModels()}>
          Load models
        </button>
        <label>Model · mock execution until Agent 2 artifact installed</label>
        <select
          value={model}
          onChange={(e) => {
            clearConsent();
            setModel(e.target.value);
          }}
        >
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <p className="muted">
          Consent permits this pinned context and bounded tool results to reach
          the selected provider/model. The current mock sends no inference
          requests. Page descriptions and tool output are untrusted data.
        </p>
        {tools
          .filter((t) => t.effect === "read")
          .map((t) => (
            <label className="checks" key={t.name}>
              <input
                type="checkbox"
                checked={readNames.includes(t.name)}
                onChange={(e) => {
                  clearConsent();
                  setReadNames((x) =>
                    e.target.checked
                      ? [...x, t.name]
                      : x.filter((n) => n !== t.name),
                  );
                }}
              />
              Allow read: {t.name}
            </label>
          ))}
        <button
          disabled={!target || status === "target changed"}
          onClick={() => void consent()}
        >
          {consented ? "Consent granted" : "Consent to pinned target + model"}
        </button>
      </section>
      {approval && (
        <section className="approval">
          <h2>Approve mutation</h2>
          <div className="pin">
            Client: {approval.clientId}
            <br />
            App: {approval.target.appId}
            <br />
            Origin: {approval.target.origin}
            <br />
            Document: {approval.target.documentId}
            <br />
            Tool: {approval.tool.name}
            <br />
            Target objects:{" "}
            {approval.targetObjects.join(", ") ||
              "Explicit document " + approval.call.documentId}
            <br />
            Expected revision: {approval.call.expectedRevision}
            <br />
            Arguments: {approval.canonicalArguments}
          </div>
          <button onClick={() => resolveApproval.current?.(true)}>
            Approve
          </button>
          <button
            className="danger"
            onClick={() => resolveApproval.current?.(false)}
          >
            Deny
          </button>
        </section>
      )}
      <section>
        <h2>Chat</h2>
        <div className="transcript">{text || "No messages yet."}</div>
        <textarea
          aria-label="Message"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <button disabled={!consented || running} onClick={() => void send()}>
          Send
        </button>
        <button
          className="danger"
          onClick={() => {
            run.current?.abort();
            resolveApproval.current?.(false);
            setStatus("cancelled");
          }}
        >
          Stop
        </button>
        <details>
          <summary>Tool activity</summary>
          <div className="transcript">{activity.join("\n")}</div>
        </details>
      </section>
      <section>
        <h2>Local MCP companion · {bridgeStatus}</h2>
        <p className="muted">
          Pairing grants the external client this target only. Reads use the
          same checked scope; every write needs this sidebar.
        </p>
        <label>WebSocket endpoint</label>
        <input
          aria-label="WebSocket endpoint"
          value={bridgeUrl}
          onChange={(e) => setBridgeUrl(e.target.value)}
        />
        <label>One-time pairing code</label>
        <input
          aria-label="One-time pairing code"
          value={pairCode}
          onChange={(e) => setPairCode(e.target.value)}
        />
        <button
          disabled={!consented || !target}
          onClick={() => {
            try {
              transport.current?.connect(bridgeUrl, pairCode, [target!]);
              setPairCode("");
            } catch (e) {
              log(String(e));
            }
          }}
        >
          Pair external client
        </button>
        {pairConfirm && (
          <div className="approval">
            <p>
              Confirm external client access to {target?.appId},{" "}
              {target?.documentId}, {target?.origin}?
            </p>
            <button onClick={pairConfirm.yes}>Confirm pairing</button>
            <button className="danger" onClick={pairConfirm.no}>
              Deny pairing
            </button>
          </div>
        )}
        {paired && (
          <>
            <p className="muted">Client: {paired.clientId}</p>
            <details>
              <summary>MCP credential · copy to local CLI environment</summary>
              <pre>{paired.mcpToken}</pre>
            </details>
            <button
              className="secondary"
              onClick={() => {
                try {
                  transport.current?.reconnect(bridgeUrl);
                } catch (e) {
                  log(String(e));
                }
              }}
            >
              Reconnect bridge
            </button>
            <button
              className="danger"
              onClick={() => {
                transport.current?.revoke();
                externalPolicies.current.get(paired.clientId)?.revoke();
                setPaired(null);
              }}
            >
              Revoke pairing
            </button>
          </>
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
