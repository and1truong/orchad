# ADR-114: clear earlier errors on successful derived reads

Epic #133, stacked on ADR-113 / PR #183. Completion/success status reads use
engine early-return handlers. They return valid strings but retain the previous
403/405/406 error, so content correctly consulting GetLastError treats a successful
read as failed. Three original edition regressions fail before correction.

`pear-derived-read-errors-v18` resets the shared 2004 GetValue error once after
lifecycle checks, before special model handlers. It replaces the narrower reset
inside target validity with this common reset. A later refused read still sets
its own error; before-init/after-terminate 122/123 retain precedence. Support
lookups do not change the prior error. CMI values, derived threshold evaluation,
queue/receipts and navigation remain unchanged. The 1.2 ESM is unchanged.

Exact 2004 ESM SHA-256:
`dbc20732465b9b4ffce672ac11a5d5dee48384d4f0beabf562c00215cf051281`.
1.2 remains
`220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32`.
The checksum installer tests exact predecessor v17 reviewed bytes and historical
inputs, idempotence and unknown-byte/version refusal. Known v17 snapshot markers
remain accepted; no schema/data rewrite or production change.

Original three-edition vectors place 401/403/405/301 reads and invalid status
writes before completion/success reads, preserve error through support lookups,
check unknown and completed/passed values, exercise trusted completion/passing
thresholds and retain lifecycle errors. Three built journeys repeat read/error
recovery through actual content API, durable lost ACK/exact retry and close/resume
without official proof. Full API/error/edition conformance remains OPEN.

Reference: ADL SCORM 2004 fourth-edition RTE §§3.1.7, 4.2.4, 4.2.22, successful
GetValue and completion/success evaluation requirements:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
Licensed corpus/account, actual additional platforms and deployment isolation/
operations evidence remain OPEN/BLOCKED; epic open/production disabled.
