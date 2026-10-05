export const nodeTypes = [
  "incident",
  "observation",
  "hypothesis",
  "evidence",
  "conclusion",
  "note",
] as const;
export const edgeTypes = ["relates", "supports", "contradicts"] as const;
export interface GraphNode {
  id: string;
  type: (typeof nodeTypes)[number];
  label: string;
  body: string;
  position: { x: number; y: number };
  evidenceIds: string[];
  status?: "proposed" | "accepted";
  supportingEvidenceIds?: string[];
  contradictoryEvidenceIds?: string[];
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: (typeof edgeTypes)[number];
  label: string;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Document {
  id: string;
  title: string;
  summary: string;
  revision: number;
  graph: Graph;
}
export interface Evidence {
  id: string;
  documentId: string;
  timestamp: string;
  source: { kind: string; name: string };
  title: string;
  content: string;
  tags: string[];
}
export type Operation =
  | { op: "add_node"; node: GraphNode }
  | {
      op: "update_node";
      id: string;
      changes: Partial<
        Pick<GraphNode, "label" | "body" | "position" | "evidenceIds">
      >;
    }
  | { op: "delete_node"; id: string }
  | { op: "add_edge"; edge: GraphEdge }
  | {
      op: "update_edge";
      id: string;
      changes: Partial<Pick<GraphEdge, "label" | "type">>;
    }
  | { op: "delete_edge"; id: string }
  | { op: "auto_layout" };
// Fixed columns by epistemic type, stable ID order. Cycles have no effect on layout.
export function autoLayout(graph: Graph): Graph {
  const columns: Record<string, number> = {
    incident: 0,
    observation: 1,
    hypothesis: 2,
    evidence: 3,
    conclusion: 4,
    note: 1,
  };
  const counts: Record<number, number> = {};
  return {
    ...graph,
    nodes: [...graph.nodes]
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .map((n) => {
        const c = columns[n.type];
        const row = counts[c] ?? 0;
        counts[c] = row + 1;
        return { ...n, position: { x: 80 + c * 300, y: 70 + row * 170 } };
      }),
  };
}
