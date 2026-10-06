# ADR 037: own ledger insights and declared skill exposure

G14 gets an explicitly bounded own-only insight read and an on-demand human view. The administrator/manager report audience never changes its own insight audience: every role gets only its own ledger. Live account/tenant/auth-version checks are repeated by the ledger seam.

Metrics have concrete definitions: enrollment records (including recurring cycles), distinct kind/content identities, official Pear course completions, learner-confirmed standalone reading, synthetic award completion, open/overdue records, declared full-course duration per record, and opt-in observed timer intervals. Reported xAPI/SCORM results are excluded. Intended duration, observed intervals, official learning and learner-confirmed reading are separate values.

Skill exposure uses only pinned content-version author-declared tags. Counts represent tagged enrollment records, with up to five explicit kind/content/version/enrollment source examples per skill. No proficiency, mastery, competency test, recommendation confidence, external percentile, market benchmark or accreditation is inferred. Missing tags and unrecorded timers are explicit coverage gaps.

Complete rows are paginated within the existing bounds. A principal/auth-version/own-ledger hash protects pagination continuity; another learner's changes do not invalidate own results. Own ledger/timer/tag source changes require refreshing from the first page. The view clears results on identity change and renders explanatory EN/VI labels. Reads never mutate official records, revision, audit or operation keys.

Validation authored: three domain/actual HTTP tests cover official completion vs reading, intended vs observed duration, immutable source tags, absent mastery, own/manager/tenant isolation, full-row snapshot paging, revoked authority, cookie/channel/epoch boundaries and read-only effects. One browser journey covers the human read, source IDs, mobile width, account switch and Vietnamese labels. Exact-head CI pending.

External commercial skill/content metric definitions and benchmarks remain BLOCKED/NOT VERIFIED. This is a Pear-defined ledger insight profile, not full Go1 Skill/Content Insights parity.
