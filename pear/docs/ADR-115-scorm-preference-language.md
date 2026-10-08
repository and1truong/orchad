# ADR-115: shared SCORM 2004 preference language binding

Epic #133, stacked on ADR-114 / PR #184. The engine rejects valid multiple
subcodes (`vi-VN-x-demo`) but accepts a malformed doubled separator (`en--US`).
Six original three-edition regressions fail before correction; the independent
1.2 plain characterstring control passes.

`pear-preference-language-v19` updates shared CMILang to admit multiple 1–8
ASCII letter/digit subcodes, a 1–8-letter primary code and total SPM 250. Matching
consumes the complete input, preserves case/exact text and rejects empty subcodes,
underscores, overlong parts/capacity and trailing characters/newlines. The
learner-preference setter permits its specified empty default/clear. The same
lexical predicate serves localized strings; registry membership/equivalence
validation remains OPEN and is not an external licensing blocker.

Exact 2004 ESM SHA-256:
`1755d776fb21a84a37918169e77ffe6b7c64b6b0f82052d78d08dc018fb566a1`.
1.2 remains
`220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32`.
Checksum installation covers exact predecessor v18, historical reviewed inputs,
idempotence and unknown-byte/version refusal. Known v18 snapshot markers remain
accepted. Legal historical preferences retain exact bytes; malformed historical
language fails closed rather than being rewritten. No schema/data migration or
production enablement.

Original domain vectors cover multiple subcodes/case/private capacity, malformed
refusal without mutation, pre-init load/empty clear, bound replay, exact receipt
retry and forged invalid replay without history/proof. Three built browser
journeys exercise actual content API, lost ACK/exact retry and close/resume with
250-character persisted preference and no official completion proof. These named
vectors do not establish exhaustive language/field/edition conformance.

Reference: ADL SCORM 2004 fourth-edition RTE §§4.1.1.7 (language_type), 4.2.13
(learner preference language, empty default, SPM 250 and 406 invalid binding):
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Licensed corpus/account, additional actual platforms and deployment evidence
remain OPEN/BLOCKED. Epic open/production disabled.
