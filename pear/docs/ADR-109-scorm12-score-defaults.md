# ADR-109: initialize SCORM 1.2 scores with blank components

Epic #133, stacked on ADR-108 / PR #178. The pinned 1.2 score constructor
supplies a maximum of 100 without a content write, and reset retains an old
maximum after clearing raw/min. ADL RTE recommends blank initial score
components, including supported optional core/objective min/max. Returning 100
therefore conflates an engine convenience default with a reported maximum.

`pear-scorm12-score-defaults-v15` corrects the shared 1.2 score constructor's
fallback to blank and resets max together with raw/min. Explicit constructor
values and trusted preload remain exact. The same score class serves core and
every objective; no facade or individual-field special case is introduced.
The already tested 2004 ESM bytes remain unchanged.

Exact ESM SHA-256:

- 1.2: `220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32`
- 2004: `0fcfd491141495491caeb8dcc334d68a1dd407fb0c6f15c0747438a7902c1fa9`

Known atomicity-v14 and earlier sources/snapshot markers remain compatible.
Installer verifies both exact outputs, historical upgrades, idempotency and
unknown-byte/version refusal. Existing saved maximum values, including 100,
are preserved; no historical inference, rewrite, migration or production change.

Three original regressions fail on the old engine and cover fresh core/objective
raw/min/max, explicit set/clear, reset, trusted preload, bound checkpoint/exact
retry and resume followed by reporting a maximum. A built pipwerks journey
checks initial blanks, content-reported maximum values, lost ACK/exact retry and
resumed values without issuing an official proof.

Reference: ADL SCORM 1.2 RTE (2001), §3.4.4 CMI data model, core score
(RTE-3-28–30) and objectives score (RTE-3-39–41):
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf.
This follows the reference's initialization recommendation; optional-field
support, full score/error/default/edition conformance and every corpus/account/
platform/deployment gate remain separately tracked in the completion register.
