# ADR-119: shared SCORM timeinterval lexical binding

ADL 2004 RTE §4.1.1.7 defines P/Y/M/D/T/H/M/S components: nonnegative
integer calendar/hour/minute values, centisecond seconds, at least one value,
mandatory T for time components and no T without time components. Weeks,
fractional calendar components, bare P/PT and missing T are not admitted.
The 1.2 RTE CMITimespan definition (pp. 3-30/3-58) requires 2–4 hour digits.
Primary references:
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
- https://lms.technology/for/scorm/1.2/standards/SCORM_1.2_RunTimeEnv.pdf

Upstream shared 2004 accepted malformed session/latency values although Pear's
facade/replay guarded them. Shared 1.2 also accepted wrong hour widths, including
latency checkpoints at the server. Fix both shared CMITimespan expressions;
keep seven 2004 conversion capture slots (weeks remain syntactically rejected)
so existing duration arithmetic does not shift. No extra 1.2 minute/second
range policy is introduced in this change.

Adaptation: pear-timeinterval-binding-v21. Reviewed source SHA-256:
- 1.2: eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
- 2004: 86189a9e5d9990b064f114ec7a8eecfea9ef05731ac87405e9e280b1e2a7cae1
Installer admits exact reviewed v20/v19 predecessors, historical upgrades and
idempotent current bytes; unknown bytes/version remain refused. Existing v20
sequencing markers remain admitted. No history/schema rewrite.

Eight original direct-engine/facade/durable tests retain valid zero-padding,
wide time components and fractional seconds, failed-write state, revision/time/
receipt/proof atomicity. Before correction: 3/8 pass, five regressions fail.
Existing four-profile built session-time journeys now verify rejected invalid
session/latency values and unchanged durable latency before existing correction/
close/resume/total-time assertions. Complete new-head CI remains required.

365/30 calendar conversion remains an explicit bounded policy, not reference
conformance. Exhaustive field/error/precision/overflow/cross-field reference
matrix, actual remaining platforms and all-egress/operations remain OPEN;
licensed corpus/Rustici and missing actual Safari/Android require external
access. Epic #133 remains open and production disabled.

Completed local validation on the v21 tree: 14/14 focused, 712/712 full
domain across 104 isolated files with complete TAP and zero skipped/cancelled,
Pear build/typecheck/vendor, four updated built session-time journeys and
four built native-fixture preflights. Coconut IPC initializer followup is
merged from its owner; 59/59 Coconut tests pass. Actual native/head CI is
pending and supplemental Chromium is not native platform evidence.
