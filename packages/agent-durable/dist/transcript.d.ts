import { type Message as PiMessage } from "@earendil-works/pi-ai";
import { type Message } from "@orchard/agent-client";
/**
 * Pi transcript -> Orchard wire messages. Pi stores its own bookkeeping entries
 * (system tool lists, aborted partials); the wire only ever carries the
 * contract roles. `x_gateway_state` is recovered from `responseId`, and the
 * exact argument string from the `argumentsRaw` capture when present so the
 * state digest keeps binding on replay.
 */
export declare function transcriptToWire(messages: readonly PiMessage[]): {
    messages: Message[];
    dropped: number;
};
/**
 * The gateway rejects histories with dangling tool calls. A crash between an
 * assistant commit and its tool-result commits can leave exactly that; drop
 * the unresolved tail so the next request is legal. The dropped calls never
 * dispatched (pi synthesizes missing results on its own view, and our journal
 * holds anything that did dispatch).
 */
export declare function sanitizeWire(wire: Message[]): {
    messages: Message[];
    dropped: number;
};
/**
 * Usage derived from committed wire messages: assistant turns and tool results
 * since the most recent user message. Persisted state needs no separate
 * counter doc; this is the same measure the in-page runner used.
 */
export declare function turnUsage(wire: readonly Message[]): {
    steps: number;
    toolCalls: number;
};
