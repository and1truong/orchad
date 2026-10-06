import { collapseSystemMessages, normalizeContext, } from "@earendil-works/pi-ai";
import { validateHistory } from "@orchard/agent-client";
/**
 * Pi transcript -> Orchard wire messages. Pi stores its own bookkeeping entries
 * (system tool lists, aborted partials); the wire only ever carries the
 * contract roles. `x_gateway_state` is recovered from `responseId`, and the
 * exact argument string from the `argumentsRaw` capture when present so the
 * state digest keeps binding on replay.
 */
export function transcriptToWire(messages) {
    const collapsed = collapseSystemMessages(normalizeContext({ messages: [...messages] }));
    const wire = [];
    for (const m of collapsed.messages) {
        if (m.role === "system") {
            const content = typeof m.content === "string" ? m.content : "";
            if (content)
                wire.push({ role: "system", content });
            continue;
        }
        if (m.role === "user") {
            wire.push({
                role: "user",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            });
            continue;
        }
        if (m.role === "assistant") {
            const a = m;
            if (a.stopReason !== "stop" && a.stopReason !== "toolUse")
                continue;
            const text = a.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("");
            const calls = a.content.filter((c) => c.type === "toolCall");
            const tool_calls = calls.map((c) => {
                const t = c;
                return {
                    id: t.id,
                    type: "function",
                    function: {
                        name: t.name,
                        arguments: t.argumentsRaw ?? JSON.stringify(t.arguments),
                    },
                };
            });
            wire.push({
                role: "assistant",
                content: text || (tool_calls.length ? null : ""),
                ...(tool_calls.length ? { tool_calls } : {}),
                ...(a.responseId ? { x_gateway_state: a.responseId } : {}),
            });
            continue;
        }
        if (m.role === "toolResult") {
            const t = m;
            const text = t.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("");
            wire.push({ role: "tool", tool_call_id: t.toolCallId, content: text });
            continue;
        }
        // Unknown/synthetic roles never reach the gateway.
    }
    return sanitizeWire(wire);
}
/**
 * The gateway rejects histories with dangling tool calls. A crash between an
 * assistant commit and its tool-result commits can leave exactly that; drop
 * the unresolved tail so the next request is legal. The dropped calls never
 * dispatched (pi synthesizes missing results on its own view, and our journal
 * holds anything that did dispatch).
 */
export function sanitizeWire(wire) {
    const messages = [...wire];
    let dropped = 0;
    for (;;) {
        try {
            validateHistory(messages);
            return { messages, dropped };
        }
        catch {
            if (!messages.length || dropped > 64)
                throw new Error("Transcript cannot be sanitized");
            messages.pop();
            dropped++;
        }
    }
}
/**
 * Usage derived from committed wire messages: assistant turns and tool results
 * since the most recent user message. Persisted state needs no separate
 * counter doc; this is the same measure the in-page runner used.
 */
export function turnUsage(wire) {
    let steps = 0, toolCalls = 0;
    for (let i = wire.length - 1; i >= 0; i--) {
        const m = wire[i];
        if (m.role === "user" || m.role === "system")
            break;
        if (m.role === "assistant")
            steps++;
        else if (m.role === "tool")
            toolCalls++;
    }
    return { steps, toolCalls };
}
