import React, { useEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import { ApplicationController } from "./controller.ts";
import { installBridge } from "./bridge.ts";
import {
  nodeTypes,
  edgeTypes,
  type GraphNode,
  type Operation,
  type Evidence,
} from "../shared/domain.ts";
import type { Result } from "../shared/contract.ts";
const controller = new ApplicationController();
installBridge(controller.bridge());
function CanvasNode({ data, selected }: NodeProps) {
  const n = data.node as GraphNode;
  return (
    <div className={"graph-card " + n.type + (selected ? " selected" : "")}>
      <Handle type="target" position={Position.Left} />
      <div className="node-kicker">
        <span>{n.type}</span>
        {n.status && <b>{n.status}</b>}
      </div>
      <strong>{n.label}</strong>
      <p>
        {n.body.slice(0, 110)}
        {n.body.length > 110 ? "…" : ""}
      </p>
      {n.evidenceIds.length > 0 && (
        <small>
          {n.evidenceIds.length} evidence reference
          {n.evidenceIds.length > 1 ? "s" : ""}
        </small>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const types = { card: CanvasNode };
function App() {
  const [, update] = useReducer((x) => x + 1, 0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [nodes, setNodes] = useState<Node[]>([]),
    [edges, setEdges] = useState<Edge[]>([]),
    [evidence, setEvidence] = useState<Evidence[]>([]),
    [audit, setAudit] = useState<any[]>([]),
    [tab, setTab] = useState("inspector"),
    [edgeId, setEdgeId] = useState<string | null>(null);
  useEffect(() => controller.subscribe(update), []);
  useEffect(() => {
    controller.restore().finally(() => setReady(true));
    const poll = setInterval(() => {
      if (controller.principal)
        controller.refresh().catch(() => controller.restore());
    }, 3000);
    return () => clearInterval(poll);
  }, []);
  const doc = controller.document;
  const editable = controller.principal?.role === "investigator";
  useEffect(() => {
    if (!doc) return;
    setNodes(
      doc.graph.nodes.map((n) => ({
        id: n.id,
        type: "card",
        position: n.position,
        data: { node: n },
        selected: controller.selectionIds.includes(n.id),
      })),
    );
    setEdges(
      doc.graph.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        label: e.label || e.type,
        style: {
          stroke:
            e.type === "contradicts"
              ? "#df756c"
              : e.type === "supports"
                ? "#46a889"
                : "#94a3b8",
        },
        data: { domainType: e.type },
      })),
    );
  }, [doc, controller.selectionIds.join(",")]);
  const act = async (work: () => Promise<Result | void>) => {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      if (result && !result.ok) {
        setError(result.error!.code + ": " + result.error!.message);
        if (result.error?.code === "STALE_CONTEXT") await controller.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selected = doc?.graph.nodes.find(
    (n) => n.id === controller.selectionIds[0],
  );
  const selectedEdge = doc?.graph.edges.find((e) => e.id === edgeId);
  const readEvidence = async (query = "") => {
    if (!doc) return;
    const result = await controller.invoke({
      requestId: crypto.randomUUID(),
      documentId: doc.id,
      toolName: "evidence_search",
      arguments: { query, limit: 40 },
      expectedRevision: null,
      idempotencyKey: null,
    });
    if (result.ok) setEvidence(result.data.records);
    else setError(result.error!.message);
  };
  if (!ready) return <div className="login">Loading…</div>;
  if (!controller.principal)
    return (
      <div className="login">
        <div className="brand">◈ guava</div>
        <h1>Think in connections.</h1>
        <p>Investigation Canvas · synthetic demo</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            act(() =>
              controller.login(
                String(data.get("username")),
                String(data.get("password")),
              ),
            );
          }}
        >
          <label>
            Development account
            <select name="username">
              <option>investigator</option>
              <option>reader</option>
            </select>
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              defaultValue="investigator-dev"
              required
            />
          </label>
          <button disabled={busy}>Sign in</button>
        </form>
        <small>
          Development auth only. investigator / investigator-dev
          <br />
          reader / reader-dev. Roles are checked by the backend.
        </small>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">◈ guava</div>
        <div className="workspace">INVESTIGATION WORKSPACE</div>
        <h3>
          Documents <span>02</span>
        </h3>
        {controller.documents.map((d) => (
          <button
            className={"document " + (doc?.id === d.id ? "active" : "")}
            key={d.id}
            onClick={() => act(() => controller.open(d.id))}
          >
            <span>{d.id.startsWith("rca") ? "◉" : "✧"}</span>
            <div>
              <strong>{d.title}</strong>
              <small>
                {d.id.startsWith("rca")
                  ? "Root cause analysis"
                  : "Brainstorming map"}
              </small>
            </div>
          </button>
        ))}
        <div className="legend">
          <h4>Make uncertainty visible</h4>
          {nodeTypes.map((t) => (
            <div key={t}>
              <i className={t} />
              {t}
            </div>
          ))}
          <p>
            Hypotheses are questions to test. Proposed conclusions require human
            review.
          </p>
        </div>
        <div className="account">
          <strong>{controller.principal.id}</strong>
          <small>
            {editable ? "Can investigate and edit" : "Read-only access"}
          </small>
          <button onClick={() => act(() => controller.logout())}>
            Sign out
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">
              SYNTHETIC DATA · NO PRODUCTION SYSTEMS
            </div>
            <h1>{doc?.title}</h1>
          </div>
          <span className="revision">Revision {doc?.revision}</span>
        </header>
        <div className="toolbar">
          <span>↖ Select · drag to move · Shift for multi-select</span>
          <button
            disabled={!editable || busy}
            onClick={() => act(() => controller.patch([{ op: "auto_layout" }]))}
          >
            Auto-layout
          </button>
          <button
            disabled={!editable || busy || !controller.lastMutationId}
            onClick={() =>
              act(() =>
                controller.mutate("canvas_undo", {
                  mutationId: controller.lastMutationId,
                }),
              )
            }
          >
            Undo
          </button>
          <button
            className="primary"
            disabled={!editable || busy}
            onClick={() =>
              act(() =>
                controller.patch([
                  {
                    op: "add_node",
                    node: {
                      id: "node-" + crypto.randomUUID(),
                      type: "note",
                      label: "New note",
                      body: "",
                      position: { x: 250, y: 80 },
                      evidenceIds: [],
                    },
                  },
                ]),
              )
            }
          >
            + Add node
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        <div className="canvas">
          <ReactFlow
            key={doc?.id}
            nodes={nodes}
            edges={edges}
            nodeTypes={types}
            onNodesChange={(changes) =>
              setNodes((old) => applyNodeChanges(changes, old))
            }
            onSelectionChange={({ nodes }) => {
              const ids = nodes.map((n) => n.id);
              if (ids.join(",") !== controller.selectionIds.join(","))
                controller.select(ids);
            }}
            onNodeClick={(_, n) => {
              setEdgeId(null);
              setTab("inspector");
            }}
            onEdgeClick={(_, e) => {
              setEdgeId(e.id);
              setTab("inspector");
            }}
            onNodeDragStop={(_, node, dragged) =>
              act(() =>
                controller.patch(
                  (dragged.length ? dragged : [node]).map((n) => ({
                    op: "update_node",
                    id: n.id,
                    changes: { position: n.position },
                  })),
                ),
              )
            }
            onConnect={(c) =>
              act(() =>
                controller.patch([
                  {
                    op: "add_edge",
                    edge: {
                      id: "edge-" + crypto.randomUUID(),
                      source: c.source,
                      target: c.target,
                      type: "relates",
                      label: "relates",
                    },
                  },
                ]),
              )
            }
            nodesDraggable={editable && !busy}
            nodesConnectable={editable && !busy}
            deleteKeyCode={null}
            fitView
            minZoom={0.15}
            maxZoom={2}
            selectionOnDrag
          >
            <Background gap={24} color="#d9e0e6" />
            <Controls />
            <MiniMap pannable zoomable nodeColor="#8eb8a4" />
          </ReactFlow>
          <div className="canvas-label">
            SHARED DOCUMENT · DETERMINISTIC OPERATIONS
          </div>
        </div>
        <footer>
          <span>
            {doc?.graph.nodes.length} nodes · {doc?.graph.edges.length}{" "}
            connections
          </span>
          <span>No model, chat or API key in this app</span>
        </footer>
      </main>
      <aside className="inspector">
        <nav>
          {["inspector", "evidence", "audit"].map((t) => (
            <button
              key={t}
              className={tab === t ? "chosen" : ""}
              onClick={() => {
                setTab(t);
                if (t === "evidence") readEvidence();
                if (t === "audit")
                  controller
                    .audit()
                    .then((r) => setAudit(r.entries))
                    .catch((e) => setError((e as Error).message));
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === "inspector" &&
          (selectedEdge ? (
            <EdgeInspector
              key={selectedEdge.id + doc?.revision}
              edge={selectedEdge}
              editable={editable}
              act={act}
            />
          ) : selected ? (
            <NodeInspector
              key={selected.id + doc?.revision}
              node={selected}
              editable={editable}
              act={act}
            />
          ) : (
            <div className="empty">
              <span>◎</span>
              <h3>Follow the evidence</h3>
              <p>
                Select a node to inspect its claims and references. Connect
                nodes to make your reasoning visible.
              </p>
              <p className="tip">
                Human edits and external tools use the same domain operations.
              </p>
            </div>
          ))}
        {tab === "evidence" && (
          <div className="evidence-list">
            <h3>Synthetic evidence</h3>
            <input
              aria-label="Search evidence"
              placeholder="Search fixture records…"
              onChange={(e) => readEvidence(e.target.value)}
            />
            {evidence.map((e) => (
              <article key={e.id}>
                <small>
                  {e.source.kind} · {e.timestamp}
                </small>
                <h4>{e.title}</h4>
                <code>{e.id}</code>
                <p>{e.content}</p>
              </article>
            ))}
            {!evidence.length && <p>No matching records in this document.</p>}
          </div>
        )}
        {tab === "audit" && (
          <div className="audit">
            <h3>Server audit</h3>
            {audit.map((a) => (
              <article key={a.id}>
                <strong>
                  {a.principal} · {a.result}
                </strong>
                <p>{a.summary}</p>
                <small>
                  Revision {a.before_revision} → {a.after_revision}
                  <br />
                  {a.request_id}
                </small>
              </article>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
function NodeInspector({
  node,
  editable,
  act,
}: {
  node: GraphNode;
  editable: boolean;
  act: (f: () => Promise<Result | void>) => void;
}) {
  const [label, setLabel] = useState(node.label),
    [body, setBody] = useState(node.body),
    [kind, setKind] = useState(node.type),
    [refs, setRefs] = useState(node.evidenceIds.join(", ")),
    [x, setX] = useState(node.position.x),
    [y, setY] = useState(node.position.y);
  return (
    <div className="fields">
      <div className="eyebrow">NODE INSPECTOR</div>
      <h2>{node.label}</h2>
      <small>{node.id}</small>
      <label>
        Type
        <select
          value={kind}
          disabled={!editable || node.type === "conclusion"}
          onChange={(e) => setKind(e.target.value as any)}
        >
          {nodeTypes
            .filter((t) => t !== "conclusion" || node.type === "conclusion")
            .map((t) => (
              <option key={t}>{t}</option>
            ))}
        </select>
      </label>
      <label>
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!editable || node.type === "conclusion"}
        />
      </label>
      <label>
        Details
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!editable || node.type === "conclusion"}
          rows={7}
        />
      </label>
      <label>
        Evidence IDs
        <input
          value={refs}
          onChange={(e) => setRefs(e.target.value)}
          disabled={!editable || node.type === "conclusion"}
        />
      </label>
      <div className="coordinates">
        <label>
          X
          <input
            type="number"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </label>
      </div>
      {node.type === "conclusion" ? (
        <>
          <p>
            Conclusion status: <strong>{node.status}</strong>
          </p>
          <p>Supporting: {node.supportingEvidenceIds?.join(", ")}</p>
          <p>
            Contradictory:{" "}
            {node.contradictoryEvidenceIds?.join(", ") || "None cited"}
          </p>
          {node.status === "proposed" && (
            <button
              disabled={!editable}
              onClick={() =>
                act(() =>
                  controller.mutate(
                    "human_accept_conclusion",
                    { nodeId: node.id },
                    true,
                  ),
                )
              }
            >
              Accept conclusion as human
            </button>
          )}
        </>
      ) : (
        <button
          className="primary"
          disabled={!editable}
          onClick={() =>
            act(() => {
              const changes = {
                label,
                body,
                position: { x, y },
                evidenceIds: refs
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              };
              if (kind === node.type)
                return controller.patch([
                  { op: "update_node", id: node.id, changes },
                ]);
              const doc = controller.document!;
              const linked = doc.graph.edges.filter(
                (e) => e.source === node.id || e.target === node.id,
              );
              return controller.patch([
                ...linked.map(
                  (e) => ({ op: "delete_edge", id: e.id }) as Operation,
                ),
                { op: "delete_node", id: node.id },
                { op: "add_node", node: { ...node, ...changes, type: kind } },
                ...linked.map(
                  (edge) => ({ op: "add_edge", edge }) as Operation,
                ),
              ]);
            })
          }
        >
          Save changes
        </button>
      )}
      <button
        className="danger"
        disabled={!editable}
        onClick={() =>
          act(() => {
            const linked = controller.document!.graph.edges.filter(
              (e) => e.source === node.id || e.target === node.id,
            );
            return controller.patch([
              ...linked.map(
                (e) => ({ op: "delete_edge", id: e.id }) as Operation,
              ),
              { op: "delete_node", id: node.id },
            ]);
          })
        }
      >
        Delete node and connections
      </button>
    </div>
  );
}
function EdgeInspector({ edge, editable, act }: any) {
  const [label, setLabel] = useState(edge.label),
    [kind, setKind] = useState(edge.type);
  return (
    <div className="fields">
      <h2>Connection</h2>
      <p>
        {edge.source} → {edge.target}
      </p>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {edgeTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button
        disabled={!editable}
        onClick={() =>
          act(() =>
            controller.patch([
              {
                op: "update_edge",
                id: edge.id,
                changes: { label, type: kind },
              },
            ]),
          )
        }
      >
        Save connection
      </button>
      <button
        disabled={!editable}
        className="danger"
        onClick={() =>
          act(() => controller.patch([{ op: "delete_edge", id: edge.id }]))
        }
      >
        Delete connection
      </button>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
