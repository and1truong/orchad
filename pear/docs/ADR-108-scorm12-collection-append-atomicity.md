# ADR-108: SCORM 1.2 failed collection writes preserve record counts

Epic #133, stacked on ADR-107 / PR #177. The 1.2 ESM entry has the same early
collection append defect corrected for 2004 in ADR-106. Invalid objectives and
interactions return 401/405 while appending empty records and increasing _count.
Typed nested records are also affected.

`pear-scorm12-atomicity-v14` applies the same bounded shared traversal journal
to the 1.2 entry: retain only encountered collection lengths and restore them
in reverse order unless the setter succeeds, including thrown validation
errors. Existing values, write-only interaction access, valid next-index writes
and synchronous error classification remain unchanged. The 2004 entry retains
its already tested v13 bytes.

Exact ESM SHA-256:

- 1.2: `92c02b812c6e7e3e8a0cd161d23e1aeb3319f4c124523e6df6d7ccff65e73d82`
- 2004: `0fcfd491141495491caeb8dcc334d68a1dd407fb0c6f15c0747438a7902c1fa9`

Installer accepts the known pristine/Unicode/indexed/atomic 1.2 sources and
known 2004 adaptations, with exact output checksums, idempotency and unexpected
source/version refusal. Known indices-v13 and earlier snapshots remain
compatible. No historical empty-record cleanup, schema migration or production
enablement.

Four original tests cover first/next/nested append refusal, existing records,
typed range/unknown fields, repeated errors, successful retry, trusted preload,
bound SQLite checkpoints, exact receipt retry and close/resume. Three fail on
the previous engine; the trusted-preload control already passes. The built 1.2
pipwerks journey checks synchronous value/count preservation, lost ACK and
retry/resume; the four index journeys remain regression coverage.

Reference: ADL SCORM 1.2 RTE (2001), §3.4.4 CMI dot-notation binding,
objectives and interactions _count/SetValue behavior (RTE-3-37 onward):
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf. Original
tests are maintained here; no legacy CTS source is imported. Complete 1.2
method/field/default/dependency/SPM and edition-specific reference acceptance
remain OPEN. This correction does not make existing-leaf writes or sequencing
side effects transactional, repair historic records, certify the profile, or
close epic #133.

Inherited browser-range review correction applies the backward index loop to this 1.2 sibling too. A named pre-fix missing-method test fails; domain/built fixtures remove Array.prototype.toReversed during invalid writes and verify exact typed errors, unchanged records and successful retry. Exact reviewed 1.2 ESM hash is locked; original published v14 input remains recognized. No actual Firefox/mobile/platform certification is implied.
