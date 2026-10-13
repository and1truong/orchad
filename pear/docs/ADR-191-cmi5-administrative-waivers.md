# ADR-191 — human cmi5 administrative waivers (#144)

Stacked on ADR-190 / #267. A live same-tenant content administrator may confirm
one alternative-evidence reason for an unsatisfied AU in an existing Normal
registration on a published or pinned retired package. The four Quartz reason
values are explicit choices; no default reason or implicit waiver is submitted.
Learners, other tenants, Browse registrations, revoked packages, inactive
learners, unknown AUs, stale revisions and unconfirmed requests cannot waive.

The existing human command boundary handles CAS, exact operation receipts,
rights checks and audit. In the same SQLite transaction, abandon the current AU
session, create a dedicated expired capability-free LMS session, write its
waived statement with the required result reason extension, recompute block/
course satisfaction and advance the affected learner and library revisions.
That dedicated session contains only waived and, when applicable, satisfied
statements, as required by Quartz 9.3.7. No launched statement, fetch token or
Basic credential is created for it. The existing immediate transaction/check
prevents duplicate waivers per registration/AU without a new storage schema.
Audit or receipt failure rolls all of this back, including credential revocation.

Reports show waiver and reason separately from AU-reported completion, pass,
score and duration. An administrative waiver does not manufacture learner
outcomes or official Pear credit. A waived AU can be opened only in Review mode
within that registration, or Normal in a fresh registration. Review credentials
cannot report satisfaction. Retained evidence and exact receipts survive restart.

The built administration UI requires a selected reason and confirmation,
clears confirmation on reason/registration changes and after acceptance, and
disables waived/satisfied AUs. Learners see durable reasons and Review controls.
Explicit label/control association keeps the reason selector accessible and
unambiguous to browser automation. The UI records an administrative decision;
it does not validate external assessment or equivalence evidence itself.

Local evidence: 29 cmi5 cases; build/typecheck/vendor; six built Chromium journeys,
including real learner → administrator → learner waiver/review behavior. Negative
cases cover scope/mode/status/CAS/CSRF, audit and receipt rollback, exact retry,
SQLite reopen, old credential rejection and absence of official ledger writes.
Production, external conformance and official learning/partner bindings remain
separate delivery work. No predecessor merge is needed for implementation.
