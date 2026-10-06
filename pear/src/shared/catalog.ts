import toolCatalog from "../../bridge/tool-catalog.json" with { type: "json" };
import policyMap from "../../bridge/policy-map.json" with { type: "json" };
import type { ToolDescriptor } from "./contract.ts";

export const catalog = toolCatalog as unknown as ToolDescriptor[];

export type PolicyEntry = {
  phase: string;
  roles: string[];
  effect: "read" | "write";
  consent: string;
  approval: string;
  egress: string;
};
export const policies = policyMap.tools as unknown as Record<string, PolicyEntry>;

export const toolByName = new Map(catalog.map((t) => [t.name, t]));

export const id = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[a-zA-Z0-9_:-]+$",
};

export const invokeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "requestId",
    "documentId",
    "toolName",
    "arguments",
    "expectedRevision",
    "idempotencyKey",
  ],
  properties: {
    requestId: id,
    documentId: { type: "string", minLength: 1, maxLength: 160 },
    toolName: { type: "string", minLength: 1, maxLength: 64 },
    arguments: { type: "object" },
    expectedRevision: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
    },
    idempotencyKey: {
      anyOf: [{ type: "string", minLength: 1, maxLength: 128 }, { type: "null" }],
    },
  },
} as const;
