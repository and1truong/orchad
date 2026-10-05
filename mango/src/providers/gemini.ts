import { randomUUID } from "node:crypto";
import { upstream, type HttpConfig } from "./http.js";
import {
  UpstreamError,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
  type Usage,
} from "./types.js";
export function geminiBody(r: ProviderRequest) {
  const contents: any[] = [];
  const names = new Map<string, string>();
  const providerIds = new Map<string, string>();
  for (const [index, m] of r.messages.entries()) {
    if (m.role === "system") continue;
    for (const [j, c] of (m.tool_calls ?? []).entries()) {
      names.set(c.id, c.function.name);
      const parts = r.continuations.get(index) as any[] | undefined;
      const providerId = parts?.filter((p) => p.functionCall)[j]?.functionCall
        .id;
      if (providerId) providerIds.set(c.id, providerId);
    }
    let parts: any[];
    if (m.role === "tool")
      parts = [
        {
          functionResponse: {
            name: names.get(m.tool_call_id!),
            ...(providerIds.has(m.tool_call_id!)
              ? { id: providerIds.get(m.tool_call_id!) }
              : {}),
            response: { result: m.content },
          },
        },
      ];
    else if (r.continuations.has(index))
      parts = r.continuations.get(index) as any[];
    else
      parts = [
        ...(m.content ? [{ text: m.content }] : []),
        ...(m.tool_calls ?? []).map((c) => ({
          functionCall: {
            name: c.function.name,
            args: JSON.parse(c.function.arguments),
          },
        })),
      ];
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents.at(-1);
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }
  return {
    contents,
    systemInstruction: r.messages.some((m) => m.role === "system")
      ? {
          parts: [
            {
              text: r.messages
                .filter((m) => m.role === "system")
                .map((m) => m.content)
                .join("\n"),
            },
          ],
        }
      : undefined,
    tools: r.tools?.length
      ? [
          {
            functionDeclarations: r.tools.map((t) => ({
              name: t.function.name,
              description: t.function.description,
              parametersJsonSchema: t.function.parameters,
            })),
          },
        ]
      : undefined,
    toolConfig: r.tools?.length
      ? {
          functionCallingConfig: {
            mode: r.tool_choice === "none" ? "NONE" : "AUTO",
          },
        }
      : undefined,
    generationConfig: {
      maxOutputTokens: r.max_completion_tokens,
      thinkingConfig: { includeThoughts: false },
    },
  };
}
export class GeminiProvider implements ProviderAdapter {
  readonly name = "gemini";
  constructor(private config: HttpConfig) {}
  async *generate(
    r: ProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    let usage: Usage = { input: null, output: null },
      reason: string | undefined,
      index = 0;
    const parts: any[] = [];
    for await (const e of upstream(
      this.config,
      `${this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"}/models/${encodeURIComponent(r.upstreamModel)}:streamGenerateContent?alt=sse`,
      { "x-goog-api-key": this.config.apiKey },
      geminiBody(r),
      signal,
    )) {
      if (e.error) throw new UpstreamError(502);
      if (e.promptFeedback?.blockReason) throw new UpstreamError(422);
      if (e.usageMetadata)
        usage = {
          input: e.usageMetadata.promptTokenCount ?? null,
          output:
            e.usageMetadata.candidatesTokenCount == null
              ? null
              : e.usageMetadata.candidatesTokenCount +
                (e.usageMetadata.thoughtsTokenCount ?? 0),
        };
      const c = e.candidates?.[0];
      if (!c) continue;
      for (const p of c.content?.parts ?? []) {
        if (p.thought && p.text) throw new UpstreamError(422);
        if (p.functionCall) {
          parts.push(p);
          yield {
            type: "delta",
            tool_calls: [
              {
                index: index++,
                id: p.functionCall.id ?? `call_${randomUUID()}`,
                type: "function",
                function: {
                  name: p.functionCall.name,
                  arguments: JSON.stringify(p.functionCall.args ?? {}),
                },
              },
            ],
          };
        } else if (typeof p.text === "string") {
          parts.push(p);
          if (p.text) yield { type: "delta", content: p.text };
        } else if (p.thoughtSignature) {
          parts.push(p);
        } else throw new UpstreamError(422);
      }
      if (c.finishReason) reason = c.finishReason;
    }
    if (!reason) throw new UpstreamError(502);
    const finishReason =
      reason === "STOP"
        ? index
          ? "tool_calls"
          : "stop"
        : reason === "MAX_TOKENS"
          ? "length"
          : [
                "SAFETY",
                "RECITATION",
                "BLOCKLIST",
                "PROHIBITED_CONTENT",
                "SPII",
              ].includes(reason)
            ? "content_filter"
            : undefined;
    if (!finishReason) throw new UpstreamError(422);
    yield {
      type: "final",
      finishReason,
      usage,
      continuation: parts.some((p) => p.thoughtSignature || p.functionCall?.id)
        ? parts
        : undefined,
    };
  }
}
