import { gatewayUrl } from "../shared/contract.js";
export async function listModels(
  base: string,
  token: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch(gatewayUrl(base) + "/v1/models", {
    headers: { Authorization: "Bearer " + token },
    signal,
  });
  if (!response.ok)
    throw new Error("Gateway model listing failed: " + response.status);
  const text = await response.text();
  if (text.length > 65536) throw new Error("Oversized model listing");
  const data = JSON.parse(text);
  if (
    !Array.isArray(data.data) ||
    data.data.length > 128 ||
    !data.data.every(
      (x: unknown) =>
        x &&
        typeof x === "object" &&
        typeof (x as { id?: unknown }).id === "string",
    )
  )
    throw new Error("Invalid models response");
  return data.data.map((x: { id: string }) => x.id);
}
// Boundary probe for the acceptance test; not a model loop. Commit a tool only after [DONE] + finish_reason.
export async function collectToolArguments(
  chunks: AsyncIterable<string>,
): Promise<Record<string, unknown>> {
  let buffer = "",
    argumentsText = "",
    finish = false,
    done = false;
  for await (const chunk of chunks) {
    buffer += chunk;
    if (buffer.length + argumentsText.length > 65536)
      throw new Error("Oversized stream");
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const line = frame.split("\n").find((x) => x.startsWith("data: "));
      if (!line) continue;
      const raw = line.slice(6);
      if (raw === "[DONE]") {
        done = true;
        continue;
      }
      const data = JSON.parse(raw),
        choice = data.choices?.[0];
      argumentsText +=
        choice?.delta?.tool_calls?.[0]?.function?.arguments || "";
      if (choice?.finish_reason === "tool_calls") finish = true;
    }
  }
  if (!done || !finish || buffer.trim())
    throw new Error("Interrupted/incomplete gateway stream; no dispatch");
  const args = JSON.parse(argumentsText);
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Invalid tool JSON");
  return args;
}
