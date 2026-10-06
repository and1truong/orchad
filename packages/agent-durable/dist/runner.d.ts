import type { Context } from "@earendil-works/chord";
import type { Result, ToolDescriptor, Message } from "@orchard/agent-client";
import { type OpEnvelope } from "./journal.js";
import { type RunStatus } from "./status.js";
export declare class IncompatibleStorage extends Error {
    readonly stored: {
        schemaVersion: number;
        runtime: string;
    };
    constructor(stored: {
        schemaVersion: number;
        runtime: string;
    });
}
export type RunnerGateway = {
    baseUrl: string;
    /** Live bearer token — memory only, never persisted. */
    token: string;
    model: string;
};
export type HostBinding = {
    targetId: string;
    tools: ToolDescriptor[];
    /**
     * Current committed revision of this target at bind time. Write ops CAS on
     * it (expectedRevision); refreshed from host results after each dispatch.
     */
    revision?: () => number | null;
    /** Names of write tools whose backend dedups by idempotencyKey. */
    idempotentTools?: readonly string[];
    /** Host consent/approval gate consulted before any re-dispatch. */
    revalidate?: (envelope: OpEnvelope) => Promise<void>;
};
export type HostDispatchFn = (envelope: OpEnvelope, attempt: {
    opId: string;
    attemptNo: number;
}, context: Context) => Promise<Result>;
export type RunnerOptions = {
    storagePath: string;
    fetcher?: typeof fetch;
    instructions?: string;
    maxSteps?: number;
    maxToolCalls?: number;
};
export type DurableRunner = {
    readonly conversationId: string;
    /** Supply/replace live gateway credentials. Nothing is persisted. */
    configure(gateway: RunnerGateway): Promise<void>;
    /** Rebind host targets; parked dispatches wake + revalidate + dispatch. */
    bind(bindings: HostBinding[], dispatch: HostDispatchFn): Promise<void>;
    unbind(): void;
    readonly bound: boolean;
    /** Durably admit user input; same requestId returns the same submission. */
    submit(input: {
        prompt: string;
        requestId?: string;
    }): Promise<{
        submissionId: string;
        requestId: string;
    }>;
    /** Re-enable scheduling (after reopen or host reconnect). */
    resume(): Promise<RunStatus>;
    /** Persist cancel intent, abort live tasks, release parked work. */
    cancel(): Promise<RunStatus>;
    status(): Promise<RunStatus>;
    /** Wire transcript for display/replay. */
    transcript(): Promise<{
        messages: Message[];
        dropped: number;
    }>;
    /** Cross-check journal vs committed entries; classify ambiguous ops. */
    reconcile(): Promise<RunStatus>;
    /** Host/user verdict for an ambiguous op. */
    resolveOp(callId: string, outcome: {
        status: "reconciled";
        result?: unknown;
    } | {
        status: "failed";
        error: string;
    }): Promise<void>;
    /** Notify on phase change. */
    watch(cb: (status: RunStatus) => void): () => void;
    close(): Promise<void>;
};
export declare function openRunner(options: RunnerOptions, context?: Context): Promise<DurableRunner>;
