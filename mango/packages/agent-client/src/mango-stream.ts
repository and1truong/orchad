import { hostSafeSchema } from "@orchard/bridge-contract";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type JsonObject,
} from "@earendil-works/pi-ai";
import {
  AgentError,
  sse,
  validator,
  callSchema,
  type Message,
  type ToolCall,
  type ToolDescriptor,
} from "./protocol.js";

const checkCall = validator.compile(callSchema);
// Serialized host results and accumulated deltas must stay inside the gateway
// message cap so history the client produces is never rejected next turn.
const MESSAGE_MAX_LENGTH = 65536;

export const zeroUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});
export const makeAssistantMessage = (
  model: string,
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  errorMessage?: string,
): AssistantMessage => ({
  role: "assistant",
  content,
  api: "openai-completions",
  provider: "mango",
  model,
  usage: zeroUsage(),
  stopReason,
  ...(errorMessage ? { errorMessage } : {}),
  timestamp: Date.now(),
});
export function errorAssistantStream(
  model: string,
  reason: "error" | "aborted",
  message: string,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  stream.push({
    type: "error",
    reason,
    error: makeAssistantMessage(model, [], reason, message),
  });
  stream.end();
  return stream;
}

export type MangoCompletionInput = {
  /** Injectable for tests; defaults to global fetch. */
  fetcher?: typeof fetch;
  gatewayBaseUrl: string;
  gatewayToken: string;
  model: string;
  /** Orchard wire messages for this request, sent verbatim (x_gateway_state included). */
  messages: Message[];
  /** Orchard tool descriptors; their inputSchemas gate the whole call batch. */
  tools: ToolDescriptor[];
  signal?: AbortSignal;
  /** Call ids already present in history: a repeat anywhere fails the batch. */
  priorCallIds?: ReadonlySet<string>;
  /** Cap on calls this single response may produce (remaining turn/run budget). */
  maxCalls?: number;
  /** Raw wire capture for each finished assistant turn, in emission order. */
  onAssistant?: (a: { state?: string; calls: ToolCall[] }) => void;
  /** Fires once before the error event, with the marker the caller should surface. */
  onError?: (e: {
    code: string;
    message: string;
    retryable: boolean;
    finish?: "error" | "tool_limit";
  }) => void;
};

/**
 * The shared Mango transport seam: one strict Chat Completions SSE request
 * replayed as Pi assistant events. Orchard's checks run on the raw wire payload
 * before any toolCall block reaches Pi: a bad final call still prevents every
 * dispatch in the batch. Emits `responseId`/`argumentsRaw` captures on produced
 * blocks so callers can round-trip `x_gateway_state` and the exact argument
 * strings the state digest binds to.
 */
export function streamMangoCompletion(
  input: MangoCompletionInput,
): AssistantMessageEventStream {
  const url = new URL(input.gatewayBaseUrl);
  const fetcher = input.fetcher ?? fetch;
  const stream = createAssistantMessageEventStream();
  const signal = input.signal;
  let markerFinish: "tool_limit" | undefined;
  const fail = (reason: "error" | "aborted", message: string) => {
    stream.push({
      type: "error",
      reason,
      error: makeAssistantMessage(input.model, [], reason, message),
    });
    stream.end();
  };
  for (const t of input.tools)
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(t.name) ||
      t.inputSchema.type !== "object" ||
      !["read", "write", "destructive"].includes(t.effect) ||
      !hostSafeSchema(t.inputSchema)
    ) {
      fail("error", "Invalid tool configuration");
      return stream;
    }
  const schemas = new Map(
    input.tools.map((t) => [t.name, validator.compile(t.inputSchema)]),
  );
  if (schemas.size !== input.tools.length) {
    fail("error", "Duplicate tools");
    return stream;
  }
  if (signal?.aborted) {
    fail("aborted", "Run cancelled");
    return stream;
  }
  void (async () => {
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
          messages: input.messages,
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
        signal,
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
      done = false,
      textStarted = false;
    const toolCalls = new Map<number, ToolCall>();
    const partial = makeAssistantMessage(input.model, [], "pending");
    const snapshot = () => ({
      ...partial,
      content: [...partial.content],
    });
    stream.push({ type: "start", partial: snapshot() });
    for await (const frame of sse(response, signal)) {
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
      if (reason) throw new AgentError("TRANSPORT", "Delta after final choice");
      const d = choice.delta ?? {};
      if (d.content !== undefined && d.content !== null) {
        if (typeof d.content !== "string")
          throw new AgentError("TRANSPORT", "Invalid content delta");
        content += d.content;
        if (content.length > MESSAGE_MAX_LENGTH)
          throw new AgentError("OUTPUT_LIMIT", "Response exceeds message cap");
        if (!textStarted) {
          partial.content = [{ type: "text", text: content }];
          stream.push({
            type: "text_start",
            contentIndex: 0,
            partial: snapshot(),
          });
          textStarted = true;
        } else {
          (partial.content[0] as { text: string }).text = content;
        }
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: d.content,
          partial: snapshot(),
        });
      }
      for (const c of d.tool_calls ?? []) {
        if (!Number.isInteger(c.index) || c.index < 0 || c.index >= 16)
          throw new AgentError("TRANSPORT", "Invalid tool index");
        const current = toolCalls.get(c.index) ?? {
          id: "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (c.id) {
          if (current.id && current.id !== c.id)
            throw new AgentError("TRANSPORT", "Tool id changed");
          current.id = c.id;
        }
        if (c.type && c.type !== "function")
          throw new AgentError("TRANSPORT", "Unsupported tool type");
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
    if (!done || !reason) throw new AgentError("TRANSPORT", "Truncated model turn");
    if (reason !== "stop" && reason !== "tool_calls")
      throw new AgentError("OUTPUT_TRUNCATED", "Model turn did not complete");
    const ordered = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
    const completeCalls = ordered.map(([, c]) => c);
    if (reason === "tool_calls" !== Boolean(completeCalls.length))
      throw new AgentError("TRANSPORT", "Inconsistent finish reason");
    // Strict batch gate: the whole batch validates against raw wire strings
    // before the first Pi toolCall block exists, so a bad final call still
    // prevents every dispatch in this batch.
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
      return a as JsonObject;
    });
    if (
      new Set(completeCalls.map((c) => c.id)).size !== completeCalls.length ||
      completeCalls.some((c) => input.priorCallIds?.has(c.id))
    )
      throw new AgentError("INVALID_ARGUMENT", "Duplicate tool call id");
    const maxCalls = input.maxCalls ?? 16;
    if (completeCalls.length > maxCalls) {
      markerFinish = "tool_limit";
      throw new AgentError("INVALID_ARGUMENT", "Tool call budget exceeded");
    }
    if (textStarted)
      stream.push({
        type: "text_end",
        contentIndex: 0,
        content,
        partial: snapshot(),
      });
    const blocks: AssistantMessage["content"] = content
      ? [{ type: "text", text: content }]
      : [];
    for (let i = 0; i < completeCalls.length; i++) {
      const block = {
        type: "toolCall" as const,
        id: completeCalls[i].id,
        name: completeCalls[i].function.name,
        arguments: args[i],
        // Exact raw arguments as the model emitted them. Mango's
        // x_gateway_state digest binds the wire string: this field lets
        // callers re-send it byte-identically instead of re-serializing.
        argumentsRaw: completeCalls[i].function.arguments,
      };
      blocks.push(block);
      partial.content = [...blocks];
      stream.push({
        type: "toolcall_start",
        contentIndex: blocks.length - 1,
        partial: snapshot(),
      });
      stream.push({
        type: "toolcall_end",
        contentIndex: blocks.length - 1,
        toolCall: block,
        partial: snapshot(),
      });
    }
    const final = makeAssistantMessage(
      input.model,
      blocks,
      reason === "stop" ? "stop" : "toolUse",
    );
    // Opaque continuation state travels on the declared responseId field so it
    // survives transcript persistence verbatim, still bound to this message.
    if (state) final.responseId = state;
    for (const block of final.content)
      if (block.type === "toolCall") {
        const raw = completeCalls.find((c) => c.id === block.id)?.function
          .arguments;
        if (raw !== undefined)
          (block as { argumentsRaw?: string }).argumentsRaw = raw;
      }
    input.onAssistant?.({ state, calls: completeCalls });
    stream.push({
      type: "done",
      reason: reason === "stop" ? "stop" : "toolUse",
      message: final,
    });
    stream.end();
  })().catch((e) => {
    if (signal?.aborted) {
      fail("aborted", "Run cancelled");
      return;
    }
    const err =
      e instanceof AgentError
        ? e
        : new AgentError("TRANSPORT", "Agent transport failed");
    input.onError?.({
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      finish: markerFinish,
    });
    fail("error", err.message);
  });
  return stream;
}
