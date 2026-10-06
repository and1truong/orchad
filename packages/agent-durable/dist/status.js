/** Map persisted + inspection state onto the app-level phase. */
export function phaseOf(input) {
    if (input.cancelled)
        return { phase: "cancelled" };
    const code = input.lastError?.match(/^\[([A-Z_]+)\]/)?.[1];
    if (input.ops.some((o) => o.status === "ambiguous" || o.status === "interrupted"))
        return { phase: "needs_reconciliation" };
    if (input.ops.some((o) => o.status === "dispatched") && !input.hostBound)
        return { phase: "waiting_for_host" };
    if (input.tasks.length)
        return { phase: "running" };
    const last = input.submissions[input.submissions.length - 1];
    if (!last)
        return { phase: "idle" };
    if (last.status === "queued")
        return { phase: "queued" };
    if (last.status === "placed")
        return { phase: "running" };
    if (last.status === "done")
        return { phase: "completed" };
    return { phase: "failed", reason: code ?? last.reason ?? "error" };
}
