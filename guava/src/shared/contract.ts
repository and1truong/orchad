export type { Code as ErrorCode } from "@orchard/bridge-contract";
import type { Code } from "@orchard/bridge-contract";
export interface Result {
  ok: boolean;
  revision: number | null;
  data: any | null;
  error: { code: Code; message: string; retryable: boolean } | null;
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
  // Opaque per-login-session marker issued by the app's backend. Hosts pin
  // it at consent/bind and fail closed when it changes or disappears; it
  // never carries credentials and never replaces server-side authorization.
  sessionEpoch?: string;
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
  sessionEpoch?: string | null;
  title: string;
}
// Single implementation of canonical()/success()/failure() lives in
// @orchard/bridge-contract — this file only holds Guava-side types.
export {
  canonical,
  failure,
  success,
} from "@orchard/bridge-contract";
export const appId = "orchard-guava";
declare global {
  interface Window {
    agentBridgeV1?: Bridge;
  }
}
