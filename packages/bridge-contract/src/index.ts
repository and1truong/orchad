// @orchard/bridge-contract — the single implementation of the Agent App
// Bridge 0.1 contract helpers. Every POC imports these; per-repo extensions
// live beside this file, not inside it. Bounds here mirror the "Giới hạn
// envelope" section of the root `contract` document — keep them in sync.

import { Validator, type Schema } from "@cfworker/json-schema";

// Envelope bounds shared by every host and app (contract §9). The identity
// ceilings apply to requestId, idempotencyKey, toolCallId, sessionId,
// targetId, pageInstanceId, appId, documentId and sessionEpoch.
export const Bounds = {
  /** requestId, idempotencyKey, toolCallId, sessionId, targetId, pageInstanceId */
  id: 128,
  /** appId, documentId, sessionEpoch */
  appId: 128,
  documentId: 128,
  sessionEpoch: 128,
  /** tool name (also matches /^[A-Za-z0-9_-]{1,64}$/) */
  toolName: 64,
  description: 4096,
  summary: 8192,
  errorMessage: 8192,
  title: 1024,
  /** max entries of a context selectionIds array */
  selectionIds: 256,
  /** serialized Call/Result/message envelope cap (64 KiB) */
  message: 65536,
  /** tools per catalog */
  tools: 64,
  /** live MCP sessions per host: reject new ones (fail-closed, no eviction) */
  sessions: 64,
  /** guidance defaults: page dispatch timeout and human approval TTL */
  dispatchTimeoutMs: 10_000,
  approvalTtlMs: 60_000,
} as const;

export const Codes = [
  "INVALID_ARGUMENT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "STALE_CONTEXT",
  "IDEMPOTENCY_CONFLICT",
  "APPROVAL_DENIED",
  "CANCELLED",
  "TIMEOUT",
  "TARGET_CLOSED",
  "UNSUPPORTED",
  "INTERNAL",
] as const;
export type Code = (typeof Codes)[number];

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type Result = {
  ok: boolean;
  revision: number | null;
  data: Json;
  error: { code: Code; message: string; retryable: boolean } | null;
};

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: "read" | "write" | "destructive";
  outputSchema?: Record<string, unknown>;
};

export type Context = {
  appId: string;
  documentId: string;
  revision: number;
  selectionIds: string[];
  summary: string;
  sessionEpoch?: string | null;
};

export type Description = {
  protocolVersion: "0.1";
  appId: string;
  tools: Tool[];
};

export type Call = {
  requestId: string;
  documentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  expectedRevision: number;
  idempotencyKey: string;
};

export type Target = {
  targetId: string;
  title: string;
};

export type Binding = { targetId: string; pageInstanceId: string };

// Deterministic JSON serialization: object keys sorted, no whitespace. Used
// for approval arg-pinning and target-binding equality across hosts.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

// `success` takes the payload first: the arg order (data, revision) is part of
// the shared signature — the previous per-repo (revision, data) ordering was
// an interop footgun when porting code between POCs.
export const success = (
  data: unknown,
  revision: number | null = null,
): Result => ({
  ok: true,
  revision,
  data: data as Json,
  error: null,
});

// `failure` mirrors the Result shape; `revision` stays last and optional since
// failures typically carry none. Messages are clamped to the error bound so a
// large upstream message cannot produce a Result that exceeds it.
export const failure = (
  code: Code,
  message: string,
  retryable = false,
  revision: number | null = null,
): Result => ({
  ok: false,
  revision,
  data: null,
  error: { code, message: message.slice(0, 8000), retryable },
});

// Byte cap check for a serialized envelope (contract message cap).
export function withinMessageCap(value: unknown): boolean {
  const encoded = JSON.stringify(value);
  return (
    encoded !== undefined &&
    new TextEncoder().encode(encoded).length <= Bounds.message
  );
}

// Bounded page-declared schema dialect. Combinators are allowed with a
// fan-out cap; '$id', '$schema', '$ref'/'$defs' and 'format' stay excluded
// (process-wide $id registration, unsupported drafts, divergent annotation
// semantics), as do patternProperties/propertyNames/dependentSchemas/
// contains/if-then-else and unevaluated* to keep the dialect a small closed
// set.
export const SAFE_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "prefixItems",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "description",
  "title",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$comment",
  "pattern",
  "uniqueItems",
  "oneOf",
  "anyOf",
  "allOf",
  "not",
]);

// Page-declared patterns execute inside the trusted host on every argument
// check. Length is capped and backreferences or a quantified group containing
// an unbounded repeat ((a+)+, (a*)*) are refused; a bounded outer quantifier
// like (\d{2,}){3} stays linear and is allowed. The heuristic
// intentionally fails closed on odd shapes rather than proving linearity.
function repeatedGroup(p: string): boolean {
  const unbounded = (s: string) => {
    const m = /^(?:([+*])|\{(\d+)(,(\d*))?\})/.exec(s);
    if (!m) return s[0] === "{";
    if (m[1]) return true;
    return m[3] === "," && m[4] === "";
  };
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "\\") {
      i++;
      continue;
    }
    if (p[i] === "[") {
      i++;
      if (p[i] === "^") i++;
      while (i < p.length && p[i] !== "]") {
        if (p[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (p[i] !== "(") continue;
    let inner = false,
      depth = 1,
      j = i + 1;
    for (; j < p.length && depth; j++) {
      if (p[j] === "\\") {
        j++;
        continue;
      }
      if (p[j] === "[") {
        j++;
        if (p[j] === "^") j++;
        while (j < p.length && p[j] !== "]") {
          if (p[j] === "\\") j++;
          j++;
        }
        continue;
      }
      if (p[j] === "(") depth++;
      else if (p[j] === ")") depth--;
      if (depth && unbounded(p.slice(j))) inner = true;
    }
    if (inner && unbounded(p.slice(j))) return true;
  }
  return false;
}
export function safePattern(p: unknown): boolean {
  if (typeof p !== "string" || !p.length || p.length > 256) return false;
  if (/\\[1-9]|\\k</.test(p)) return false;
  if (repeatedGroup(p)) return false;
  try {
    new RegExp(p);
  } catch {
    return false;
  }
  return true;
}

// Page-declared schemas are untrusted input, but they are compiled and
// executed inside the trusted host before approval. The dialect is the
// bounded subset below: combinators with a fan-out cap, uniqueItems only on
// small arrays, patterns under the bounded regex policy, value-type checks on
// every keyword, plus global subschema-count, depth and byte caps, so a
// hostile schema fails closed instead of wedging or crashing the process.
export function hostSafeSchema(
  schema: unknown,
  depth = 0,
  budget?: { count: number },
): boolean {
  if (depth === 0) budget = { count: 0 };
  if (++budget!.count > 128) return false;
  if (schema === true || schema === false) return true;
  if (schema === null || typeof schema !== "object" || Array.isArray(schema))
    return false;
  if (depth === 0 && JSON.stringify(schema).length > 8192) return false;
  if (depth > 6) return false;
  const s = schema as Record<string, unknown>;
  for (const k of Object.keys(s)) if (!SAFE_SCHEMA_KEYS.has(k)) return false;
  const sub = (v: unknown): boolean =>
    v === true ||
    v === false ||
    (v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      hostSafeSchema(v, depth + 1, budget));
  if (s.properties !== undefined) {
    const p = s.properties;
    if (
      p === null ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      Object.keys(p).length > 64
    )
      return false;
    for (const v of Object.values(p)) if (!sub(v)) return false;
  }
  for (const k of ["items", "additionalProperties"] as const)
    if (
      s[k] !== undefined &&
      !(Array.isArray(s[k]) ? (s[k] as unknown[]).every(sub) : sub(s[k]))
    )
      return false;
  if (
    s.prefixItems !== undefined &&
    !(
      Array.isArray(s.prefixItems) &&
      s.prefixItems.length <= 16 &&
      s.prefixItems.every(sub)
    )
  )
    return false;
  for (const k of ["oneOf", "anyOf", "allOf"] as const)
    if (
      s[k] !== undefined &&
      !(
        Array.isArray(s[k]) &&
        s[k].length >= 1 &&
        s[k].length <= 16 &&
        (s[k] as unknown[]).every(sub)
      )
    )
      return false;
  if (s.not !== undefined && !sub(s.not)) return false;
  if (s.pattern !== undefined && !safePattern(s.pattern)) return false;
  if (s.uniqueItems !== undefined) {
    if (typeof s.uniqueItems !== "boolean") return false;
    // uniqueItems is O(n^2) pairwise at validation time; only permit it on
    // arrays already bounded by a small maxItems.
    if (
      s.uniqueItems === true &&
      !(
        Number.isInteger(s.maxItems) &&
        (s.maxItems as number) >= 0 &&
        (s.maxItems as number) <= 256
      )
    )
      return false;
  }
  if (
    s.required !== undefined &&
    !(
      Array.isArray(s.required) &&
      s.required.every(
        (t: unknown) => typeof t === "string" && t.length <= 256,
      )
    )
  )
    return false;
  if (
    s.type !== undefined &&
    !(
      typeof s.type === "string" ||
      (Array.isArray(s.type) &&
        s.type.every((t: unknown) => typeof t === "string"))
    )
  )
    return false;
  if (
    s.enum !== undefined &&
    (!Array.isArray(s.enum) || s.enum.length > 256)
  )
    return false;
  for (const k of [
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minProperties",
    "maxProperties",
  ] as const)
    if (
      s[k] !== undefined &&
      (typeof s[k] !== "number" || !Number.isFinite(s[k]))
    )
      return false;
  for (const k of ["deprecated", "readOnly", "writeOnly"] as const)
    if (s[k] !== undefined && typeof s[k] !== "boolean") return false;
  for (const k of ["description", "title", "$comment"] as const)
    if (s[k] !== undefined && typeof s[k] !== "string") return false;
  for (const k of ["const", "default", "examples"] as const)
    if (s[k] !== undefined && JSON.stringify(s[k]).length > 8192) return false;
  return true;
}

// Interpreted validation — no compile step, safe inside MV3 CSP contexts
// where `new Function` is banned.
export function validateArguments(
  tool: { inputSchema: Record<string, unknown> },
  args: unknown,
): boolean {
  if (!hostSafeSchema(tool.inputSchema)) return false;
  try {
    return new Validator(tool.inputSchema as Schema, "7", false).validate(args)
      .valid;
  } catch {
    return false;
  }
}
