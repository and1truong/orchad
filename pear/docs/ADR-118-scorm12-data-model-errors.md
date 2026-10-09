# ADR-118: SCORM 1.2 invalid CMI versus unsupported model errors

Epic #133, stacked on ADR-117 / PR #187. Unknown CMI paths returned 401,
including `cmi.core.zip_code`. The ADL 1.2 RTE §3.3.3 example identifies this as
201; §3.3.3 assigns 401 to unsupported optional/outside models (e.g. xyz.score.result).
Two original direct-engine/facade regressions fail before correction.

`pear-scorm12-model-errors-v20` corrects the shared 1.2 traversal classifier:
unknown paths rooted in CMI use 201; outside model roots retain 401. The public
scalar/model guard uses the same distinction for invalid internal/category paths.
Implemented optional fields retain support; this slice does not add optional
models or imply exhaustive catalog/error conformance. Typed 405, readonly 403,
write-only 404, children 202, count 203 and keyword 402 keep their meanings and
successful recovery resets error to 0. Failed collection writes still roll back.

Exact 1.2 ESM SHA-256:
`3c6715ad2bdd07c445af58d24509ded9a8388345ccc1931b5c467ccb9c8f9cec`.
2004 remains
`1755d776fb21a84a37918169e77ffe6b7c64b6b0f82052d78d08dc018fb566a1`.
Installer verifies exact v19 reviewed predecessor and historical inputs,
idempotence/unknown-byte/version refusal; known v19 snapshot markers remain
accepted. No data/schema/history rewrite or production change.

Original direct shared-engine/facade vectors cover unknown scalar/nested/next
record paths, outside roots, existing values/count preservation and typed/access
codes. Bound checkpoint/exact receipt and bootstrap preserve valid data without
invalid fields or official proof. One built journey repeats named errors with
lost ACK/exact retry/close-resume. Inherited 1.2 model-boundary, packed-index and
append refusal assertions retain their denials/count/state checks and expect the
corrected 201; their 2004 expectations remain 401. Full domain and all ten named
built sibling journeys verify the shared correction.

Reference: ADL SCORM 1.2 Run-Time Environment §3.3.3 API Error Code Usage,
201/401 examples and access/keyword distinctions:
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf
Full internal conformance, actual remaining platform evidence, licensed corpus/
account and real deployment/operations remain OPEN/BLOCKED. Native Windows failure
investigation remains at ADR-116's owner. Epic stays open/production disabled.

Full CI on 7eb4838f passed 704/704 domain but exposed one missed inherited
1.2 browser support-methods expectation: cmi.unknown still expected 401. Bind
that existing assertion/diagnostic preservation to 201 for 1.2 (2004 remains
401), and retain outside xyz.score.result 401 plus its current/requested
diagnostic preservation and successful recovery/resume. Runtime bytes are
unchanged; the first full-CI failure remains recorded (job 113493867811).
