import { hostSafeSchema } from "@orchard/bridge-contract";
import {
  Type,
  type AssistantMessage,
  type JsonObject,
  type Message as PiMessage,
  type Model,
} from "@earendil-works/pi-ai";
import {
  runAgentLoop,
  type AgentEvent as PiAgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import {
  validator,
  type ToolCall,
  type Message,
  type ToolDescriptor,
  type Result,
  type AgentEvent,
  type FinishReason,
} from "./protocol.js";
import {
  errorAssistantStream,
  makeAssistantMessage,
  streamMangoCompletion,
} from "./mango-stream.js";
export * from "./protocol.js";
export * from "./mango-stream.js";
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
  // Bounds the whole turn (all steps + tool dispatches) so a wedged gateway
  // stream or stalled host still terminates deterministically.
  maxTurnMs?: number;
  onEvent?: (event: AgentEvent) => void;
};
// Serialized host results and accumulated deltas must stay inside the gateway
// message cap so history the client produces is never rejected next turn.
const MESSAGE_MAX_LENGTH = 65536;
// Generous enough for host approval round-trips inside executeTool, still
// finite so a stream that never completes cannot hang the run forever.
const DEFAULT_MAX_TURN_MS = 300_000;
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
    maxCalls = input.maxToolCalls ?? 16,
    maxTurnMs = input.maxTurnMs ?? DEFAULT_MAX_TURN_MS;
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
    maxCalls < 0 ||
    !Number.isFinite(maxTurnMs) ||
    maxTurnMs <= 0
  )
    throw new Error("Invalid agent configuration");
  for (const t of input.tools)
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(t.name) ||
      t.inputSchema.type !== "object" ||
      !["read", "write", "destructive"].includes(t.effect) ||
      // Caller-supplied tool schemas are untrusted: they must sit inside the
      // bounded dialect the hosts gate on, or the client silently validates
      // with different semantics than the host executing them.
      !hostSafeSchema(t.inputSchema)
    )
      throw new Error("Invalid tool configuration");
  const schemas = new Map(
    input.tools.map((t) => [t.name, validator.compile(t.inputSchema)]),
  );
  if (schemas.size !== input.tools.length) throw new Error("Duplicate tools");
  // The Orchard wire transcript. Pi keeps its own context.messages (with
  // synthetic system/assistent bookkeeping entries); this array is the only
  // source for request bodies and the only history returned to callers.
  const messages: Message[] = structuredClone(input.messages);
  let finishReason: FinishReason = "error";
  // Observer errors cannot break lifecycle or cause an executed tool to be replayed.
  const emit = (event: AgentEvent) => {
    try {
      input.onEvent?.(event);
    } catch {}
  };
  const controller = new AbortController();
  // One turn signal: the caller's abort plus a built-in deadline. The reason
  // propagates so a deadline abort stays distinguishable from a user cancel.
  // The AbortSignal *global* is not bound inside sandboxed bundles (MV3 CSP
  // contexts only inject AbortController), so reach its constructor through
  // the signal instance instead.
  const Signal = controller.signal.constructor as unknown as {
    timeout(ms: number): AbortSignal;
    any(signals: AbortSignal[]): AbortSignal;
  };
  const turnSignal = Signal.any(
    [input.signal, Signal.timeout(maxTurnMs)].filter(
      (s): s is AbortSignal => !!s,
    ),
  );
  const abort = () => controller.abort(turnSignal.reason);
  turnSignal.addEventListener("abort", abort, { once: true });
  if (turnSignal.aborted) abort();

  // Adapter state shared between the Mango streamFn and the Pi event mapper.
  // `marker` carries a Mango-side failure out of the assistant stream so the
  // wrapper can emit the Orchard error event and finishReason after the run.
  let marker:
    | {
        code: string;
        message: string;
        retryable: boolean;
        finish: "error" | "tool_limit" | "step_limit";
      }
    | undefined;
  let steps = 0,
    dispatched = 0;
  // Raw wire fields for each streamed assistant message, queued until the
  // matching Pi message_end(assistant) lands. Keeps the raw arguments string
  // and x_gateway_state outside Pi objects so nothing normalizes them away.
  const pendingAssistant: { state?: string; calls: ToolCall[] }[] = [];
  // Call ids emitted to Pi but not yet finalized, in assistant order, and the
  // Orchard Result each finalized call produced. Calls left over at agent_end
  // (abort mid-batch) get synthesized CANCELLED entries so the returned
  // history stays valid for the next turn.
  const pendingCalls = new Map<string, string>();
  const resultByCallId = new Map<string, Result>();
  const cancelledResult = (): Result => ({
    ok: false,
    revision: null,
    data: null,
    error: { code: "CANCELLED", message: "Run cancelled", retryable: false },
  });
  const internalResult = (message: string): Result => ({
    ok: false,
    revision: null,
    data: null,
    error: { code: "INTERNAL", message, retryable: false },
  });
  const zeroUsage = () => ({
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  });
  const assistantMessage = (
    content: AssistantMessage["content"],
    stopReason: AssistantMessage["stopReason"],
    errorMessage?: string,
  ): AssistantMessage => ({
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "mango",
    model: input.model,
    usage: zeroUsage(),
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    timestamp: Date.now(),
  });

  // Mango adapter: streams one Chat Completions inference and replays it as Pi
  // assistant events. The transport itself lives in streamMangoCompletion so
  // the durable runner uses the same strict seam; this wrapper keeps the
  // per-turn bookkeeping (step count, pending assistant/call bookkeeping and
  // the error marker for finishReason).
  const streamFn: StreamFn = (_model, _context, options) => {
    const signal = options?.signal ?? controller.signal;
    steps++;
    if (steps > maxSteps) {
      // Unreachable while finishTurn enforces the bound; kept so a run can
      // never spin up an extra request past it.
      marker = {
        code: "INTERNAL",
        message: `Turn exceeded ${maxSteps} steps`,
        retryable: false,
        finish: "step_limit",
      };
      return errorAssistantStream(input.model, "error", marker.message);
    }
    if (signal.aborted)
      return errorAssistantStream(input.model, "aborted", "Run cancelled");
    const priorCallIds = new Set<string>();
    for (const m of messages)
      for (const c of m.tool_calls ?? []) priorCallIds.add(c.id);
    return streamMangoCompletion({
      fetcher,
      gatewayBaseUrl: input.gatewayBaseUrl,
      gatewayToken: input.gatewayToken,
      model: input.model,
      messages,
      tools: input.tools,
      signal,
      priorCallIds,
      maxCalls: Math.max(0, maxCalls - dispatched),
      onAssistant: (a) => {
        pendingAssistant.push(a);
        for (const c of a.calls) pendingCalls.set(c.id, c.function.name);
      },
      onError: (e) => {
        marker = {
          code: e.code,
          message: e.message,
          retryable: e.retryable,
          finish: e.finish ?? "error",
        };
      },
    });
  };

  // Orchard history → Pi transcript. Raw arguments strings parse once here;
  // the raw string itself stays on the wire message. Tool results carry the
  // Result JSON text verbatim.
  const callNames = new Map<string, string>();
  const piMessages: AgentMessage[] = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "user") {
      piMessages.push({
        role: m.role,
        content: m.content ?? "",
        timestamp: 0,
      });
    } else if (m.role === "tool") {
      piMessages.push({
        role: "toolResult",
        toolCallId: m.tool_call_id ?? "",
        toolName: callNames.get(m.tool_call_id ?? "") ?? "tool",
        content: [{ type: "text", text: m.content ?? "" }],
        isError: false,
        timestamp: 0,
      });
    } else {
      const content: AssistantMessage["content"] = [];
      if (typeof m.content === "string" && m.content)
        content.push({ type: "text", text: m.content });
      for (const c of m.tool_calls ?? []) {
        callNames.set(c.id, c.function.name);
        let a: JsonObject = {};
        try {
          const parsed = JSON.parse(c.function.arguments);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            a = parsed as JsonObject;
        } catch {}
        content.push({
          type: "toolCall",
          id: c.id,
          name: c.function.name,
          arguments: a,
        });
      }
      piMessages.push(
        assistantMessage(content, m.tool_calls?.length ? "toolUse" : "stop"),
      );
    }
  }

  const model: Model<"openai-completions"> = {
    id: input.model,
    name: input.model,
    api: "openai-completions",
    provider: "mango",
    baseUrl: url.href,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    contextWindow: 0,
    maxTokens: 0,
  };
  // Pi never validates tool arguments: the empty schema makes its
  // validateToolArguments a no-op clone, and the strict Orchard batch gate in
  // streamFn stays the only barrier between raw model output and dispatch.
  const tools: AgentTool[] = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    label: t.name,
    parameters: Type.Object({}),
    execute: async (toolCallId, params, signal) => {
      const sig = signal ?? controller.signal;
      let result: Result;
      try {
        result = await abortable(
          input.executeTool(
            t.name,
            params as Record<string, unknown>,
            toolCallId,
          ),
          sig,
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
            code: sig.aborted ? "CANCELLED" : "INTERNAL",
            message: sig.aborted
              ? "Run cancelled"
              : "Host tool execution failed",
            retryable: false,
          },
        };
      }
      dispatched++;
      let serialized = JSON.stringify(result);
      if (serialized.length > MESSAGE_MAX_LENGTH) {
        result = internalResult("Host result exceeds size limit");
        serialized = JSON.stringify(result);
      }
      resultByCallId.set(toolCallId, result);
      return {
        content: [{ type: "text", text: serialized }],
        details: {},
        isError: !result.ok,
      };
    },
  }));

  const emitPi = (event: PiAgentEvent) => {
    if (event.type === "message_update") {
      const sub = event.assistantMessageEvent;
      if (sub.type === "text_delta")
        emit({ type: "text_delta", payload: { text: sub.delta } });
      return;
    }
    if (event.type === "message_end") {
      const m = event.message;
      // Synthetic Pi messages (system tool declarations) and failed/aborted
      // assistant turns never enter the Orchard wire transcript.
      if (
        m.role === "assistant" &&
        (m.stopReason === "stop" || m.stopReason === "toolUse")
      ) {
        const produced = pendingAssistant.shift() ?? { calls: [] };
        const text = m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
        messages.push({
          role: "assistant",
          content: text || (produced.calls.length ? null : ""),
          ...(produced.calls.length ? { tool_calls: produced.calls } : {}),
          ...(produced.state ? { x_gateway_state: produced.state } : {}),
        });
      } else if (m.role === "toolResult") {
        const result =
          resultByCallId.get(m.toolCallId) ??
          (controller.signal.aborted
            ? cancelledResult()
            : internalResult("Tool call failed"));
        resultByCallId.set(m.toolCallId, result);
        messages.push({
          role: "tool",
          tool_call_id: m.toolCallId,
          content: JSON.stringify(result),
        });
      }
      return;
    }
    if (event.type === "tool_execution_start") {
      emit({
        type: "tool_requested",
        payload: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          arguments: event.args as Record<string, unknown>,
        },
      });
      return;
    }
    if (event.type === "tool_execution_end") {
      pendingCalls.delete(event.toolCallId);
      const result =
        resultByCallId.get(event.toolCallId) ??
        (controller.signal.aborted
          ? cancelledResult()
          : internalResult("Tool call failed"));
      resultByCallId.set(event.toolCallId, result);
      emit({
        type: "tool_completed",
        payload: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result,
        },
      });
      return;
    }
  };

  const config: AgentLoopConfig = {
    model,
    convertToLlm: (ms: AgentMessage[]) => ms as PiMessage[],
    toolExecution: "sequential",
    finishTurn: (turn: {
      message: AssistantMessage;
    }): { action: "end" } | undefined => {
      if (turn.message.stopReason === "toolUse" && steps >= maxSteps) {
        marker = {
          code: "INTERNAL",
          message: `Turn exceeded ${maxSteps} steps`,
          retryable: false,
          finish: "step_limit",
        };
        return { action: "end" };
      }
      return undefined;
    },
  };
  try {
    await runAgentLoop(
      [],
      { messages: piMessages, tools },
      config,
      emitPi,
      controller.signal,
      streamFn,
    );
  } catch {
    if (!marker)
      marker = {
        code: "TRANSPORT",
        message: "Agent transport failed",
        retryable: false,
        finish: "error",
      };
  }
  // Undispatched calls (abort mid-batch stops Pi's sequential dispatch without
  // terminal results) still resolve as CANCELLED so callers and the gateway
  // never see dangling tool_calls.
  for (const [id, name] of pendingCalls) {
    const result = cancelledResult();
    resultByCallId.set(id, result);
    messages.push({
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify(result),
    });
    emit({
      type: "tool_completed",
      payload: { toolCallId: id, toolName: name, result },
    });
  }
  pendingCalls.clear();
  const cancelled = controller.signal.aborted;
  // A deadline abort without a caller cancel is a turn timeout, not a
  // user-facing cancellation.
  const timedOut = cancelled && !input.signal?.aborted;
  if (cancelled) {
    finishReason = timedOut ? "error" : "cancelled";
    emit({
      type: "error",
      payload: {
        code: timedOut ? "TIMEOUT" : "CANCELLED",
        message: timedOut ? `Turn exceeded ${maxTurnMs}ms bound` : "Run cancelled",
        retryable: timedOut,
      },
    });
  } else if (marker?.finish === "tool_limit") {
    finishReason = "tool_limit";
  } else if (marker?.finish === "step_limit") {
    finishReason = "step_limit";
  } else if (marker) {
    finishReason = "error";
    emit({
      type: "error",
      payload: {
        code: marker.code,
        message: marker.message,
        retryable: marker.retryable,
      },
    });
  } else {
    finishReason = "completed";
  }
  turnSignal.removeEventListener("abort", abort);
  controller.abort();
  emit({ type: "completed", payload: { finishReason } });
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
