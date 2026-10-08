# ADR-107: bind packed collection indices to complete decimal tokens

Epic #133, stacked on ADR-106 / PR #175. Both pinned engines use parseInt while
traversing collection paths. A malformed token such as `0junk`, `0e1`, `0x0` or
`0` followed by whitespace therefore aliases record zero. Reads reveal the
existing record and writes silently replace its valid value instead of refusing
an undefined data-model path. The same defect affects nested collections.

`pear-indices-v13` replaces the two shared read/write index parses in each ESM
entry with a full unsigned decimal token check before numeric conversion. No
trim, prefix parse or signed alias is accepted. Undefined paths retain the
engine's existing 401 behavior. Decimal leading zeros remain compatible;
ordinary next-index appends, keywords, read/write access and out-of-capacity
integer refusal retain their existing behavior. The common engine is used by
the browser facade and trusted replay; no facade-only index filter is added.

Exact ESM SHA-256:

- 2004: `3fec364f6ea8cf9d4e5fbb226ced0646219fd456e5ae9f1bb1df0a739d826745`
- 1.2: `4d205a6b1c73d9af2b1f09b4f9a12b713cea07468b50bc3947f3c86370ce3e99`

Installation upgrades the known pristine/Unicode 1.2 sources and all known
2004 adaptations; output checksums, idempotency and unexpected input/version
refusal are tested. Known atomicity-v12 and earlier snapshot markers remain
compatible. Historical CMI keys are not repaired, canonicalized or deleted;
there is no schema migration or production change.

Eleven original tests cover three 2004 editions plus 1.2: top-level and nested
read/write alias refusal, state/count preservation, unchanged valid decimal and
large-capacity behavior, checkpoints, exact receipt retry and resume. Eight
counterexample tests fail before the correction; three valid-index baseline
tests already pass. Built pipwerks journeys exercise all four editions with
lost ACK/exact retry and close/resume.

Reference: ADL SCORM 2004 4th Edition RTE, Version 1.1 (2009), §4.1.1.3
packed-array dot notation, §4.1.1.7 integer, and collection requirements in
§4.2.2/9/17:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
This is bounded path-binding evidence, not complete conformance. Full
API/error/dependency/edition matrices, 1.2 failed-append atomicity, reference
corpus/accounts, real platforms and production operations remain OPEN/BLOCKED.
