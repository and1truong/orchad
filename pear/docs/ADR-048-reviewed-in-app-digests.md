# ADR-048: Own reviewed scheduled in-app digest

Status: implemented; exact-head validation pending. Epic #49 G22/G13 partial extension.

A human reviews a disabled-by-default own schedule: named IANA zone/UTC, selected weekdays, hour/minute, explicit fold choice, intended minute budget and 1–30-day payload retention. Missing wall times advance by the clock gap; folds select earlier/later. The monthly assignment resolver remains the same, now shared through a validated wall-time helper.

Human tools are absent from the bridge catalog and use existing own aggregate CAS, exact original payload/key, live authority, cookie/CSRF/epoch and atomic audit. Historical approval receipts do not reenable a disabled or authority-invalidated subscription. No destination or other account can be supplied. Changed auth-version disables future delivery until a fresh review; old-authority notifications are withheld.

The independent 30-second startup scheduler processes at most 25 due people in one IMMEDIATE transaction, deduplicates subscription-version/UTC occurrences and atomically writes payload/audit/own revision/next run. Missed occurrences older than six hours are skipped, never backfilled. At most three deliveries per rolling 24 hours across preference versions; deletion cannot reset this limit because delivery audit is authoritative. Audit failure rolls back and retries. No model runs, official acknowledgment, completion, enrollment or external message occurs.

Snapshots contain at most five own next-learning metadata rows in 16 KiB. Current static/dynamic group rights are rechecked both at generation and history read; revoked titles/IDs are withheld, without deleting official learning. On-demand digest receives the same current-rights fix. Ranking still uses the first six eligible-source query rows per enrollment kind and first ten declared-preference recommendations; this is bounded deterministic guidance, not global or evaluated model ranking. Intended duration is never remaining time/mastery.

Own history is paginated in whole rows below 48 KiB, current-auth-version only, TTL-hidden immediately, and physically deleted in batches of 500 per scheduler tick. Per-person retained payload quota is 1000. Human read marking only changes a notification; explicit deletion removes payloads. Original-key receipts, preferences and metadata-only delivery audit have separate operational retention; production governance remains open. Delivery timestamps may differ from scheduled instants within the six-hour tolerance. External channel installation/consent/recipient reconciliation and delivery remain BLOCKED/NOT VERIFIED.

Validation: six domain/calendar/restart/rights/TTL/quota/rollback/real HTTP regressions plus one EN/VI mobile actual browser fixture authored. Existing monthly calendar and durable recovery regressions remain required. Actual provider/channel/model-quality parity, accessibility audit and production deployment are not implied.
