import { z } from "zod";
import { Validator, type Schema } from "@cfworker/json-schema";
import {
  Bounds,
  Codes as ContractCodes,
  canonical,
  failure,
  hostSafeSchema,
  safePattern,
  success,
} from "@orchard/bridge-contract";
export { canonical, failure, hostSafeSchema, safePattern, success };
export const MAX_BYTES = Bounds.message;
export const Codes = z.enum(ContractCodes as unknown as [
  string,
  ...string[],
]);
const id = z.string().min(1).max(Bounds.id);
const rev = z.number().int().nonnegative();
export const ToolSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    description: z.string().max(Bounds.description),
    inputSchema: z.record(z.unknown()).refine((s) => s.type === "object"),
    effect: z.enum(["read", "write", "destructive"]),
    outputSchema: z.record(z.unknown()).optional(),
  })
  .strict();
export const DescriptionSchema = z
  .object({
    protocolVersion: z.literal("0.1"),
    appId: id,
    tools: z.array(ToolSchema).max(Bounds.tools),
  })
  .strict()
  .refine((d) => new Set(d.tools.map((t) => t.name)).size === d.tools.length);
export const ContextSchema = z
  .object({
    appId: id,
    documentId: id,
    revision: rev,
    selectionIds: z.array(id).max(Bounds.selectionIds),
    summary: z.string().max(Bounds.summary),
    // Opaque per-login-session marker issued by the app's backend. Hosts pin
    // it into consent/pairing and fail closed when it changes or disappears;
    // it never carries credentials and never replaces server authorization.
    sessionEpoch: z.string().max(Bounds.sessionEpoch).nullable().optional(),
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
        message: z.string().max(Bounds.errorMessage),
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
    title: z.string().max(Bounds.title),
  })
  .strict();
export type Tool = z.infer<typeof ToolSchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Description = z.infer<typeof DescriptionSchema>;
export type Call = z.infer<typeof CallSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type Code = z.infer<typeof Codes>;
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
// MV3 extension CSP forbids string code generation, so page-supplied schemas
// are interpreted per call rather than compiled (Ajv compile emits `new
// Function`). The bounded schema dialect itself lives in
// @orchard/bridge-contract (hostSafeSchema/safePattern above).
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
