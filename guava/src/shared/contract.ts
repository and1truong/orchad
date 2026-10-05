export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_CONTEXT"
  | "IDEMPOTENCY_CONFLICT"
  | "APPROVAL_DENIED"
  | "CANCELLED"
  | "TIMEOUT"
  | "TARGET_CLOSED"
  | "UNSUPPORTED"
  | "INTERNAL";
export interface Result {
  ok: boolean;
  revision: number | null;
  data: any | null;
  error: { code: ErrorCode; message: string; retryable: boolean } | null;
}
export interface Invoke {
  requestId: string;
  documentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  expectedRevision: number | null;
  idempotencyKey: string | null;
}
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: "read" | "write" | "destructive";
  outputSchema?: Record<string, unknown>;
}
export interface Context {
  appId: string;
  documentId: string;
  revision: number;
  selectionIds: string[];
  summary: string;
}
export interface Bridge {
  describe(): Promise<{
    protocolVersion: "0.1";
    appId: string;
    tools: ToolDescriptor[];
  }>;
  getContext(): Promise<Context>;
  invoke(call: Invoke): Promise<Result>;
}
export interface TargetDescriptor {
  targetId: string;
  pageInstanceId: string;
  origin: string;
  appId: string;
  documentId: string;
  title: string;
}
export const success = (revision: number | null, data: any): Result => ({
  ok: true,
  revision,
  data,
  error: null,
});
export const failure = (
  code: ErrorCode,
  message: string,
  revision: number | null = null,
  retryable = false,
): Result => ({
  ok: false,
  revision,
  data: null,
  error: { code, message, retryable },
});
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical((value as any)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const appId = "orchard-guava";
declare global {
  interface Window {
    agentBridgeV1?: Bridge;
  }
}
