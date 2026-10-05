import type {
  ChatRequest,
  Message,
  ToolCall,
} from "../../packages/agent-client/src/protocol.js";
export type Usage = { input: number | null; output: number | null };
export type ProviderRequest = ChatRequest & {
  upstreamModel: string;
  continuations: Map<number, unknown>;
};
export type ProviderEvent =
  | {
      type: "delta";
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    }
  | {
      type: "final";
      finishReason: "stop" | "tool_calls" | "length" | "content_filter";
      usage: Usage;
      continuation?: unknown;
    };
export interface ProviderAdapter {
  readonly name: string;
  generate(
    request: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
}
export class UpstreamError extends Error {
  constructor(
    public status: number,
    public retryable = false,
  ) {
    super("Upstream request failed");
  }
}
export type ModelConfig = {
  id: string;
  provider: string;
  upstreamModel: string;
  capabilities: { text: boolean; streaming: boolean; functionTools: boolean };
  maxOutputTokens: number;
  compatibility: string[];
};
export type ScriptTurn = {
  content?: string;
  toolCalls?: ToolCall[];
  finishReason?: "stop" | "tool_calls" | "length";
  usage?: Usage;
  continuation?: unknown;
  delayMs?: number;
  errorStatus?: number;
  truncate?: boolean;
};
export function publicMessage(message: Message) {
  const { x_gateway_state, ...rest } = message;
  return rest;
}
export async function sleep(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
