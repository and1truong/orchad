# ADR-134: Shared objective and interaction description presence

RTE4.2.9/4.2.17 descriptions have no default. Original three-profile shared,
preload and durable vectors distinguish supplied empty descriptions0 from
unset descriptions403; reading beyond their record count returns301. All six
original regressions failed: the loader skipped supplied blanks and snapshots
fabricated blank descriptions for untouched records.

Checksum-locked pear-description-presence-binding-v30 uses undefined defaults
and the existing initialized/jsonString getter path in both shared record models,
including reset. JSON omits unset descriptions and preserves explicit blanks.
The existing shared loader admits supplied empty descriptions, and server typed
replay applies them instead of skipping absent-baseline empties. Recognized
missing description records return301; other collection fields remain unchanged.
No extra presence ledger, schema, dependency or historical inference is added.
Dependency408 and malformed-Unicode406 retain counts/values/absence. Standard
objectives' unknown status defaults and score/progress behavior remain unchanged.

Known v29 sequencing envelopes/historical installer sources are retained.
2004 SHA256: bb1e42b70479ed21a68fc99f5b25a6dc875975d4336b6db0be23115c3aedd8ba.
1.2 bytes stay unchanged. Preserve explicit historical serialized descriptions as
values; full other-field presence, global-objective/edition authority and the
remaining SCORM-CONFORMANCE clauses remain OPEN.

Focused88/88 including sequencing, system objectives, installer history and
operations completed exit0; build completed exit0. Fresh full domain752/752 across109 files and all three extended built
comment/description ACK/retry/close-resume journeys completed with exit0.
They preserve the original comment/read-only assertions and prove description
blank0/unset403 before and after resume, malformed-write/dependency rollback
and stored omission with unchanged revision/receipt/count/proof. Require exact-head full CI/native/review before broader acceptance.
Epic remains open and production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
