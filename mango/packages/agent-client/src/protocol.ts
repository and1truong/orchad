import { Validator, type Schema } from "@cfworker/json-schema";
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: "read" | "write" | "destructive";
  outputSchema?: Record<string, unknown>;
};
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  x_gateway_state?: string;
};
export type BridgeErrorCode =
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
export type Result = {
  ok: boolean;
  revision: number | null;
  data: Json;
  error: { code: BridgeErrorCode; message: string; retryable: boolean } | null;
};
export type ChatRequest = {
  model: string;
  messages: Message[];
  tools?: {
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }[];
  tool_choice?: "auto" | "none";
  n?: 1;
  stream?: boolean;
  max_completion_tokens?: number;
};
export type FinishReason =
  | "completed"
  | "cancelled"
  | "step_limit"
  | "tool_limit"
  | "error";
export type AgentEvent =
  | { type: "text_delta"; payload: { text: string } }
  | {
      type: "tool_requested";
      payload: {
        toolCallId: string;
        toolName: string;
        arguments: Record<string, unknown>;
      };
    }
  | {
      type: "tool_completed";
      payload: { toolCallId: string; toolName: string; result: Result };
    }
  | {
      type: "error";
      payload: { code: string; message: string; retryable: boolean };
    }
  | { type: "completed"; payload: { finishReason: FinishReason } };
// No remote schema loading, coercion, defaults or mutation. $ref must resolve locally.
export const validator = {
  compile(schema: Record<string, unknown>) {
    const interpreter = new Validator(schema as Schema, "7", true);
    return (data: unknown) => interpreter.validate(data).valid;
  },
};
const name = { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" };
export const callSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "type", "function"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 128 },
    type: { const: "function" },
    function: {
      type: "object",
      additionalProperties: false,
      required: ["name", "arguments"],
      properties: { name, arguments: { type: "string", maxLength: 65536 } },
    },
  },
};
export const requestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["model", "messages"],
  properties: {
    model: { type: "string", minLength: 1, maxLength: 128 },
    n: { const: 1 },
    stream: { type: "boolean" },
    tool_choice: { enum: ["auto", "none"] },
    max_completion_tokens: { type: "integer", minimum: 1, maximum: 8192 },
    messages: {
      type: "array",
      minItems: 1,
      maxItems: 128,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "content"],
        properties: {
          role: { enum: ["system", "user", "assistant", "tool"] },
          content: {
            anyOf: [{ type: "string", maxLength: 65536 }, { type: "null" }],
          },
          tool_calls: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: callSchema,
          },
          tool_call_id: { type: "string", minLength: 1, maxLength: 128 },
          x_gateway_state: { type: "string", minLength: 1, maxLength: 196608 },
        },
      },
    },
    tools: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "function"],
        properties: {
          type: { const: "function" },
          function: {
            type: "object",
            additionalProperties: false,
            required: ["name", "parameters"],
            properties: {
              name,
              description: { type: "string", maxLength: 4096 },
              parameters: {
                type: "object",
                required: ["type"],
                properties: { type: { const: "object" } },
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
  },
};
export const validateRequest = validator.compile(requestSchema);
export function validateHistory(messages: Message[]) {
  const seen = new Set<string>();
  let pending = new Set<string>();
  for (const m of messages) {
    if (m.role === "tool") {
      if (
        !m.tool_call_id ||
        !pending.delete(m.tool_call_id) ||
        typeof m.content !== "string" ||
        m.tool_calls ||
        m.x_gateway_state
      )
        throw new Error("Invalid tool result ordering");
    } else {
      if (pending.size) throw new Error("Missing tool results");
      if (
        m.tool_call_id ||
        (m.role !== "assistant" && (m.tool_calls || m.x_gateway_state)) ||
        (m.content === null && !m.tool_calls)
      )
        throw new Error("Invalid message fields");
      for (const c of m.tool_calls ?? []) {
        if (seen.has(c.id)) throw new Error("Duplicate tool call id");
        seen.add(c.id);
        pending.add(c.id);
        try {
          const a = JSON.parse(c.function.arguments);
          if (!a || Array.isArray(a) || typeof a !== "object") throw 0;
        } catch {
          throw new Error("Invalid completed tool arguments");
        }
      }
    }
  }
  if (pending.size) throw new Error("History ends with unresolved tools");
}
export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
// Streaming decoder shared by gateway provider adapters and the portable client.
export async function* sse(
  response: Response,
  signal?: AbortSignal,
  maxBytes = 2_000_000,
): AsyncGenerator<string> {
  if (!response.body) throw new AgentError("TRANSPORT", "Missing stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    bytes = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const r = await reader.read();
      if (r.done) break;
      bytes += r.value.byteLength;
      if (bytes > maxBytes)
        throw new AgentError("OUTPUT_LIMIT", "Response too large");
      buffer += decoder.decode(r.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (data) yield data;
      }
    }
    signal?.throwIfAborted();
    if (buffer.trim())
      throw new AgentError("TRANSPORT", "Incomplete SSE frame");
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
