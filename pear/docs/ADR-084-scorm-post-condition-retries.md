# ADR-084 — SCORM post-condition retries

Status: implemented successor to ADR-083; epic #133 remains open.

Accept retry and retryAll only in post-condition rule actions, alongside the existing actions. Pre/exit-condition vocabulary remains strict. The pinned sequencing engine evaluates post conditions when an activity terminates; Commit remains a checkpoint and does not start a retry. retryAll exits the activity tree and restarts root flow, including when the terminated SCO is later in the package.

A retry may deliver the same SCO with a higher engine attemptCount. Return that SCO in the authenticated checkpoint receipt when the delivered activity is active and newer than the launch's technical attempt. The old capability still addresses the finished communication session. Both shells use their existing exclusive close/next-launch path, rotate the capability and create the new per-SCO technical attempt with fresh CMI/time. Overall registration/attempt and human domain-retake identities do not change. Original accepted history/time and exactly-once receipts remain immutable.

Attempt-limit denial remains a real navigation denial: no new technical attempt or official proof is created, and the server transaction rolls back. The content can explicitly exitAll to end that communication session. This preserves the existing invalid-navigation policy rather than flattening denied retry into a new allowed attempt. Raw client navigation/snapshots are not authority.

Tests cover retry/retryAll on editions 2/3/4, fresh state/time, saved history, receipt replay and superseded capability, a later-SCO retryAll root restart, Commit-versus-Terminate and bounded attempts. Built browser journeys cover automatic same-SCO launch replacement through authenticated durable ACK and subsequent official rollup. No migration. Full standards/reference/production conformance remains open.
