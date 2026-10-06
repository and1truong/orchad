import type { HarnessInspection, SubmissionRecord } from "@earendil-works/pi-durable";
import type { OpRecord } from "./journal.js";
/**
 * User-facing run states (issue #48): everything the trusted UI needs to show
 * a Resume/Cancel affordance and an honest reason line.
 */
export type RunPhase = "running" | "queued" | "waiting_for_host" | "waiting_for_consent" | "needs_reconciliation" | "blocked_incompatible" | "completed" | "failed" | "cancelled" | "idle";
export type RunStatus = {
    phase: RunPhase;
    conversationId: string;
    /** Latest user-input submission states, oldest first (bounded). */
    submissions: {
        requestId?: string;
        status: SubmissionRecord["status"];
        reason?: string;
    }[];
    /** Ops the model asked the host to run, for the reconciliation surface. */
    ops: {
        opId: string;
        toolName: string;
        status: OpRecord["status"];
        attempts: number;
        error: string | null;
    }[];
    /** Live task summary (generation/tool), for "what is it doing" lines. */
    tasks: {
        name: string;
        state: string;
    }[];
    /** Machine-readable reason when set, e.g. STATE_INVALID, AUTHENTICATION. */
    reason?: string;
    detail?: string;
};
/** Map persisted + inspection state onto the app-level phase. */
export declare function phaseOf(input: {
    scheduling: HarnessInspection["scheduling"];
    tasks: {
        name: string;
        state: string;
    }[];
    submissions: RunStatus["submissions"];
    ops: RunStatus["ops"];
    hostBound: boolean;
    cancelled: boolean;
    lastError?: string;
}): {
    phase: RunPhase;
    reason?: string;
};
