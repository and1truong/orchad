/**
 * Map persisted + inspection state onto the app-level phase. `inspection`
 * only tracks non-terminal submissions, so completion is derived from the
 * committed transcript tail: input admitted with a non-error assistant
 * message after it is "completed"; input admitted with nothing after it is
 * queued/running; nothing admitted is "idle".
 */
export function phaseOf(input) {
    if (input.cancelled)
        return { phase: "cancelled" };
    const code = input.lastError?.match(/^\[([A-Z_]+)\]/)?.[1];
    if (input.ops.some((o) => o.status === "ambiguous" || o.status === "interrupted"))
        return { phase: "needs_reconciliation" };
    if (input.ops.some((o) => o.status === "parked") && !input.hostBound)
        return { phase: "waiting_for_host" };
    if (input.tasks.length)
        return { phase: "running" };
    if (input.submissions.some((s) => s.status === "queued"))
        return { phase: "queued" };
    if (input.lastError)
        return { phase: "failed", reason: code ?? "error" };
    if (input.tailSettled)
        return { phase: "completed" };
    if (input.inputPending)
        return { phase: "running" };
    return { phase: "idle" };
}
