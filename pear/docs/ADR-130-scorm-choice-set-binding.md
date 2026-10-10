# ADR-130: Shared choice correct-response set uniqueness

ADL2004 RTE4.2.9.1 requires unique choice correct-response sets and makes
member order insignificant. The engine compared strings only on append;
reordered duplicate sets and duplicate replacement of existing patterns passed.
All six original three-profile regressions failed before correction.

Checksum-locked pear-choice-set-binding-v28 compares exact bracket-delimited
members with the standard Set at the existing shared validator and checks
every typed set/load path before mutation. A duplicate across indices returns
351 without appending/replacing; invalid pre-init duplicates throw. Same-index
reordering remains legal and retains original authored bytes. Repeated members
still produce406 through the existing typed predicate; matching bags retain
permitted repetitions. Bare commas and percent-encoded identifiers remain data.
URI/URN equivalence and exhaustive response/edition semantics remain OPEN.

Known v27 sequencing and exact historical installers remain accepted;
SCORM1.2 bytes unchanged. 2004 SHA256:
23fc451fff5e7e78919c772419866cb62f7c1174f470ff7940a61eebfc458158.
Legal history is not normalized; invalid duplicate history fails restoration
rather than being silently rewritten. No schema migration or production change.

Completed local evidence: focused34/34, fresh full domain740/740 across107
files, build and all three built URI/full-capacity choice journeys, exit0.
Direct shared/facade and preloads, forged append/replacement replay, unchanged
count/state/revision/receipt/proof, exact retry and close/resume are asserted.
Built journeys retain previous URI/capacity tests and prove authored order,
refused append/replacement and persisted two-pattern count through lost ACK.
Exact-head full CI/native/review remain required; epic open/production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
