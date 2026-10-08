# ADR-111: expose scalar data-model elements, not engine internals

Epic #133, stacked on ADR-110 / PR #180. The engine's generic property traversal
returns live CMI/settings objects and methods for category/helper names, and
accepts writes to backing fields such as cmi.core._student_id. The eight-method
surface alone therefore does not keep engine helpers out of content reach.
Host typed replay already restricts fields and protects identity; this correction
closes the independent synchronous browser API path.

One shared model-path guard admits cmi/adl paths and public _children/_count/
_version keywords while rejecting backing fields and non-model engine roots.
Both adapters require GetValue's result to be a string. SetValue first checks
the existing engine read result's type to refuse live objects/methods before the
setter can replace them. Write-only scalar reads return an empty string with an
error; the actual setter resets that intermediate engine error normally, so
valid session-time/response writes and new collection records remain usable.
Model-category/engine/private paths return empty/false with the existing 401
unsupported-element binding and preserve state. Empty arguments retain ADR-110's
edition-specific behavior. This gate does not inspect or rewrite content values.

Exact v15 ESM entries, adaptation markers and trusted snapshot loading remain
unchanged. Twelve original domain regressions fail before correction, covering
all four profiles: object/function/private reads, denied object/method/private
writes, unchanged identity/snapshot, valid public keywords/read-only setters/
write-only fields/new collections, and bound exact retry plus atomic host refusal
of forged backing fields. Four built pipwerks journeys repeat denial through the
actual SCO API, then persist with lost ACK/exact retry and close/resume without
an official proof.

References: ADL 1.2 RTE §§3.3.2–3.3.3 (string API/data model) and 2004 RTE
§§3.1.5, 3.1.7, 4.1–4.2:
https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf

This is a model-access correction, not sandbox/all-egress isolation or full
error/field certification. Host server validation remains mandatory. SCO code
still shares the fixture engine origin; platform/deployment/credentials/network
isolation and licensed reference/commercial gates remain OPEN/BLOCKED. No schema,
historical rewrite, new credentials/capability or production enablement.
