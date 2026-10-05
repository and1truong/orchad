import { z } from "zod";
import { Validator, type Schema } from "@cfworker/json-schema";
export const MAX_BYTES = 64 * 1024;
export const Codes = z.enum([
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
]);
const id = z.string().min(1).max(256);
const rev = z.number().int().nonnegative();
export const ToolSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    description: z.string().max(2048),
    inputSchema: z.record(z.unknown()).refine((s) => s.type === "object"),
    effect: z.enum(["read", "write", "destructive"]),
    outputSchema: z.record(z.unknown()).optional(),
  })
  .strict();
export const DescriptionSchema = z
  .object({
    protocolVersion: z.literal("0.1"),
    appId: id,
    tools: z.array(ToolSchema).max(64),
  })
  .strict()
  .refine((d) => new Set(d.tools.map((t) => t.name)).size === d.tools.length);
export const ContextSchema = z
  .object({
    appId: id,
    documentId: id,
    revision: rev,
    selectionIds: z.array(id).max(256),
    summary: z.string().max(8192),
    // Opaque per-login-session marker issued by the app's backend. Hosts pin
    // it into consent/pairing and fail closed when it changes or disappears;
    // it never carries credentials and never replaces server authorization.
    sessionEpoch: z.string().max(256).nullable().optional(),
  })
  .strict();
export const CallSchema = z
  .object({
    requestId: id,
    documentId: id,
    toolName: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    arguments: z.record(z.unknown()),
    expectedRevision: rev.nullable(),
    idempotencyKey: id.nullable(),
  })
  .strict();
export const ResultSchema = z
  .object({
    ok: z.boolean(),
    revision: rev.nullable(),
    data: z
      .unknown()
      .refine((v) => v !== undefined)
      .nullable(),
    error: z
      .object({
        code: Codes,
        message: z.string().max(8192),
        retryable: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((r) => (r.ok ? r.error === null : r.error !== null));
export const TargetSchema = z
  .object({
    targetId: id,
    pageInstanceId: id,
    origin: z.string().url(),
    appId: id,
    documentId: id,
    title: z.string().max(1024),
  })
  .strict();
export type Tool = z.infer<typeof ToolSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Description = z.infer<typeof DescriptionSchema>;
export type Call = z.infer<typeof CallSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type Code = z.infer<typeof Codes>;
export const failure = (
  code: Code,
  message: string,
  retryable = false,
): Result => ({
  ok: false,
  revision: null,
  data: null,
  // Clamp: an unbounded message (e.g. a large Zod error) would produce a
  // Result that itself fails ResultSchema's 8192-char cap at the next
  // bounded() boundary.
  error: { code, message: message.slice(0, 8000), retryable },
});
export const success = (
  data: unknown,
  revision: number | null = null,
): Result => ResultSchema.parse({ ok: true, revision, data, error: null });
export function bounded<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): z.output<S> {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Non-JSON payload");
  const bytes = new TextEncoder().encode(encoded).length;
  if (bytes > MAX_BYTES) throw new Error("Payload exceeds 64 KiB");
  return schema.parse(JSON.parse(encoded));
}
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
// MV3 extension CSP forbids string code generation, so page-supplied schemas
// are interpreted per call rather than compiled (Ajv compile emits `new Function`).
// Bounded page-declared schema dialect — the same subset coconut's host
// validator accepts. Combinators are allowed with a fan-out cap; '$id',
// '$schema', '$ref'/'$defs' and 'format' stay excluded (process-wide $id
// registration, unsupported drafts, divergent annotation semantics), as do
// patternProperties/propertyNames/dependentSchemas/contains/if-then-else and
// unevaluated* to keep the dialect a small closed set.
const SAFE_SCHEMA_KEYS = new Set([
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
// Page-declared patterns execute inside the trusted extension on every
// argument check: length is capped and backreferences or a quantified group
// containing an unbounded repeat ((a+)+, (a*)*, (\d{2,}){3}) are refused.
// The heuristic intentionally fails closed on odd shapes rather than proving
// linearity.
function safePattern(p: unknown): boolean {
  if (typeof p !== "string" || !p.length || p.length > 256) return false;
  if (/\\[1-9]|\\k</.test(p)) return false;
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
    if (inner && unbounded(p.slice(j))) return false;
  }
  try {
    new RegExp(p);
  } catch {
    return false;
  }
  return true;
}
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
    if (s[k] !== undefined && !(Array.isArray(s[k]) ? (s[k] as unknown[]).every(sub) : sub(s[k])))
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
      !(Array.isArray(s[k]) && s[k].length >= 1 && s[k].length <= 16 && (s[k] as unknown[]).every(sub))
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
  return true;
}
>>>>>>> 65230d6 (lime+guava: pin opaque sessionEpoch into consent and context)
export function validateArguments(tool: Tool, args: unknown): boolean {
  if (!hostSafeSchema(tool.inputSchema)) return false;
  try {
    return new Validator(tool.inputSchema as Schema, "7", false).validate(args)
      .valid;
  } catch {
    return false;
  }
}
export const BindingSchema = z
  .object({ targetId: id, pageInstanceId: id })
  .strict();
export const HostCallSchema = z
  .object({ targetId: id, pageInstanceId: id, call: CallSchema })
  .strict();
export function gatewayUrl(value: string): string {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !(
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
    )
  )
    throw new Error(
      "Gateway must use HTTPS or loopback HTTP, without credentials/query/fragment",
    );
  return u.href.replace(/\/$/, "");
}
