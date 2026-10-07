# ADR-023: Scoped event reconciliation and signed delivery

Status: bounded internal adapter; exact-head CI required. Actual external endpoint/provider deployment NOT VERIFIED.

## Contract

This is `pear-events/1`, not a claim of complete Go1 REST/webhook wire compatibility. Go1 security reference at baseline: https://developers.go1.com/docs/developer-tools/webhooks/security/ ; HMAC definition: https://www.rfc-editor.org/rfc/rfc2104 .

Migration 018 appends enrollment.created, enrollment.completed, content.published and content.retired **course** events within the domain SQLite transaction via triggers. Enrollment completion comes from the authoritative status transition, not an assistant assertion. Existing pre-migration data is not backfilled; seeded inserts produce events. Reconciliation uses `GET /integrations/v1/events?after=0&limit=20` with explicit `events.read` bearer scope, current issuer administrator/auth version, exact Host, no cookie fallback, whole-row 48 KiB paging and tenant filtering. Global sequence is monotonic and can have gaps; event IDs are opaque. Resources contain IDs/version/deadline/completion timestamp only, with no names/answers/full text/file IDs/secrets. This organization metadata scope is distinct from provisioning scopes and requires human review.

No arbitrary mutation proxy, SQL, fetch tool or AI domain loop is added. Human integration settings remain outside Bridge and require the normal same-origin/CSRF/epoch checks, active tenant administrator, library CAS and atomic audit/exact retry.

## Reviewed delivery destinations

Normal startup reads an explicit trusted server `PEAR_WEBHOOK_ENDPOINTS` JSON list of {id,url,secret}; at most 16 unique endpoint IDs. Exact HTTPS URL, no credentials/query/fragment, and 256-bit hex HMAC secret are required. App configuration also requires HTTPS/secure cookies. Test fixture mode accepts only loopback HTTP and is not startup-configurable. Secrets remain in trusted server configuration, never SQLite/tool arguments/browser settings/checkpoints/audit. Human UI selects an existing endpoint ID, explicit topics and review reason, with no arbitrary URL or secret input. No endpoint or real secret was configured by this work. DNS/network allowlisting and actual receiver authorization remain deployment responsibilities requiring separate evidence.

A subscription is tied to the creator's auth version and exact endpoint configuration fingerprint. Changing URL/secret, losing admin authority, disabling the subscription or removing configuration prevents dispatch and does not automatically reactivate later. New subscriptions start **after the current global event cursor**, with no automatic historical learner data delivery. An authorized read API can reconcile history. Subscription quota: 32/tenant.

## Ordering, retry and reconciliation

Each subscription delivers selected topics in sequence. An unacknowledged selected event blocks later events for that subscription. Delivery claims persist with a unique 30-second lease; concurrent workers cannot dispatch the same unexpired claim. A crash after dispatch can still cause duplicate delivery after lease expiry. Every attempt sends the same event ID/body. Delivery is at least once; the receiver must transactionally deduplicate ID/body and acknowledge duplicates, then reconcile with the read API. A recovered historical response never changes official learning.

Signature headers: X-Pear-Timestamp (Unix seconds), X-Pear-Signature (`v1=<full HMAC-SHA256 hex>`), X-Pear-Event-Id, X-Pear-Attempt. Signed bytes are `timestamp + "." + raw UTF-8 body`. Receiver utility rejects malformed signatures, changed bytes, body >48 KiB and timestamps outside ±300 seconds. Time validation does not itself prevent replay: deduplicate opaque event IDs transactionally and reject ID/body conflict, as the actual HTTP receiver fixture does. Receiver key rotation and deployment clock synchronization require external evidence.

HTTP redirect is never followed, timeout is five seconds, only 2xx is acknowledged. Remote response bodies/errors are never retained/logged. Retry is deterministic exponential 1s–1h, eight automatic attempts, then explicit failed state with subsequent events blocked. A human can inspect paged status and retry a specific failed event with review reason/CAS; changing the owner/config does not regain authority. Worker runs at most 20 attempts/pass, with non-overlapping timer runs and shutdown waiting for active work. Network dispatch cannot be rolled back; authority revoked after send prevents future dispatch but cannot retract an already sent payload.

## Evidence and remaining gaps

Eight Node/domain/HTTP fixtures exercise true human completion → event, exact key retry, audit rollback, real signed loopback delivery, timestamp/tamper checks, receiver-commit/lost-response recovery, concurrency/abandoned leases, restart, role/config revocation, retry exhaustion/explicit review, redirects, scoped read paging and HTTP authority. Browser fixture selects the pinned endpoint, receives a real signature-checked enrollment event, inspects status and disables further delivery.

Production receiver/network authorization, retention/compaction, monitoring/alerting, provider key rotation, richer item/award/notification topics, invitation/export delivery, reference API contracts and partner reconciliation remain OPEN/BLOCKED/NOT VERIFIED. Outbox history is retained; no silent event loss, purge or unsupported-topic success is claimed. Actual provider runtime/LMS/HRIS/Slack/Teams delivery was not performed.
