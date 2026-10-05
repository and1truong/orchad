import { sse } from "../../packages/agent-client/src/protocol.js";
import { UpstreamError } from "./types.js";
export type HttpConfig = {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};
export async function* upstream(
  config: HttpConfig,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<any> {
  let response: Response;
  try {
    response = await (config.fetcher ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
      redirect: "error",
    });
  } catch {
    signal.throwIfAborted();
    throw new UpstreamError(502, false);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new UpstreamError(
      response.status,
      response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504,
    );
  }
  for await (const frame of sse(response, signal)) {
    if (frame === "[DONE]") {
      yield { __done: true };
      return;
    }
    try {
      yield JSON.parse(frame);
    } catch {
      throw new UpstreamError(502);
    }
  }
}
