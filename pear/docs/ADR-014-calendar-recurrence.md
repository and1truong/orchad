# ADR-014: Anchored calendar-month recurrence

Status: internal Pear policy; exact provider behavior remains unverified.

## Decision

Keep existing once and elapsed UTC-day plans compatible. Monthly plans require repeatMonths (1–12), repeatDays=0, a named IANA region timezone or UTC, and an explicit earlier/later choice for repeated wall times. The first start is an explicit UTC instant. Subsequent instants use its original local date and clock, independently for each calendar index. Month ends clamp to the last day without drifting the original anchor. Missing wall times advance by the transition gap; repeated times choose the reviewed occurrence. Preview displays the original anchor and two samples in UTC and the named zone.

Fixed deadlines advance from their own original calendar anchor using the same cycle index. They must not precede their cycle; validation examines the first year and the worker checks each delivered cycle. Rolling deadlines remain elapsed UTC days from actual delivery. End is an absolute UTC cutoff. Previously delivered definitions, enrollments, deadlines and certificates remain immutable when future rules change.

The existing atomic, bounded five-cycle catchup, durable cursor, live authority, deduplication and private in-app notification policies remain in force. No timezone service, public clock override, external calendar delivery or new storage migration is introduced.

## Evidence and limits

Fixtures cover leap/month-end anchors, spring gaps and autumn folds, half-hour and quarter-hour changes, a skipped day, fixed versus rolling deadlines, rule edits, restart/catchup and invalid policies. A browser journey reviews a named-zone plan and verifies future cycles remain undelivered.

Conversion uses the runtime Intl implementation and its timezone database. ECMA-402 specifies Intl.DateTimeFormat: https://402.ecma-international.org/ . Gap/fold policies here are Pear decisions, not a claim of Go1 parity. Runtime timezone updates can affect future undelivered instants; already delivered UTC instants and pinned definitions remain stored. Production deployment must record runtime/ICU provenance. Calendar helper arithmetic was exercised in the authoring runtime; Node/SQLite/browser and full-stack verification require the exact GitHub Actions head because the local runner is disconnected.
