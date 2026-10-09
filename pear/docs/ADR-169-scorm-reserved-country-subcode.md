# ADR-169: shared reserved country subcode refusal

Status: implemented; full local acceptance and own exact-head CI pending.
Epic #133; stacked on PR243 exactb4a4378d (ADR168/v45).
Original unchanged-v45 six-field/raw+facade/three-edition36 tests0PASS/36FAIL
exit1 establishes en-ZZ admission after valid en-US/eng-GB/fre-FR/private x-ZZ/
historical i-klingon-ZZ/additional en-US-ZZ controls. Independent boundary probes
AA/QM/QZ/XA/XZ/ZZ × raw/facade/three editions36tests0PASS/36FAIL exit1 retained.

RFC3066 §2.2 explicitly prohibits user-assigned country codes AA/QM–QZ/XA–XZ/ZZ
in language tags (42 codes). ADL third RTE1.0 §4.1.1.7/fourth RTE1.1 §4.1.1.7
require two-letter country subcodes; second addendum1.2 §2.9 references RFC3066.
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf
Exact original legacy RTE remains unresolved; no all-errata/conformance claim.

One negative lookahead in the existing installed shared primary token refuses
only these first ISO country subcodes, including mixed case and ISO three-letter
primaries, across all six writable patterns. Registered historical i/private x
and undefined later subcodes retain exact lexical binding. No blanket modern
BCP47 rewrite, runtime registry fetch, dependency, capture/capacity/blank-language
change. General country membership, registered3–8-letter subcode semantics,
equivalence/exhaustive edition/SPM combinations remain OPEN. This concrete guard
is independently implementable without external licenses/accounts.

Checksum-locked pear-reserved-country-subcode-v46 SCORM2004 ESM SHA256
4ad1c795e60362bd73c3826f80a1a0ed2202185a5a98a4559328361dd6f4659b;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Exact single forward/reverse pair restores v45 62d0e923, all old
installer pins/current and historical inputs/idempotence/refusals retained.
Trusted v45 envelopes accepted; invalid state fails closed without rewriting.
42 factual codes/source appended to the existing factual JSON for native/browser/
domain controls; installer regex uses the source-backed fixed ranges.

Nine domain tests exercise all42 codes × six fields × ISO two/three/local-use
primaries × raw/facade × three editions, whole-state406 rollback; strict preload
including readonly LMS-comment; typed forged rollback/exact receipts/SQLite
close-reopen/v45 resume/no official proof or certificate. Private x-ZZ,
registered i-klingon-ZZ, ordinary en-US-ZZ additional subcodes and exact case/text
retained. Existing built3/native4 retains every old absence/capacity/ISO/IANA/
recovery/proof guard. Native valid en-US control restores prior I-MINGO text
before42 atomic refusals and checks unchanged durable resume; adds one genuine
named native check. Counts become16/13/13/27/27/28; own OS logs required.

Separate pre-branch candidate syntax/exact forward+reverse bytes and1512 raw
atomic refusals across two constructors/six fields checked, not accepted-tree
full validation. Accepted tree typecheck/build exit0 and controller/engine syntax/
current hashes verified. Focused/full domain/browser pending until full completed
footers/counts/exits/traces inspected. Parent2429dd6 own9/10/latest native logs,
Pear pending; parent243b4a4 ownCI running. #222e2b ownCI absent/Draft, historical
10dc not current proof. Local Chromium151 supplemental; supported153 CDN403.
License/authorized exports/Rustici account/actual Safari+Android/reviewed prod
inputs BLOCKED. Epic OPEN; production DISABLED.

Accepted v46 focused108PASS/zero fail/cancel/skip exit0(72.9s) completed, including all42 reserved country values, strict preload/typed atomic rollback/v45 SQLite resume and all installer historical pins. Typecheck/build completed exit0. Factual repository JSON SHA256d869eca6ee1ba3ed9b60ca08b3366213cab66e7a23ad588a8a67674b0de38882 (not network byte hash). Built/native/full domain/full browser still running or pending; no pending PASS.

Accepted v46 supplemental built3/native4 completed7PASS exit0(35.9s), all old ISO/IANA/absence/capacity/recovery/proof guards retained. Fresh full1056PASS/141files aggregate exit0 completed; every exact filename/plan/full footer/five counts/per-file exit0 inspected, zero fail/cancel/skip. Fixed full172 browser now running; no pending browser PASS. Support-click diagnostics isolated outside accepted tree, not a country guard change; initial wrong-cwd invocation exit127 retained as invocation failure, not regression proof.

Accepted v46 fixed full172 browser completed165PASS/7FAIL exit1(8.4m); all seven complete trace/network streams and contexts inspected. Changed built3/native4 all7PASS within full. Failures: fourth-edition support download60s timeout; managed ServiceWorker enumeration denial; fourth-edition navigation target plus second/third/fourth retry and third retryAll heading visibility with DOM.describeNode/session-closed diagnostics (causes unproved). Intermediate poll mismatches are not independent causes. No clean full browser claim or assertion/deadline/policy relaxation.

Separate exact-journey pointer diagnostic reproduced support download1FAIL/exit1 with click delivered to SCO HTML and no diagnostics request. Explicit scrollIntoViewIfNeeded + toBeInViewport yielded1PASS/exit0 with top-level BUTTON delivery, validated download packet, close/resume/Finish intact. This candidate remains outside accepted country tree and proceeds as a separate successor; no retrospective cause claim for every historical timeout. Parent242 now READY after own10 SUCCESS/latest full logs/exact head/fresh reviews; parent243 own9/10 SUCCESS with three native OS clean, Pear pending. Own country CI/review gate pending. Epic OPEN; production DISABLED.
