# ADR-042: Durable recovery guidance and mutation admission

Status: implemented; exact-head CI pending. Authorized model-quality and channel deployment remain NOT VERIFIED.

Lime's existing companion-owned durable UI explains running/queued, host/consent wait, reconciliation, incompatible store, completion, failure and cancellation. It explicitly separates assistant state from authoritative app learning. Cancel does not roll back committed Pear transactions; restored history never restores authority. Manual verdicts require an app outcome check and do not grade, apply or undo learning.

New durable submissions are denied while the persisted journal has an ambiguous/interrupted mutation (non-null original idempotency key). The admission guard reads journal state in the existing harness transaction before clearing cancellation intent or admitting a new user message. This closes a second-request route around original-outcome reconciliation; cancel/reopen cannot bypass it. Resume and original-key revalidation/recovery retain their existing semantics. Read-only ambiguity is not treated as an uncertain mutation. The sidebar conservatively disables new submission while it displays unresolved operations; runner enforcement is authoritative and does not depend on UI state.

A new actual shared Pi/Mango/Lime HostPolicy/Pear HTTP regression commits a bookmark, loses its response, proves no new user admission/dispatch after ambiguity/cancel/reopen, reads authoritative app state, resolves the original outcome and executes one separately reviewed follow-up. Enrollment, grades and certificates remain unchanged. Existing 24 durable checks cover original-envelope recovery and live consent/logout/deactivation denial.

This adds guidance/admission integrity, not evaluated planning, an always-on digest service, new consent, automatic official-learning actions or actual Slack/Teams deployment.
