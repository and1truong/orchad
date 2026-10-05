import { upstream, type HttpConfig } from "./http.js";
import {
  publicMessage,
  UpstreamError,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
  type Usage,
} from "./types.js";
export class OpenAIProvider implements ProviderAdapter {
  readonly name = "openai";
  constructor(private config: HttpConfig) {}
  async *generate(
    r: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    let reason: any,
      usage: Usage = { input: null, output: null },
      done = false;
    const body = {
      model: r.upstreamModel,
      messages: r.messages.map(publicMessage),
      tools: r.tools?.length ? r.tools : undefined,
      tool_choice: r.tools?.length ? (r.tool_choice ?? "auto") : undefined,
      n: 1,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: r.max_completion_tokens,
    };
    for await (const c of upstream(
      this.config,
      `${this.config.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`,
      { authorization: `Bearer ${this.config.apiKey}` },
      body,
      signal,
    )) {
      if (c.__done) {
        done = true;
        break;
      }
      if (c.error) throw new UpstreamError(502);
      if (c.usage)
        usage = {
          input: c.usage.prompt_tokens ?? null,
          output: c.usage.completion_tokens ?? null,
        };
      const choice = c.choices?.[0];
      if (!choice) continue;
      if (choice.delta?.refusal) throw new UpstreamError(422);
      if (choice.delta?.content || choice.delta?.tool_calls)
        yield {
          type: "delta",
          content: choice.delta.content ?? undefined,
          tool_calls: choice.delta.tool_calls,
        };
      if (choice.finish_reason) reason = choice.finish_reason;
    }
    if (
      !done ||
      !["stop", "tool_calls", "length", "content_filter"].includes(reason)
    )
      throw new UpstreamError(502);
    yield { type: "final", finishReason: reason, usage };
  }
}
