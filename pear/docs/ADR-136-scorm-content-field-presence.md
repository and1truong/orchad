# ADR-136: Shared content field presence

Six original three-profile regressions expose untouched location/suspend_data
being serialized as defaults, and explicit suspend_data blanks lost on loading.
An unset GetValue must return empty with403; a supplied empty string returns0.
ADL2004 RTE4.2.14/4.2.23 require opaque content storage without interpretation.

Checksum-locked pear-content-presence-binding-v32 leaves CMIContent location
and suspend_data undefined until set, including reset. Root CMI getters check
absence only when initialized outside root jsonString serialization. The root
owns serialization; its flag is not propagated to CMIContent. Shared loading
and typed server replay now retain explicit empty content strings. Existing
Unicode/edition capacity guards, read-only fields and transaction guards remain.
No schema, new presence ledger, dependency or historical record rewrite.

Known v31 sequencing markers and all historical byte-locked installation paths
remain accepted; SCORM1.2 bytes unchanged. 2004 SHA256:
5020b23897cbf8bca9c4e6ae71633cc6df6389dd70d6f593318bd4ab19f2c6e7.
ponytail: old snapshots with explicit blanks lack their original presence
provenance; preserve supplied values. Full field/provenance conformance remains
OPEN rather than retrospectively guessing whether an old blank was a default.

Original6/6 failed. First focused run retained one sequencing assertion expecting
a fabricated default location; replacement tests stored omission and403 after
restore, while retaining audit rollback, navigation denial and time assertions.
First build failed two test-only unknown snapshot types; corrected typed casts
preserve every assertion. Final focused106/106, fresh full domain764/764 across111 files and build
completed with exit0. Full browser127 completed114PASS/13FAIL, exit1; retained failures include
pipwerks2004-4 download, two 1.2 learning cases, player and nine sequencing
cases. Separate new built content journeys3/3 completed exit0. Exact unchanged
failed-case rechecks are running in fresh browser processes; do not claim full
browser PASS;
full new-head CI/native/actual Side Panel/review remains required. Epic open;
production disabled.

Reference: https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf.
