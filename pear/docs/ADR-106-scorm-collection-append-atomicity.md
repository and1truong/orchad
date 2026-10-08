# ADR-106: failed SCORM collection writes preserve record counts

Epic #133, stacked on ADR-105 / PR #174. The shared 2004 engine appends a
collection record while traversing a SetValue path, before validating the final
leaf. Type, range, dependency and unknown-field errors therefore leave empty
records behind. Repeated failures consume indices, change _count and pollute
subsequent checkpoints even though the synchronous API returns false.

The checksum-locked `pear-collection-atomicity-v12` adaptation records only the
collection lengths encountered along the write path. A finally block restores
those lengths in reverse order unless the shared setter succeeds. This covers
returned errors and thrown validation errors, including nested collections and
trusted preload. Successful appends and existing records retain their identity;
there is no full-state clone or separate browser/replay implementation. SCORM
1.2 engine bytes remain unchanged.

Exact adapted 2004 ESM SHA-256:
`fae6c4ca9514341b623479f41154175df0e27d68c4384cdda363916f7daef61f`.
Known initialization-v11 and earlier installer inputs/snapshot markers remain
compatible; idempotency and unknown-byte/version refusal are verified. No
migration, automatic removal of historical empty records or production change.

Twelve original three-edition regressions cover failed first/next append,
nested objectives/correct responses, objective duplicate IDs, repeated refusal,
exact error codes, whole CMI preservation, trusted preload and successful retry.
SQLite checkpoint/exact receipt retry/close-resume retains only successful
records and creates no official proof. Built pipwerks journeys verify counts
after synchronous failures and durable lost-ACK/resume behavior.

This is bounded collection-append atomicity, not a transaction across every
existing leaf or sequencing/global-objective side effect. Complete DM-03,
API-02, uniqueness, dependency and sequencing matrices remain OPEN. Historical
empty records are preserved; recovery policy is still required before any
operator repair.

Reference: ADL SCORM 2004 4th Edition RTE, Version 1.1 (2009), §4.1.1.3
collections and §4.2.2, §4.2.9, §4.2.17 SetValue error/state requirements:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Exact-head acceptance and CI are recorded in the PR/epic ledger. Required
licensed corpus/accounts, real platforms and deployment operations remain
OPEN/BLOCKED; this correction does not close epic #133.

Browser-range review correction: rollback iterates backward by index and no longer requires Array.prototype.toReversed at runtime. A pre-fix missing-method regression fails; corrected domain and built edition fixtures remove that method during refused writes and verify exact errors/count/state/retry. Installer-only Node 24 reversals are unchanged. Historical and corrected exact ESM sources remain recognized; this is feature-absence evidence, not actual Firefox/platform certification. Corrected-head CI supersedes earlier head 84262aab evidence.
