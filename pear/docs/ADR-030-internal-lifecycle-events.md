# ADR 030: Internal lifecycle event coverage
Epic #49 G03/G09/G10/G18/G19. Extends the signed outbox of ADR 023.

## Decision
Migration 022 adds transactional facts for standalone publication/retirement/enrollment/human-confirmed completion; tenant-visible collection publication/retirement; authoritative award enrollment/completion; assignment definition/state changes, notification creation and course/award assignment obligation changes. It does not backfill old rows. SQL triggers participate in the same domain/audit/idempotency transaction; rollback cannot leave a phantom event.

The frozen topic registry contains sixteen explicit topics. New subscriptions select an explicit subset after human endpoint/reason review; old subscriptions retain their original topic sets. Client UI/server share the registry. Pull clients with events.read may see added topics and must handle unknown topics; the unchanged pear-events/1 envelope is a minimal ID/version/state fact, not a complete vendor wire API.

No course/item body, answer, private evidence, notification title, contact detail or runtime suspend data is sent. Author-only collections and their award events are suppressed using the pinned collection version's access policy. Tenant event credentials/subscriptions retain live owner/admin/session/config authority. Existing ordered lease/HMAC/retry/dedup/failed-event review machinery applies unchanged.

## Evidence and limits
Domain + actual signed HTTP receiver tests generate item/award/assignment/cancellation events through real services, verify completion/notification deduplication, order and minimal payloads, audit rollback and author-only collection suppression. Existing outbox tests cover receiver commit then lost response, stable IDs/bytes, retries, leases, restart, auth revocation, live disable and topic filtering. Exact-head CI determines PASS.

A notification-created fact is not a delivered email/DM and a 2xx receiver acknowledgment is not learner read confirmation. Per-channel accounts/recipient consent, export/report delivery, provider lifecycle ingestion/licensing, complete partner API mappings, production retention/compaction/network policy and real deploy remain BLOCKED/NOT VERIFIED. No actual Slack/Teams/email send or partner integration is performed by this change.
