import {
  AgentError,
  sse,
  validator,
  callSchema,
  type ToolCall,
  type Message,
  type ToolDescriptor,
  type Result,
  type AgentEvent,
  type FinishReason,
} from "./protocol.js";
export * from "./protocol.js";
export type AgentInput = {
  gatewayBaseUrl: string;
  gatewayToken: string;
  model: string;
  messages: Message[];
  tools: ToolDescriptor[];
  executeTool: (
    toolName: string,
    arguments_: Record<string, unknown>,
    toolCallId: string,
  ) => Promise<Result>;
  signal?: AbortSignal;
  maxSteps?: number;
  maxToolCalls?: number;
  onEvent?: (event: AgentEvent) => void;
};
const checkCall = validator.compile(callSchema);
// Serialized host results and accumulated deltas must stay inside the gateway
// message cap so history the client produces is never rejected next turn.
const MESSAGE_MAX_LENGTH = 65536;
const checkResult = validator.compile({
  type: "object",
  additionalProperties: false,
  required: ["ok", "revision", "data", "error"],
  properties: {
    ok: { type: "boolean" },
    revision: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    data: {},
    error: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["code", "message", "retryable"],
          properties: {
            code: {
              enum: [
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
              ],
            },
            message: { type: "string" },
            retryable: { type: "boolean" },
          },
        },
      ],
    },
  },
});
export function createMockAgentClient(fetcher: typeof fetch) {
  return { runAgentTurn: (input: AgentInput) => run(input, fetcher) };
}
export function runAgentTurn(
  input: AgentInput,
): Promise<{ messages: Message[]; finishReason: FinishReason }> {
  return run(input, fetch);
}
async function run(input: AgentInput, fetcher: typeof fetch) {
  const maxSteps = input.maxSteps ?? 8,
    maxCalls = input.maxToolCalls ?? 16;
  const url = new URL(input.gatewayBaseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !input.gatewayToken ||
    !input.model ||
    typeof input.executeTool !== "function" ||
    !Number.isInteger(maxSteps) ||
    maxSteps < 1 ||
    !Number.isInteger(maxCalls) ||
    maxCalls < 0
  )
    throw new Error("Invalid agent configuration");
  for (const t of input.tools)
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(t.name) ||
      t.inputSchema.type !== "object" ||
      !["read", "write", "destructive"].includes(t.effect)
    )
      throw new Error("Invalid tool configuration");
  const schemas = new Map(
    input.tools.map((t) => [t.name, validator.compile(t.inputSchema)]),
  );
  if (schemas.size !== input.tools.length) throw new Error("Duplicate tools");
  const messages: Message[] = structuredClone(input.messages);
  let finishReason: FinishReason = "error",
    calls = 0;
  // Observer errors cannot break lifecycle or cause an executed tool to be replayed.
  const emit = (event: AgentEvent) => {
    try {
      input.onEvent?.(event);
    } catch {}
  };
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) abort();
  try {
    for (let step = 0; step < maxSteps; step++) {
      controller.signal.throwIfAborted();
      const response = await fetcher(
        new URL("v1/chat/completions", url.href.replace(/\/?$/, "/")),
        {
          method: "POST",
          credentials: "omit",
          redirect: "error",
          headers: {
            authorization: `Bearer ${input.gatewayToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            messages,
            tools: input.tools.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            })),
            tool_choice: "auto",
            stream: true,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new AgentError(
          response.status === 401 || response.status === 403
            ? "AUTHENTICATION"
            : "TRANSPORT",
          `Gateway HTTP ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }
      let content = "",
        state: string | undefined,
        reason: string | undefined,
        done = false;
      const toolCalls = new Map<number, ToolCall>();
      for await (const frame of sse(response, controller.signal)) {
        if (frame === "[DONE]") {
          done = true;
          break;
        }
        let chunk: any;
        try {
          chunk = JSON.parse(frame);
        } catch {
          throw new AgentError("TRANSPORT", "Invalid SSE JSON");
        }
        if (chunk.error)
          throw new AgentError(
            chunk.error.code ?? "TRANSPORT",
            chunk.error.message ?? "Gateway stream failed",
            false,
          );
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (reason)
          throw new AgentError("TRANSPORT", "Delta after final choice");
        const d = choice.delta ?? {};
        if (d.content !== undefined && d.content !== null) {
          if (typeof d.content !== "string")
            throw new AgentError("TRANSPORT", "Invalid content delta");
          content += d.content;
          if (content.length > MESSAGE_MAX_LENGTH)
            throw new AgentError("OUTPUT_LIMIT", "Response exceeds message cap");
          emit({ type: "text_delta", payload: { text: d.content } });
        }
        for (const c of d.tool_calls ?? []) {
          if (!Number.isInteger(c.index) || c.index < 0 || c.index >= 16)
            throw new AgentError("TRANSPORT", "Invalid tool index");
          const current = toolCalls.get(c.index) ?? {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
          if (c.id) {
            if (current.id && current.id !== c.id)
              throw new AgentError("TRANSPORT", "Tool id changed");
            current.id = c.id;
          }
          if (c.type && c.type !== "function")
            throw new AgentError("UNSUPPORTED", "Unsupported tool type");
          if (c.function?.name) current.function.name += c.function.name;
          if (c.function?.arguments)
            current.function.arguments += c.function.arguments;
          toolCalls.set(c.index, current);
        }
        if (d.x_gateway_state !== undefined) {
          if (typeof d.x_gateway_state !== "string" || state)
            throw new AgentError("TRANSPORT", "Invalid continuation state");
          state = d.x_gateway_state;
        }
        if (choice.finish_reason) reason = choice.finish_reason;
      }
      if (!done || !reason)
        throw new AgentError("TRANSPORT", "Truncated model turn");
      if (reason !== "stop" && reason !== "tool_calls")
        throw new AgentError("OUTPUT_TRUNCATED", "Model turn did not complete");
      const ordered = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
      const completeCalls = ordered.map(([, c]) => c);
      if ((reason === "tool_calls") !== Boolean(completeCalls.length))
        throw new AgentError("TRANSPORT", "Inconsistent finish reason");
      const args = completeCalls.map((c, i) => {
        if (ordered[i][0] !== i || !checkCall(c))
          throw new AgentError("INVALID_ARGUMENT", "Malformed tool call");
        let a;
        try {
          a = JSON.parse(c.function.arguments);
        } catch {
          throw new AgentError(
            "INVALID_ARGUMENT",
            "Invalid completed arguments JSON",
          );
        }
        const schema = schemas.get(c.function.name);
        if (!schema || !schema(a))
          throw new AgentError(
            "INVALID_ARGUMENT",
            "Unknown tool or invalid arguments",
          );
        return a as Record<string, unknown>;
      });
      if (
        new Set(completeCalls.map((c) => c.id)).size !== completeCalls.length ||
        completeCalls.some((c) =>
          messages.some((m) => m.tool_calls?.some((old) => old.id === c.id)),
        )
      )
        throw new AgentError("INVALID_ARGUMENT", "Duplicate tool call id");
      if (calls + completeCalls.length > maxCalls) {
        finishReason = "tool_limit";
        break;
      }
      messages.push({
        role: "assistant",
        content: content || (completeCalls.length ? null : ""),
        ...(completeCalls.length ? { tool_calls: completeCalls } : {}),
        ...(state ? { x_gateway_state: state } : {}),
      });
      if (!completeCalls.length) {
        finishReason = "completed";
        break;
      }
      // Cancellation leaves no unresolved calls: every undispatched call gets a
      // CANCELLED result so the returned history stays valid for the next turn.
      const cancelledResult = (): Result => ({
        ok: false,
        revision: null,
        data: null,
        error: {
          code: "CANCELLED",
          message: "Run cancelled",
          retryable: false,
        },
      });
      const fillUndispatched = (from: number) => {
        for (let j = from; j < completeCalls.length; j++) {
          const cj = completeCalls[j];
          const cancelled = cancelledResult();
          messages.push({
            role: "tool",
            tool_call_id: cj.id,
            content: JSON.stringify(cancelled),
          });
          emit({
            type: "tool_completed",
            payload: {
              toolCallId: cj.id,
              toolName: cj.function.name,
              result: cancelled,
            },
          });
        }
      };
      for (let i = 0; i < completeCalls.length; i++) {
        if (controller.signal.aborted) {
          fillUndispatched(i);
          controller.signal.throwIfAborted();
        }
        const c = completeCalls[i];
        emit({
          type: "tool_requested",
          payload: {
            toolCallId: c.id,
            toolName: c.function.name,
            arguments: args[i],
          },
        });
        if (controller.signal.aborted) {
          fillUndispatched(i);
          controller.signal.throwIfAborted();
        }
        let result: Result;
        try {
          result = await abortable(
            input.executeTool(c.function.name, args[i], c.id),
            controller.signal,
          );
          if (
            !isJson(result) ||
            !checkResult(result) ||
            result.ok !== (result.error === null)
          )
            throw new Error("Invalid host result");
        } catch {
          result = {
            ok: false,
            revision: null,
            data: null,
            error: {
              code: controller.signal.aborted ? "CANCELLED" : "INTERNAL",
              message: controller.signal.aborted
                ? "Run cancelled"
                : "Host tool execution failed",
              retryable: false,
            },
          };
        }
        calls++;
        let serialized = JSON.stringify(result);
        if (serialized.length > MESSAGE_MAX_LENGTH) {
          result = {
            ok: false,
            revision: null,
            data: null,
            error: {
              code: "INTERNAL",
              message: "Host result exceeds size limit",
              retryable: false,
            },
          };
          serialized = JSON.stringify(result);
        }
        messages.push({
          role: "tool",
          tool_call_id: c.id,
          content: serialized,
        });
        emit({
          type: "tool_completed",
          payload: { toolCallId: c.id, toolName: c.function.name, result },
        });
        if (controller.signal.aborted) {
          fillUndispatched(i + 1);
          controller.signal.throwIfAborted();
        }
      }
      finishReason = "step_limit";
    }
  } catch (e) {
    const cancelled = controller.signal.aborted;
    finishReason = cancelled ? "cancelled" : "error";
    const error =
      e instanceof AgentError
        ? e
        : new AgentError("TRANSPORT", "Agent transport failed", false);
    emit({
      type: "error",
      payload: {
        code: cancelled ? "CANCELLED" : error.code,
        message: cancelled ? "Run cancelled" : error.message,
        retryable: cancelled ? false : error.retryable,
      },
    });
  } finally {
    input.signal?.removeEventListener("abort", abort);
    controller.abort();
    emit({ type: "completed", payload: { finishReason } });
  }
  return { messages, finishReason };
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", abort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", abort);
        reject(e);
      },
    );
    if (signal.aborted) abort();
  });
}

function isJson(value: unknown, stack = new Set<object>(), depth = 0): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 64 || stack.has(value)) return false;
  stack.add(value);
  const valid =
    Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value) ? value : Object.values(value)).every((v) =>
      isJson(v, stack, depth + 1),
    );
  stack.delete(value);
  return valid;
}
