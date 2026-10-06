import type { Context } from "@earendil-works/chord";
import type { TSchema } from "@earendil-works/pi-ai";
import type { Result, ToolDescriptor } from "@orchard/agent-client";
import { type OpEnvelope } from "./journal.js";
export type HostDispatch = (envelope: OpEnvelope, attempt: {
    opId: string;
    attemptNo: number;
}, context: Context) => Promise<Result>;
export type HostToolOptions = {
    /** Host target the envelope addresses (document id, tab descriptor, ...). */
    targetId: string;
    /**
     * True only when the backend was verified to dedup this tool's writes by
     * idempotencyKey (e.g. the Guava service). Host opt-in per tool; the
     * runner never assumes an unknown mutation is safe.
     */
    idempotent: boolean;
    /** Latest revision the host reported for this target (writes only). */
    getRevision: () => number | null;
    /** Re-check live host state before ANY re-entry (recovered parked or
     *  dispatched op). Throw to block: consent/binding/approval must be
     *  re-established by the host. */
    revalidate?: (envelope: OpEnvelope) => Promise<void>;
    /** Resolves once the host binding for this target is live. */
    whenBound: () => Promise<void>;
    dispatch: HostDispatch;
};
/**
 * One Orchard host tool. replay is 'safe' only for reads and verified
 * idempotent writes: a 'safe' pi.tool task re-runs execute() on recovery,
 * where the journal makes the re-dispatch carry the SAME op id, envelope and
 * idempotencyKey. 'unsafe' (any other mutation) is never re-run — pi settles
 * it 'interrupted' without touching our execute, leaving the journal op
 * 'dispatched' for reconciliation. Live policy (consent, approvals, CAS) runs
 * inside dispatch() on every attempt, including the first.
 */
export declare function orchardTool(descriptor: ToolDescriptor, opts: HostToolOptions): import("@earendil-works/pi-durable").ToolRegistration<TSchema, import("@earendil-works/chord").JsonValue>;
