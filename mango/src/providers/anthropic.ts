import { upstream, type HttpConfig } from "./http.js";
import {
  UpstreamError,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
  type Usage,
} from "./types.js";
export function anthropicBody(r: ProviderRequest) {
  const messages: any[] = [];
  for (const m of r.messages) {
    if (m.role === "system") continue;
    let content: any[];
    if (m.role === "tool")
      content = [
        {
          type: "tool_result",
          tool_use_id: m.tool_call_id,
          content: m.content,
        },
      ];
    else
      content = [
        ...(m.content ? [{ type: "text", text: m.content }] : []),
        ...(m.tool_calls ?? []).map((c) => ({
          type: "tool_use",
          id: c.id,
          name: c.function.name,
          input: JSON.parse(c.function.arguments),
        })),
      ];
    const role = m.role === "assistant" ? "assistant" : "user";
    const previous = messages.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else messages.push({ role, content });
  }
  return {
    model: r.upstreamModel,
    system:
      r.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n") || undefined,
    messages,
    max_tokens: r.max_completion_tokens,
    stream: true,
    tools: r.tools?.length
      ? r.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }))
      : undefined,
    tool_choice: r.tools?.length
      ? { type: r.tool_choice ?? "auto" }
      : undefined,
  };
}
export class AnthropicProvider implements ProviderAdapter {
  readonly name = "anthropic";
  constructor(private config: HttpConfig) {}
  async *generate(
    r: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    let usage: Usage = { input: null, output: null },
      reason: string | undefined,
      stopped = false;
    const indices = new Map<number, number>();
    let next = 0;
    for await (const e of upstream(
      this.config,
      `${this.config.baseUrl ?? "https://api.anthropic.com/v1"}/messages`,
      { "x-api-key": this.config.apiKey, "anthropic-version": "2023-06-01" },
      anthropicBody(r),
      signal,
    )) {
      if (e.type === "error")
        throw new UpstreamError(
          e.error?.type === "overloaded_error" ? 503 : 502,
          e.error?.type === "overloaded_error",
        );
      if (e.type === "message_start")
        usage = {
          input:
            e.message.usage?.input_tokens == null
              ? null
              : e.message.usage.input_tokens +
                (e.message.usage.cache_creation_input_tokens ?? 0) +
                (e.message.usage.cache_read_input_tokens ?? 0),
          output: e.message.usage?.output_tokens ?? null,
        };
      if (e.type === "content_block_start") {
        const b = e.content_block;
        if (b.type === "tool_use") {
          const index = next++;
          indices.set(e.index, index);
          yield {
            type: "delta",
            tool_calls: [
              {
                index,
                id: b.id,
                type: "function",
                function: {
                  name: b.name,
                  arguments: Object.keys(b.input ?? {}).length
                    ? JSON.stringify(b.input)
                    : "",
                },
              },
            ],
          };
        } else if (b.type === "text" && b.text)
          yield { type: "delta", content: b.text };
        else if (b.type !== "text") throw new UpstreamError(422);
      }
      if (e.type === "content_block_delta") {
        const d = e.delta;
        if (d.type === "text_delta") yield { type: "delta", content: d.text };
        else if (d.type === "input_json_delta") {
          const index = indices.get(e.index);
          if (index === undefined) throw new UpstreamError(502);
          yield {
            type: "delta",
            tool_calls: [{ index, function: { arguments: d.partial_json } }],
          };
        } else throw new UpstreamError(422);
      }
      if (e.type === "message_delta") {
        reason = e.delta.stop_reason;
        usage = {
          input: usage.input,
          output: e.usage?.output_tokens ?? usage.output,
        };
      }
      if (e.type === "message_stop") {
        stopped = true;
        break;
      }
    }
    if (!stopped || !reason) throw new UpstreamError(502);
    const reasons: Record<string, any> = {
      end_turn: "stop",
      tool_use: "tool_calls",
      max_tokens: "length",
      stop_sequence: "stop",
      refusal: "content_filter",
    };
    if (!reasons[reason]) throw new UpstreamError(422);
    yield { type: "final", finishReason: reasons[reason], usage };
  }
}
