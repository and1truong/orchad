import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import Ajv from "ajv";
import { catalog, invokeSchema, object, id } from "../shared/catalog.ts";
import {
  canonical,
  failure,
  success,
  type Invoke,
  type Result,
  type ErrorCode,
} from "../shared/contract.ts";
import {
  autoLayout,
  type Document,
  type Graph,
  type GraphNode,
  type Operation,
  type Evidence,
} from "../shared/domain.ts";
export interface Principal {
  id: string;
  role: "reader" | "investigator";
}
class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
const assert: (ok: unknown, code: ErrorCode, message: string) => asserts ok = (
  ok,
  code,
  message,
) => {
  if (!ok) throw new DomainError(code, message);
};
const ajv = new Ajv({ allErrors: true, strict: false });
const validateEnvelope = ajv.compile(invokeSchema);
const validators = new Map(
  catalog.map((t) => [t.name, ajv.compile(t.inputSchema)]),
);
const humanValidation = ajv.compile(object({ nodeId: id }));
export class CanvasService {
  constructor(public db: DatabaseSync) {}
  authorize(p: Principal, documentId: string, write = false) {
    assert(
      this.db
        .prepare("SELECT 1 FROM access WHERE principal=? AND document_id=?")
        .get(p.id, documentId),
      "FORBIDDEN",
      "Document access denied",
    );
    if (write)
      assert(
        p.role === "investigator",
        "FORBIDDEN",
        "Investigator permission required",
      );
  }
  document(p: Principal, documentId: string): Document {
    this.authorize(p, documentId);
    const row = this.db
      .prepare("SELECT * FROM documents WHERE id=?")
      .get(documentId) as any;
    assert(row, "NOT_FOUND", "Document not found");
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      revision: row.revision,
      graph: JSON.parse(row.graph),
    };
  }
  list(p: Principal) {
    return this.db
      .prepare(
        "SELECT d.id,d.title,d.summary,d.revision FROM documents d JOIN access a ON a.document_id=d.id WHERE a.principal=? ORDER BY d.id",
      )
      .all(p.id);
  }
  evidence(p: Principal, documentId: string, ids?: string[]): Evidence[] {
    this.authorize(p, documentId);
    if (ids)
      return ids.map((id) => {
        const row = this.db
          .prepare("SELECT record FROM evidence WHERE id=? AND document_id=?")
          .get(id, documentId) as any;
        assert(
          row,
          "NOT_FOUND",
          "Evidence unavailable in this document: " + id,
        );
        return JSON.parse(row.record);
      });
    return this.db
      .prepare("SELECT record FROM evidence WHERE document_id=? ORDER BY id")
      .all(documentId)
      .map((r: any) => JSON.parse(r.record));
  }
  validateGraph(p: Principal, d: Document) {
    assert(
      d.graph.nodes.length <= 500 && d.graph.edges.length <= 1000,
      "INVALID_ARGUMENT",
      "Graph size limit exceeded",
    );
    const ns = new Set(d.graph.nodes.map((n) => n.id));
    const es = new Set(d.graph.edges.map((e) => e.id));
    assert(
      ns.size === d.graph.nodes.length && es.size === d.graph.edges.length,
      "INVALID_ARGUMENT",
      "Duplicate graph ID",
    );
    for (const n of d.graph.nodes) this.evidence(p, d.id, n.evidenceIds);
    for (const e of d.graph.edges)
      assert(
        ns.has(e.source) && ns.has(e.target),
        "INVALID_ARGUMENT",
        "Dangling edge: " + e.id,
      );
  }
  patch(p: Principal, d: Document, ops: Operation[]) {
    for (const op of ops) {
      const g = d.graph;
      switch (op.op) {
        case "add_node":
          assert(
            op.node.type !== "conclusion",
            "INVALID_ARGUMENT",
            "Use investigation_propose_conclusion for conclusions",
          );
          assert(
            !g.nodes.some((n) => n.id === op.node.id),
            "INVALID_ARGUMENT",
            "Node already exists",
          );
          g.nodes.push(structuredClone(op.node));
          break;
        case "update_node": {
          const node = g.nodes.find((n) => n.id === op.id);
          assert(node, "NOT_FOUND", "Node not found");
          assert(
            node.type !== "conclusion" ||
              Object.keys(op.changes).every((k) => k === "position"),
            "INVALID_ARGUMENT",
            "Conclusion contents are immutable; propose a new conclusion",
          );
          Object.assign(node, op.changes);
          break;
        }
        case "delete_node": {
          const node = g.nodes.find((n) => n.id === op.id);
          assert(node, "NOT_FOUND", "Node not found");
          assert(
            node.type !== "conclusion" || node.status !== "accepted",
            "INVALID_ARGUMENT",
            "Accepted conclusions cannot be deleted by tools",
          );
          g.nodes = g.nodes.filter((n) => n.id !== op.id);
          break;
        }
        case "add_edge":
          assert(
            !g.edges.some((e) => e.id === op.edge.id),
            "INVALID_ARGUMENT",
            "Edge already exists",
          );
          g.edges.push(structuredClone(op.edge));
          break;
        case "update_edge": {
          const edge = g.edges.find((e) => e.id === op.id);
          assert(edge, "NOT_FOUND", "Edge not found");
          Object.assign(edge, op.changes);
          break;
        }
        case "delete_edge":
          assert(
            g.edges.some((e) => e.id === op.id),
            "NOT_FOUND",
            "Edge not found",
          );
          g.edges = g.edges.filter((e) => e.id !== op.id);
          break;
        case "auto_layout":
          d.graph = autoLayout(g);
          break;
      }
    }
    this.validateGraph(p, d);
  }
  read(p: Principal, d: Document, call: Invoke) {
    const a = call.arguments as any;
    switch (call.toolName) {
      case "canvas_get_graph": {
        const no = a.nodeOffset ?? 0,
          eo = a.edgeOffset ?? 0,
          nl = a.nodeLimit ?? 100,
          el = a.edgeLimit ?? 200;
        return {
          id: d.id,
          title: d.title,
          summary: d.summary,
          revision: d.revision,
          nodes: d.graph.nodes.slice(no, no + nl),
          edges: d.graph.edges.slice(eo, eo + el),
          totalNodes: d.graph.nodes.length,
          totalEdges: d.graph.edges.length,
          nextNodeOffset: no + nl < d.graph.nodes.length ? no + nl : null,
          nextEdgeOffset: eo + el < d.graph.edges.length ? eo + el : null,
        };
      }
      case "canvas_get_neighbors": {
        for (const id of a.nodeIds)
          assert(
            d.graph.nodes.some((n) => n.id === id),
            "NOT_FOUND",
            "Node not found",
          );
        const visited = new Set<string>(a.nodeIds);
        let truncated = false;
        for (let step = 0; step < a.depth; step++) {
          const frontier = new Set(visited);
          for (const edge of d.graph.edges)
            for (const [s, t] of [
              [edge.source, edge.target],
              [edge.target, edge.source],
            ])
              if (frontier.has(s) && !visited.has(t)) {
                if (visited.size < 100) visited.add(t);
                else truncated = true;
              }
        }
        const nodes = d.graph.nodes.filter((n) => visited.has(n.id));
        const edges = d.graph.edges.filter(
          (e) => visited.has(e.source) && visited.has(e.target),
        );
        return {
          nodes,
          edges: edges.slice(0, 200),
          truncated: truncated || edges.length > 200,
        };
      }
      case "evidence_search": {
        const q = (a.query ?? "").toLowerCase();
        const all = this.evidence(p, d.id).filter(
          (e) =>
            (!a.sourceKind || e.source.kind === a.sourceKind) &&
            (!a.tag || e.tags.includes(a.tag)) &&
            (e.title + " " + e.content).toLowerCase().includes(q),
        );
        const offset = a.offset ?? 0,
          limit = a.limit ?? 20;
        return {
          records: all.slice(offset, offset + limit),
          total: all.length,
          nextOffset: offset + limit < all.length ? offset + limit : null,
        };
      }
      case "evidence_get":
        return { records: this.evidence(p, d.id, a.evidenceIds) };
      default:
        throw new DomainError("UNSUPPORTED", "Tool not supported");
    }
  }
  audit(
    p: Principal,
    call: Invoke,
    before: number | null,
    after: number | null,
    result: string,
  ) {
    const args = call.arguments as any;
    const summary =
      call.toolName === "canvas_apply_patch" && Array.isArray(args.operations)
        ? call.toolName +
          ": " +
          args.operations
            .map((o: any) =>
              typeof o?.op === "string" ? o.op.slice(0, 30) : "?",
            )
            .join(", ")
            .slice(0, 1000)
        : call.toolName;
    this.db
      .prepare(
        "INSERT INTO audit(timestamp,principal,request_id,document_id,summary,before_revision,after_revision,result) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        new Date().toISOString(),
        p.id,
        call.requestId,
        call.documentId,
        summary,
        before,
        after,
        result,
      );
  }
  invoke(p: Principal, raw: unknown, human = false): Result {
    if (!validateEnvelope(raw)) {
      const input =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const bounded = (value: unknown, max: number, fallback: string) =>
        typeof value === "string" ? value.slice(0, max) : fallback;
      try {
        this.audit(
          p,
          {
            requestId: bounded(input.requestId, 120, "invalid-request"),
            documentId: bounded(input.documentId, 80, "unknown"),
            toolName: bounded(input.toolName, 64, "invalid-envelope"),
            arguments: {},
            expectedRevision: null,
            idempotencyKey: null,
          },
          null,
          null,
          "INVALID_ARGUMENT",
        );
      } catch {
        /* Audit is best-effort; still return the envelope error. */
      }
      return failure("INVALID_ARGUMENT", "Invalid request envelope");
    }
    const call = raw as unknown as Invoke;
    let before: number | null = null;
    let inTx = false;
    try {
      assert(
        !human || call.toolName === "human_accept_conclusion",
        "INVALID_ARGUMENT",
        "Human endpoint only runs the conclusion acceptance operation",
      );
      const tool = catalog.find((t) => t.name === call.toolName);
      const accepting = human && call.toolName === "human_accept_conclusion";
      assert(tool || accepting, "UNSUPPORTED", "Unknown tool");
      const write = accepting || tool!.effect !== "read";
      this.db.exec("BEGIN IMMEDIATE");
      inTx = true;
      this.authorize(p, call.documentId, write);
      const d = this.document(p, call.documentId);
      before = d.revision;
      const validate = accepting
        ? humanValidation
        : validators.get(call.toolName)!;
      assert(
        validate(call.arguments),
        "INVALID_ARGUMENT",
        "Tool arguments do not match schema",
      );
      assert(
        write
          ? Number.isInteger(call.expectedRevision) &&
              call.idempotencyKey !== null
          : call.expectedRevision === null && call.idempotencyKey === null,
        "INVALID_ARGUMENT",
        "Invalid revision/idempotency for tool effect",
      );
      const semantic = canonical({
        toolName: call.toolName,
        arguments: call.arguments,
        expectedRevision: call.expectedRevision,
      });
      if (write) {
        const old = this.db
          .prepare(
            "SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?",
          )
          .get(p.id, d.id, call.idempotencyKey!) as any;
        if (old) {
          assert(
            old.semantic === semantic,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key was used with another semantic request",
          );
          const result = JSON.parse(old.result);
          this.audit(p, call, before, before, "REPLAY");
          this.db.exec("COMMIT");
          inTx = false;
          return result;
        }
        assert(
          call.expectedRevision === d.revision,
          "STALE_CONTEXT",
          "Document changed; read context and request fresh approval",
        );
      }
      if (!write) {
        const result = success(d.revision, this.read(p, d, call));
        this.audit(p, call, before, before, "OK");
        this.db.exec("COMMIT");
        inTx = false;
        return result;
      }
      const beforeGraph = JSON.stringify(d.graph);
      const mutationId = randomUUID();
      let extra: Record<string, unknown> = {};
      const a = call.arguments as any;
      if (accepting) {
        const node = d.graph.nodes.find(
          (n) => n.id === a.nodeId && n.type === "conclusion",
        );
        assert(node, "NOT_FOUND", "Conclusion not found");
        assert(
          node.status === "proposed",
          "INVALID_ARGUMENT",
          "Conclusion already accepted",
        );
        node.status = "accepted";
        extra = { nodeId: node.id };
      } else if (call.toolName === "canvas_apply_patch")
        this.patch(p, d, a.operations);
      else if (call.toolName === "investigation_propose_conclusion") {
        this.evidence(p, d.id, [
          ...a.supportingEvidenceIds,
          ...a.contradictoryEvidenceIds,
        ]);
        assert(
          !a.supportingEvidenceIds.some((id: string) =>
            a.contradictoryEvidenceIds.includes(id),
          ),
          "INVALID_ARGUMENT",
          "Evidence cannot be both supporting and contradictory",
        );
        const node: GraphNode = {
          id: "conclusion-" + randomUUID(),
          type: "conclusion",
          label: a.summary.slice(0, 100),
          body: a.summary,
          position: { x: 1200, y: 100 },
          evidenceIds: [
            ...a.supportingEvidenceIds,
            ...a.contradictoryEvidenceIds,
          ],
          supportingEvidenceIds: a.supportingEvidenceIds,
          contradictoryEvidenceIds: a.contradictoryEvidenceIds,
          status: "proposed",
        };
        d.graph.nodes.push(node);
        this.validateGraph(p, d);
        extra = { nodeId: node.id, status: "proposed" };
      } else if (call.toolName === "canvas_undo") {
        const h = this.db
          .prepare("SELECT * FROM history WHERE id=? AND document_id=?")
          .get(a.mutationId, d.id) as any;
        assert(h, "NOT_FOUND", "Mutation not found");
        assert(
          !h.undone && h.after_revision === d.revision,
          "STALE_CONTEXT",
          "Undo conflicts with subsequent changes",
        );
        const accepted = d.graph.nodes.filter(
          (n) => n.type === "conclusion" && n.status === "accepted",
        );
        d.graph = JSON.parse(h.before_graph);
        this.validateGraph(p, d);
        for (const n of accepted)
          assert(
            d.graph.nodes.find((m) => m.id === n.id)?.status === "accepted",
            "INVALID_ARGUMENT",
            "Undo cannot revert an accepted conclusion",
          );
        this.db.prepare("UPDATE history SET undone=1 WHERE id=?").run(h.id);
        extra = { undoneMutationId: h.id };
      }
      d.revision++;
      this.db
        .prepare("UPDATE documents SET graph=?,revision=? WHERE id=?")
        .run(JSON.stringify(d.graph), d.revision, d.id);
      this.db
        .prepare(
          "INSERT INTO history(id,document_id,principal,before_graph,after_revision) VALUES(?,?,?,?,?)",
        )
        .run(mutationId, d.id, p.id, beforeGraph, d.revision);
      const result = success(d.revision, { mutationId, ...extra });
      this.db
        .prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)")
        .run(
          p.id,
          d.id,
          call.idempotencyKey!,
          semantic,
          JSON.stringify(result),
        );
      this.audit(p, call, before, d.revision, "OK");
      this.db.exec("COMMIT");
      inTx = false;
      return result;
    } catch (e) {
      if (inTx) this.db.exec("ROLLBACK");
      const error =
        e instanceof DomainError
          ? e
          : new DomainError("INTERNAL", "Internal application error");
      try {
        this.audit(p, call, before, before, error.code);
      } catch {
        /* Audit is best-effort; the domain error still reaches the caller. */
      }
      return failure(error.code, error.message, before);
    }
  }
}
