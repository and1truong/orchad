# ADR-040: Completed-course retakes preserve official history

Status: implemented bounded Pear policy; exact-head CI pending. Reference-specific reset/recertification equivalence remains OPEN.

A learner explicitly reviews and confirms an enrolled or current published version. The human-only operation creates a fresh self-directed enrollment linked to its own completed predecessor. Existing course versions, attempts, scores, certificates, assignment obligations and award completions remain unchanged. No answers, lessons, bookings, due dates, timers or completion transfer into the new record.

The selected version is explicit. A changed latest version rejects stale proposals; unpublished/retired courses reject new records. An enrolled public pin may be selected while a newer author-only version is hidden. This is audience policy, not commercial license revocation. One direct retake child per completed predecessor prevents duplicate clicks with new operation keys. A completed child can later be the source of another reviewed retake; an in-progress child is continued.

Migration 027 adds the predecessor foreign key and uniqueness, preserving the original direct enrollment index for records without a retake predecessor. Ordinary enrollment/assignment remains duplicate-preserving and does not silently select a retake. Existing assignment-cycle uniqueness and fresh-proof award logic stay in force. Reports include both old completion and new in-progress records; chart labels already count learning records rather than unique people.

Current ownership/completion/version/audience checks precede original-key reconciliation and run again inside the existing IMMEDIATE transaction. Enrollment/key/audit/revision commit together. Denial and injected audit failure leave no record/key/revision. Agent catalogs and Bridge reject these human-only operations even with host approval. Official graded answers remain human-only.

Tests cover preserved history, exact-version choice, idempotency/duplicate protection, live withdrawal/private-version handling, channel/role/owner/HTTP epoch and CSRF denial, audit rollback, report reconciliation and human mobile EN/VI review/reload.

No destructive historical reset, full reference recertification equivalence, commercial entitlement or accredited issuer claim follows from this policy.
