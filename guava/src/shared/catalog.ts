import { Bounds } from "@orchard/bridge-contract";
import { nodeTypes, edgeTypes } from "./domain.ts";
import type { ToolDescriptor } from "./contract.ts";
export const id = {
  type: "string",
  minLength: 1,
  maxLength: Bounds.id,
  pattern: "^[a-zA-Z0-9_-]+$",
};
const text = (maxLength: number) => ({ type: "string", maxLength });
export const object = (
  properties: Record<string, any>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const ids = { type: "array", items: id, maxItems: 40, uniqueItems: true };
const position = object({
  x: { type: "number", minimum: -100000, maximum: 100000 },
  y: { type: "number", minimum: -100000, maximum: 100000 },
});
const node = object({
  id,
  // Conclusions are created only via investigation_propose_conclusion.
  type: { enum: nodeTypes.filter((t) => t !== "conclusion") },
  label: { ...text(160), minLength: 1 },
  body: text(4000),
  position,
  evidenceIds: ids,
});
const edge = object({
  id,
  source: id,
  target: id,
  type: { enum: edgeTypes },
  label: text(160),
});
const op = (name: string, props: Record<string, any> = {}) =>
  object({ op: { const: name }, ...props });
const operations = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  items: {
    oneOf: [
      op("add_node", { node }),
      op("update_node", {
        id,
        changes: {
          ...object(
            {
              label: { ...text(160), minLength: 1 },
              body: text(4000),
              position,
              evidenceIds: ids,
            },
            [],
          ),
          minProperties: 1,
        },
      }),
      op("delete_node", { id }),
      op("add_edge", { edge }),
      op("update_edge", {
        id,
        changes: {
          ...object({ label: text(160), type: { enum: edgeTypes } }, []),
          minProperties: 1,
        },
      }),
      op("delete_edge", { id }),
      op("auto_layout"),
    ],
  },
};
const boundedInt = (maximum: number, minimum = 0) => ({
  type: "integer",
  minimum,
  maximum,
});
export const catalog: ToolDescriptor[] = [
  {
    name: "canvas_get_graph",
    effect: "read",
    description:
      "Read a stable graph page. Node and edge offsets are independent; revision is the snapshot revision. Reset pagination if revision changes. Maximum 100 nodes and 200 edges per page.",
    inputSchema: object(
      {
        nodeOffset: boundedInt(500),
        edgeOffset: boundedInt(1000),
        nodeLimit: boundedInt(100, 1),
        edgeLimit: boundedInt(200, 1),
      },
      [],
    ),
  },
  {
    name: "canvas_get_neighbors",
    effect: "read",
    description:
      "Read bounded undirected neighbors of explicit node IDs, depth 0–2, at most 100 nodes. Does not reinterpret current selection. Reports truncation.",
    inputSchema: object({
      nodeIds: { ...ids, minItems: 1, maxItems: 20 },
      depth: boundedInt(2),
    }),
  },
  {
    name: "evidence_search",
    effect: "read",
    description:
      "Deterministic substring search over synthetic records in this document. Optional source kind and tag filters, at most 40 results; never queries production systems.",
    inputSchema: object(
      {
        query: text(200),
        sourceKind: text(Bounds.id),
        tag: text(Bounds.id),
        offset: boundedInt(1000),
        limit: boundedInt(40, 1),
      },
      [],
    ),
  },
  {
    name: "evidence_get",
    effect: "read",
    description:
      "Read synthetic evidence records by explicit stable IDs, including timestamp and source metadata. All IDs must belong to the current authorized document.",
    inputSchema: object({ evidenceIds: { ...ids, minItems: 1, maxItems: 20 } }),
  },
  {
    name: "canvas_apply_patch",
    effect: "write",
    description:
      "Atomically apply up to 100 domain operations at expectedRevision: add/update/delete nodes, add/update/delete edges, or deterministic auto_layout. Node deletion requires incident edges deleted in the same batch. Hypotheses remain hypotheses; conclusions must use investigation_propose_conclusion. Accepted conclusions cannot be deleted. Maximum graph 500 nodes / 1000 edges.",
    inputSchema: object({ operations }),
  },
  {
    name: "canvas_undo",
    effect: "write",
    description:
      "Undo an explicitly identified latest document mutation only if no intervening mutation occurred. Cannot revert an accepted conclusion. Produces a new revision; SQLite document changes only. Read mutationId from the original result.",
    inputSchema: object({ mutationId: id }),
  },
  {
    name: "investigation_propose_conclusion",
    effect: "write",
    description:
      "Create a PROPOSED conclusion, not a verified fact. Explicitly cite supporting and contradictory evidence records. Only a separate human action can accept a conclusion.",
    inputSchema: object({
      summary: { ...text(4000), minLength: 1 },
      supportingEvidenceIds: { ...ids, minItems: 1 },
      contradictoryEvidenceIds: ids,
    }),
  },
];
export const invokeSchema = object({
  requestId: { type: "string", minLength: 1, maxLength: Bounds.id },
  documentId: id,
  toolName: {
    type: "string",
    minLength: 1,
    maxLength: Bounds.toolName,
    pattern: "^[a-zA-Z0-9_-]+$",
  },
  arguments: { type: "object" },
  expectedRevision: {
    anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
  },
  idempotencyKey: {
    anyOf: [{ type: "string", minLength: 1, maxLength: Bounds.id }, { type: "null" }],
  },
});
