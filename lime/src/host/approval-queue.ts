import type { Approval } from "./policy.js";

interface Entry {
  approval: Approval;
  signal: AbortSignal;
  finish: (yes: boolean) => void;
}

// FIFO queue for approval prompts. Exactly one card is current at a time; a
// concurrent request queues behind it instead of silently auto-denying the
// occupant. An entry releases its slot on resolution, caller abort, or its
// own expiresAt deadline, so a disconnected or timed-out client can never
// hold the slot forever.
export class ApprovalQueue {
  private entries: Entry[] = [];
  private displayed: Entry | null = null;
  constructor(private onCurrent: (approval: Approval | null) => void) {}
  private emit() {
    const head = this.entries[0] ?? null;
    if (head === this.displayed) return;
    this.displayed = head;
    this.onCurrent(head?.approval ?? null);
  }
  ask(approval: Approval, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      let finished = false;
      const entry: Entry = {
        approval,
        signal,
        finish: (yes: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          this.entries = this.entries.filter((e) => e !== entry);
          resolve(yes);
          this.emit();
        },
      };
      const cancel = () => entry.finish(false);
      const timer = setTimeout(
        cancel,
        Math.max(0, approval.expiresAt - Date.now()),
      );
      this.entries.push(entry);
      signal.addEventListener("abort", cancel, { once: true });
      this.emit();
    });
  }
  resolveCurrent(yes: boolean) {
    this.entries[0]?.finish(yes);
  }
  resolveAll(yes: boolean) {
    for (const entry of [...this.entries]) entry.finish(yes);
  }
  get pending() {
    return this.entries.length;
  }
}
