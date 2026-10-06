import {
  canonical,
  failure,
  success,
  type Code,
  type Result,
} from "@orchard/bridge-contract";

export const appId = "pear";

export type { Code, Result };
export type ErrorEnvelope = {
  code: Code;
  message: string;
  retryable: boolean;
};
export type Invoke = {
  requestId: string;
  documentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  expectedRevision: number | null;
  idempotencyKey: string | null;
};
export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export type Context = {
  appId: string;
  documentId: string;
  revision: number;
  selectionIds: string[];
  summary: string;
  sessionEpoch?: string;
};
export type Bridge = {
  describe(): { protocolVersion: "0.1"; appId: string; tools: ToolDescriptor[] };
  getContext(): Promise<Context>;
  invoke(call: Invoke): Promise<Result>;
};

export { canonical, failure, success };

declare global {
  interface Window {
    agentBridgeV1?: Bridge;
  }
}
