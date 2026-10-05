import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HostSimulator } from "./simulator.ts";
import type { Invoke, TargetDescriptor } from "../src/shared/contract.ts";
import "./style.css";
function App() {
  const iframe = useRef<HTMLIFrameElement>(null),
    sim = useRef(
      new HostSimulator(location.origin, async () => {
        const r = await fetch("/api/session");
        if (!r.ok) throw new Error("Logged out");
        const session = await r.json();
        return session.principal.id + ":" + session.sessionInstanceId;
      }),
    );
  const [target, setTarget] = useState<TargetDescriptor | null>(null),
    [lines, setLines] = useState<string[]>([]),
    [pending, setPending] = useState<any>(null),
    [last, setLast] = useState<Invoke | null>(null),
    [ctx, setCtx] = useState<any>(null),
    [consent, setConsent] = useState(false);
  const log = (name: string, r: any) =>
    setLines((old) => [name + ": " + JSON.stringify(r, null, 2), ...old]);
  const approval = (preview: any) =>
    new Promise<boolean>((resolve) => setPending({ ...preview, resolve }));
  const call = async (c: Invoke, approve = approval) => {
    if (!target) return;
    const r = await sim.current.call(
      target.targetId,
      target.pageInstanceId,
      c,
      approve,
    );
    log(c.toolName, r);
    return r;
  };
  const make = (
    toolName: string,
    args: any,
    revision: number | null = ctx?.revision ?? 0,
    key: string | null = crypto.randomUUID(),
  ): Invoke => ({
    requestId: crypto.randomUUID(),
    documentId: target!.documentId,
    toolName,
    arguments: args,
    expectedRevision: revision,
    idempotencyKey: key,
  });
  return (
    <>
      <header>
        <strong>Guava · Host Simulator</strong>
        <span>DEV ONLY · scripted simulation, no LLM</span>
      </header>
      <div className="shell">
        <section className="controls">
          <h2>Boundary harness</h2>
          <p>
            Sign in inside the app, select consumer lag, then discover. This dev
            page simulates host approval; real approval belongs to extension or
            desktop UI.
          </p>
          <button
            onClick={async () => {
              sim.current.close();
              setConsent(false);
              const bridge = iframe.current?.contentWindow?.agentBridgeV1;
              const r = await sim.current.discover(bridge);
              log("discovery", r);
              setTarget(r.ok ? r.data.targets[0] : null);
              setCtx(null);
            }}
          >
            Discover bridge
          </button>
          {target && (
            <div className="target">
              <strong>{target.appId}</strong>
              <p>
                {target.documentId}
                <br />
                {target.origin}
              </p>
              <small>{target.pageInstanceId}</small>
            </div>
          )}
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) sim.current.grantConsent();
                else sim.current.revokeConsent();
              }}
            />{" "}
            Allow this target's synthetic data in simulation
          </label>
          <button
            disabled={!target || !consent}
            onClick={async () => {
              const r = await sim.current.context(
                target!.targetId,
                target!.pageInstanceId,
              );
              log("context", r);
              if (r.ok) setCtx(r.data);
            }}
          >
            Read context
          </button>
          <button
            disabled={!ctx}
            onClick={() =>
              call(
                make("evidence_search", { query: "", limit: 20 }, null, null),
              )
            }
          >
            Read evidence
          </button>
          <button
            disabled={!ctx}
            onClick={async () => {
              const names =
                target!.documentId === "rca-consumer-lag"
                  ? [
                      "Consumer config regression",
                      "Traffic surge",
                      "Broker saturation",
                    ]
                  : [
                      "Reduce noisy pages",
                      "Improve handover",
                      "Schedule quiet time",
                    ];
              const nonce = crypto.randomUUID();
              const parent =
                ctx.selectionIds[0] ??
                (target!.documentId === "rca-consumer-lag"
                  ? "consumer-lag"
                  : "workshop");
              const operations: any[] = names.flatMap((label, i) => [
                {
                  op: "add_node",
                  node: {
                    id: "sim-" + nonce + "-" + i,
                    type: "hypothesis",
                    label,
                    body: "Scripted candidate to test; not an established fact.",
                    position: { x: 650, y: i * 180 },
                    evidenceIds:
                      target!.documentId === "rca-consumer-lag"
                        ? [
                            ["ev-config", "ev-logs"],
                            ["ev-metrics"],
                            ["ev-broker"],
                          ][i]
                        : [],
                  },
                },
                {
                  op: "add_edge",
                  edge: {
                    id: "link-" + nonce + "-" + i,
                    source: parent,
                    target: "sim-" + nonce + "-" + i,
                    type: "relates",
                    label: "candidate explanation",
                  },
                },
              ]);
              const c = make("canvas_apply_patch", { operations });
              setLast(c);
              await call(c);
            }}
          >
            Stage 3 hypotheses (one approval)
          </button>
          <button
            disabled={!last}
            onClick={() => call({ ...last!, requestId: crypto.randomUUID() })}
          >
            Replay identical request
          </button>
          <button
            disabled={!last}
            onClick={() =>
              call({
                ...last!,
                requestId: crypto.randomUUID(),
                idempotencyKey: crypto.randomUUID(),
              })
            }
          >
            Try stale revision
          </button>
          <button
            disabled={!last}
            onClick={() =>
              call(
                {
                  ...last!,
                  requestId: crypto.randomUUID(),
                  idempotencyKey: crypto.randomUUID(),
                },
                async () => false,
              )
            }
          >
            Deny before dispatch
          </button>
          <button
            disabled={!ctx || target?.documentId !== "rca-consumer-lag"}
            onClick={() =>
              call(
                make("investigation_propose_conclusion", {
                  summary:
                    "Proposed: batch configuration may explain reduced throughput; test by controlled configuration rollback. Traffic and broker metrics weaken alternatives, while the short rebalance is a competing deployment effect.",
                  supportingEvidenceIds: ["ev-config", "ev-metrics"],
                  contradictoryEvidenceIds: ["ev-transient"],
                }),
              )
            }
          >
            Stage proposed conclusion
          </button>
          <h3>Envelope log</h3>
          {lines.map((l, i) => (
            <pre key={i}>{l}</pre>
          ))}
        </section>
        <iframe
          ref={iframe}
          src="/"
          title="Investigation Canvas"
          onLoad={() => {
            sim.current.close();
            setTarget(null);
            setCtx(null);
            setConsent(false);
          }}
        />
      </div>
      {pending && (
        <div className="overlay">
          <div className="approval">
            <h2>Approve one batch?</h2>
            <p>
              Target: {pending.target.documentId}
              <br />
              Tool: {pending.call.toolName}
              <br />
              Expected revision: {pending.call.expectedRevision}
            </p>
            <pre>{JSON.stringify(pending.call.arguments, null, 2)}</pre>
            <button
              onClick={() => {
                pending.resolve(false);
                setPending(null);
              }}
            >
              Deny
            </button>
            <button
              className="allow"
              onClick={() => {
                pending.resolve(true);
                setPending(null);
              }}
            >
              Approve exact payload
            </button>
          </div>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
