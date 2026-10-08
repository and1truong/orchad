# ADR-112: bind navigation targets as authored values

Epic #133, stacked on ADR-111 / PR #181. A valid authored activity ID containing
periods/internal-name tokens was mistaken for a property path. The engine also
required an ASCII letter/digit suffix, so an ID ending in Unicode could be read
but not submitted as a choice request. Three original edition regressions fail
before correction; actual built choice delivery exposes the second failure.

`pear-navigation-targets-v16` corrects the shared 2004 validity/request/target
bindings. Target strings stay intact inside their delimiter; full-input matching
refuses extra suffixes/newlines outside it. Model-path filtering delegates the
choice/jump validity family to this scalar-only engine handler, so target text
cannot expose helpers, categories or backing fields. Valid reads clear stale
errors; malformed/missing validity delimiters return false/301 and writes return
false/404 without changing the tree. Unknown targets return false/0. Existing
choice prediction and authored sequencing gates remain authoritative; this does
not certify every prediction, jump rule, default or cross-edition trace.

Exact 2004 ESM SHA-256:
`a8d9018516119e5180c5cccd9931bb8b56335f3c282c0367cfe116e73d420007`.
The 1.2 ESM remains
`220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32`.
The existing reversible checksum installer recognizes the exact previous reviewed
2004 source, historical stages and this output; modified bytes/version are still
refused. Installer regressions explicitly upgrade predecessor reviewed bytes.
Known v15 snapshot markers remain supported; unknown markers remain refused.
No schema migration, historical rewrite, credential, capability or production change.

Original three-edition domain vectors cover intact dotted/Unicode targets,
read-only state/error recovery, missing targets, malformed delimiters, strict
request suffixes and earlier-edition jump refusal. Three built journeys repeat
those checks, then lost ACK/exact receipt retry, close/resume and actual choice
delivery to the exact authored ID without official completion proof.

Reference: ADL SCORM 2004 fourth-edition S&N §5.6.7 / Table 5.6.7a, choice/jump
characterstring target delimiters and API requirements:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_SN_20090814.pdf
No legacy suite code or commercial package was imported. Exhaustive conformance,
licensed reference/commercial inputs, actual additional platforms and deployment
isolation/operations acceptance remain OPEN/BLOCKED; epic open/production disabled.
