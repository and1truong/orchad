import { randomBytes } from "node:crypto";
import type { ModelConfig, ProviderAdapter } from "./providers/types.js";
import { MockProvider } from "./providers/mock.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GeminiProvider } from "./providers/gemini.js";
import { readFileSync } from "node:fs";
export const mockModel: ModelConfig = {
  id: "mock-scripted",
  provider: "mock",
  upstreamModel: "mock-scripted",
  capabilities: { text: true, streaming: true, functionTools: true },
  maxOutputTokens: 8192,
  compatibility: ["Scripted offline fixture, not live inference"],
};
export function environmentConfig() {
  const production = process.env.NODE_ENV === "production";
  const key = process.env.GATEWAY_STATE_KEY
    ? Buffer.from(process.env.GATEWAY_STATE_KEY, "hex")
    : randomBytes(32);
  const origins = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);
  if (production && (!process.env.GATEWAY_STATE_KEY || !origins.length))
    throw new Error(
      "Production requires persistent state key and CORS allowlist",
    );
  const models: ModelConfig[] = process.env.MODELS_FILE
    ? JSON.parse(readFileSync(process.env.MODELS_FILE, "utf8"))
    : [mockModel];
  const adapters: ProviderAdapter[] = [
    new MockProvider(
      process.env.MOCK_SCRIPT_FILE
        ? JSON.parse(readFileSync(process.env.MOCK_SCRIPT_FILE, "utf8"))
        : undefined,
    ),
  ];
  if (process.env.OPENAI_API_KEY)
    adapters.push(
      new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
      }),
    );
  if (process.env.ANTHROPIC_API_KEY)
    adapters.push(
      new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
      }),
    );
  if (process.env.GEMINI_API_KEY)
    adapters.push(
      new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY,
        baseUrl: process.env.GEMINI_BASE_URL,
      }),
    );
  for (const v of [
    process.env.OPENAI_BASE_URL,
    process.env.ANTHROPIC_BASE_URL,
    process.env.GEMINI_BASE_URL,
  ])
    if (v && new URL(v).protocol !== "https:" && production)
      throw new Error("Production upstream URL requires HTTPS");
  return { models, adapters, stateKey: key, corsOrigins: origins, production };
}
