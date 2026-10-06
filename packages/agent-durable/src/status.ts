import type { HarnessInspection, SubmissionRecord } from "@earendil-works/pi-durable";
import type { OpRecord } from "./journal.js";

/**
 * User-facing run states (issue #48): everything the trusted UI needs to show
 * a Resume/Cancel affordance and an honest reason line.
 */
export type RunPhase =
  | "running" // admitted, live work in progress
  | "queued" // input admitted, waiting for a busy run
  | "waiting_for_host" // parked dispatch: host not bound/online
  | "waiting_for_consent" // parked on a host consent/approval decision
  | "needs_reconciliation" // dispatched op whose outcome is unknown
  | "blocked_incompatible" // store version/layout cannot run here
  | "completed"
  | "failed"
  | "cancelled"
  | "idle"; // conversation exists, nothing admitted

export type RunStatus = {
  phase: RunPhase;
  conversationId: string;
  /** User-input submissions still tracked by the scheduler (bounded). */
  submissions: { requestId?: string; status: SubmissionRecord["status"]; reason?: string }[];
  /** Ops the model asked the host to run, for the reconciliation surface. */
  ops: { opId: string; toolName: string; status: OpRecord["status"]; attempts: number; error: string | null }[];
  /** Live task summary (generation/tool), for "what is it doing" lines. */
  tasks: { name: string; state: string }[];
  /** Machine-readable reason when set, e.g. STATE_INVALID, AUTHENTICATION. */
  reason?: string;
  detail?: string;
};

/**
 * Map persisted + inspection state onto the app-level phase. `inspection`
 * only tracks non-terminal submissions, so completion is derived from the
 * committed transcript tail: input admitted with a non-error assistant
 * message after it is "completed"; input admitted with nothing after it is
 * queued/running; nothing admitted is "idle".
 */
export function phaseOf(input: {
  tasks: { name: string; state: string }[];
  submissions: RunStatus["submissions"];
  ops: RunStatus["ops"];
  hostBound: boolean;
  cancelled: boolean;
  /** A user input exists but the turn produced nothing committed yet. */
  inputPending: boolean;
  /** Latest committed assistant message is a clean stop (turn finished). */
  tailSettled: boolean;
  lastError?: string;
}): { phase: RunPhase; reason?: string } {
  if (input.cancelled) return { phase: "cancelled" };
  const code = input.lastError?.match(/^\[([A-Z_]+)\]/)?.[1];
  if (input.ops.some((o) => o.status === "ambiguous" || o.status === "interrupted"))
    return { phase: "needs_reconciliation" };
  if (input.ops.some((o) => o.status === "parked") && !input.hostBound)
    return { phase: "waiting_for_host" };
  if (input.tasks.length) return { phase: "running" };
  if (input.submissions.some((s) => s.status === "queued"))
    return { phase: "queued" };
  if (input.lastError) return { phase: "failed", reason: code ?? "error" };
  if (input.tailSettled) return { phase: "completed" };
  if (input.inputPending) return { phase: "running" };
  return { phase: "idle" };
}
