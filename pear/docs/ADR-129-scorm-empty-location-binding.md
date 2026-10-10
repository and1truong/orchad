# ADR-129: Empty opaque locations and comment records

ADL2004 RTE4.2.2 and4.2.14 permit opaque empty location strings. Shared
setters refused clearing cmi.location and comment location; truthy-only JSON
loading and the server's unset-default optimization also discarded records
whose only supplied value was an empty comment/location.

Checksum-locked pear-empty-location-binding-v27 permits empty locations in
the existing two typed setters, restores explicitly supplied empty location
and comment fields, and replays empty learner comment records through the
existing shared validator. Read-only LMS comments, packed indices, Unicode
bounds, identity and transactional history guards remain. Empty timestamp,
identifier and numeric defaults are not broadened. Known v26 sequencing and
exact installer histories accepted; SCORM1.2 bytes unchanged. 2004 SHA256:
400811138e860165b56b9444bf5dbeeb65c5fc46c5cf37a88ac34ade7b2c4571.

All six original regressions failed before correction. After setter/loading
repair, three replay cases exposed dropped empty records; retain those failed
logs. Corrected focused50/50, fresh full domain734/734 across106 files, build
and three built read-only-comment/empty-location journeys completed with exit0.
Direct shared/facade, preloads and durable replay/retry/close-resume assert
original empty values/counts and unchanged revision/receipt/proof on refusal.
First browser run retained a fixture mismatch: its Save button authored
licensed-page after clearing. The scoped fixture now saves the empty bookmark
through the same licensed wrapper; existing assertions remain.

ponytail: existing serialized CMI exposes field values rather than a durable
per-field initialized/unset ledger. Explicitly supplied empty location/comment
JSON is restored as a value; exhaustive absent-versus-default history semantics
remain OPEN and require reviewed presence persistence if needed. No schema or
historical rewrite and no production enablement. Exact-head full CI/native and
review remain required; all remaining internal/external gates stay registered.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
