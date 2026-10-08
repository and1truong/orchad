# ADR-120: shared URN namespace/NSS binding

ADL 2004 RTE §4.1.1.7 requires URI identifiers and cites RFC 2141 for URNs.
RFC 2141 §§2–2.4 requires case-insensitive urn prefix, nonempty NID/NSS,
1–32 ASCII alphanumeric/hyphen namespace characters with an alphanumeric
first character and reserved namespace urn refusal. NSS excludes raw &/~
and other excluded characters; percent triplets remain required. Reserved
/?# are SHOULD NOT, not MUST NOT, and are retained; namespace-specific escape
rules, decoded UTF-8 and equivalence/uniqueness still need separate evidence.
Primary sources:
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
- https://www.rfc-editor.org/rfc/rfc2141

Existing generic URI character checks accepted malformed URN names/NSS in
IDs and all identifier-valued learner/correct response formats. Extend only
the shared short/long identifier regexes with conditional URN binding. Existing
non-URN grammar and exact case/percent strings are unchanged; format references
also cover choice, matching, sequencing, likert and performance step names.
The 1.2 entry is unchanged. All six original pre-fix tests fail.

Adaptation pear-urn-binding-v22, 2004 source SHA-256
2d934ecb704315c2b24f6ecc782624d3ba266feec5f870f542f37bc504eb8601.
1.2 retains v21 source eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.
Installer admits exact reviewed v21 and all known historical inputs, checks
idempotence and refuses unknown bytes/version. Known v21 snapshot markers remain
readable, without schema/history rewrite. Invalid stored URNs are refused
through load setters; valid original values are not rewritten.

Six direct-engine/facade/preload/replay/receipt vectors plus the existing three
built identifier journeys retain count/state/receipt/proof refusal and exact
case/escape values through ACK loss/retry and close/resume. Complete new-head
CI remains mandatory. Full RFC component/authority/edition-specific IP grammar,
namespace/UTF-8/equivalence and full response/conformance remain OPEN. Actual
platform, strict all-egress, licensed corpus/Rustici and production operations
gates remain required; epic stays open and production disabled.

Completed local validation: 13/13 focused, 718/718 full domain across
105 isolated files with complete TAP and zero skipped/cancelled, build/typecheck/
vendor and all three updated built identifier journeys. Those journeys preserve
URN strings plus the full 144105-character choice state through post-commit ACK
loss, identical retry, close/resume and zero official proof. Actual new-head full
CI/native acceptance remains pending.
