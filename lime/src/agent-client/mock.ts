import type { Result, Tool } from "../shared/contract.js";
export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  x_gateway_state?: string;
};
export type FinishReason =
  "completed" | "cancelled" | "step_limit" | "tool_limit" | "error";
export interface AgentInput {
  gatewayBaseUrl: string;
  gatewayToken: string;
  model: string;
  messages: Message[];
  tools: Tool[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
    id: string,
  ) => Promise<Result>;
  signal: AbortSignal;
  maxSteps?: number;
  maxToolCalls?: number;
  onEvent: (e: { type: string; payload: Record<string, unknown> }) => void;
}
// Development contract double, not a production inference loop. Deterministic /tool JSON command only.
export async function runAgentTurn(
  input: AgentInput,
): Promise<{ messages: Message[]; finishReason: FinishReason }> {
  const messages = structuredClone(input.messages);
  let finishReason: FinishReason = "completed";
  try {
    if (input.signal.aborted) {
      finishReason = "cancelled";
      return { messages, finishReason };
    }
    if ((input.maxSteps ?? 8) < 1) {
      finishReason = "step_limit";
      return { messages, finishReason };
    }
    const text = messages.at(-1)?.content || "";
    if (text.startsWith("/tool ")) {
      if ((input.maxToolCalls ?? 16) < 1) {
        finishReason = "tool_limit";
        return { messages, finishReason };
      }
      const match = /^\/tool ([A-Za-z0-9_-]+) (.+)$/s.exec(text);
      if (!match) throw new Error("Use /tool NAME {JSON arguments}");
      const args = JSON.parse(match[2]);
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("Arguments must be object");
      const id = crypto.randomUUID(),
        name = match[1];
      input.onEvent({
        type: "tool_requested",
        payload: { toolCallId: id, toolName: name, arguments: args },
      });
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      const result = await input.executeTool(name, args, id);
      messages.push({
        role: "tool",
        tool_call_id: id,
        content: JSON.stringify(result),
      });
      input.onEvent({
        type: "tool_completed",
        payload: { toolCallId: id, toolName: name, result },
      });
      if (input.signal.aborted) finishReason = "cancelled";
    } else {
      const reply =
        'Mock agent ready. Use /tool demo_increment {"amount":1}. No provider API is called.';
      messages.push({ role: "assistant", content: reply });
      input.onEvent({ type: "text_delta", payload: { text: reply } });
    }
  } catch (e) {
    finishReason = input.signal.aborted ? "cancelled" : "error";
    input.onEvent({
      type: "error",
      payload: {
        code: "INVALID_ARGUMENT",
        message: e instanceof Error ? e.message : "Mock error",
        retryable: false,
      },
    });
  } finally {
    input.onEvent({ type: "completed", payload: { finishReason } });
  }
  return { messages, finishReason };
}
