# ADR-105: initialize preloaded CMI collections and preserve read-only counts

Epic #133, successor to ADR-104 / PR #172. The pinned engine initializes a CMI collection
without initializing its preloaded records. Its LMS-comment setters therefore
permit content to change a loaded comment/location/timestamp after Initialize,
while a freshly created record correctly reports 404. Trusted server replay
already rejects altered LMS-owned leaves, so this creates browser/server
behavior disagreement and misleading synchronous success.

The checksum-locked `pear-initialization-v11` adaptation initializes each child
when CMIArray is initialized, using the engine's existing nested initialize
methods. No parallel facade validation is added. Existing dependency/read-only
checks now apply to both loaded and newly created objects. Trusted pre-init
loadFromJSON remains allowed and still validates typed values.

A related counterexample creates a new empty LMS-comment record before its
setter rejects a content write, increasing _count after error 404. Reject
content-owned LMS-comment creation in the existing engine child factory before
append; leave trusted preload unchanged. Thus valid, invalid, empty and
malformed-surrogate writes all preserve the existing trusted values and count.

Exact ESM SHA-256:
`03213a703fe000cdf1ed1bb531f4f67dca0b68fb6f5d57f587ebd2c8ac2c1be3`.
Known timestamps-v10 and earlier sources/snapshot markers remain compatible.
Installation verifies input/output hashes, idempotency and unknown-byte/version
refusal. No schema migration, stored-data repair or production enablement.

Nine original three-edition regressions fail before the correction and cover
pre/post-session error precedence; all three LMS comment leaves, absent records
and unchanged count; writable preloaded learner/interactions/objectives/nested
patterns; reset/reload; immutable IDs; trusted server refusal, receipts and
close/resume. Three built pipwerks journeys cover the same sync API behavior,
private original values, dropped ACK/exact retry and resumed read-only records.

Reference: Advanced Distributed Learning (ADL), SCORM 2004 4th Edition RTE,
Version 1.1, 2009, §4.2.3 (Comments From LMS) and §4.1.1.3 (Collections):
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
Current-head CI and all unfulfilled conformance/reference/platform/production
acceptance remain required. This correction does not close DM-03 or epic #133.

Review correction: known comment/location/timestamp leaves on absent LMS rows retain 404; undefined leaves return 401 before any append, matching existing rows. Skipped packed indices retain their distinct 351 behavior. Three original regressions and built edition vectors cover values/count preservation. Exact reviewed output is checksum-locked; historical engine inputs remain accepted through reversible known-byte correction. Full corrected-head CI is required; earlier be0b27d5 evidence is historical.
