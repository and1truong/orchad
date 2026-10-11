# ADR-155: XML decimal and nonnegative-integer import binding

Status: implemented; local evidence complete with full-browser failures retained; owner-head CI/review pending.

IMS Simple Sequencing XML Binding1.0 table4.3 binds measureThreshold and
minNormalizedMeasure to decimal[-1,1], minimumPercent and objectiveMeasureWeight
to decimal[0,1]. Tables3.5/3.7/3.9 bind attemptLimit/minimumCount/selectCount to
nonNegativeInteger. W3C XML Schema1.0 Part2§3.2.3/3.3.13/3.3.20 admits optional
signs/leading zeros, decimal points only for decimals, and negative zero for
nonnegative integers; §4.3.6 collapses only XML whitespace. Fourth-edition CAM
completion minProgressMeasure/progressWeight are decimal[0,1]. Sources:
- https://www.imsglobal.org/node/52631
- https://www.w3.org/TR/xmlschema-2/#decimal
- https://www.w3.org/TR/xmlschema-2/#integer
- https://www.w3.org/TR/xmlschema-2/#nonNegativeInteger
- https://www.w3.org/TR/xmlschema-2/#rf-whiteSpace
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_CAM_20090814.pdf

Predecessor2283f65b8a5 probes retain0PASS/4FAIL for spaced integer/completion
attributes;1PASS/6FAIL for NBSP text and legal signed/zero-padded completion
forms;0PASS/9FAIL for wrongly admitted integer3.0, decimal rounded above1 and
negative underflow rounded to zero. Logs scorm-xml-numeric-before.log,
scorm-xml-decimal-lexical-before.log and scorm-xml-numeric-boundaries-before.log
and their standalone probes remain in /workspace/scratch. Negative-zero bit
identity is not a conformance claim; the committed tests assert numeric values.

Reuse the shared XML atomic token normalizer for sequencing and package booleans
and numbers. One decimal/integer parser removes outer XML whitespace only,
rejects internal/non-XML spaces/exponents/decimal syntax for integers, and checks
integral limits before floating conversion so tiny excesses/negative underflow
cannot cross admitted bounds. Existing10000 integer and2048 selection ceilings
remain explicit. Numeric execution still uses JS double precision; arbitrary
precision, full schema/token/calendar/duration validation remains OPEN.

Translate completion threshold to canonical numeric CMI text after validating
XML decimal. The first focused run completes36PASS/4FAIL: three new positive
fixtures targeted rollupCondition instead of ruleCondition (fixed fixture),
and a real fourth-edition bootstrap refused accepted+000.50 with CMI type
mismatch (fixed translation). Original authored manifest/ZIP bytes and hash
remain unchanged; no engine adaptation, receipts/history/proof rewrite, quota,
time-budget or retry change. Source lock remains pear-uri-authority-v40,
SHA2569ba7375b3f88be0bf54cf02ed4220346f5fbee12de8fa23ac723ba6fe0d0d35c.

Named14 domain tests cover all three editions, legal whitespace/sign/leading
zeros, exact intervals, invalid integer syntax, used/unused groups, immutable
XML bytes, real host bootstrap, exact checkpoint receipts/retry, resume and
exactly-one authoritative proof. Combined numeric14/boolean26 focused completes
40PASS/zero fail/skip/cancel exit0 with explicit NODE_EXIT=0. An earlier40PASS
footer accompanied a wrapper exit1; it is retained and not used as exit0 proof.
Fresh full domain completes907/907 across129 files: every per-file plan/footer,
all five counts and exit0 inspected; aggregate exit0. Typecheck/build exit0.

Expanded existing choice3/weighted1/selected-pool3 built journeys complete7PASS
exit0, preserving lost ACK/exact retry/Close/resume/navigation/rollup/proof
checks. Actual native2004 fixture manifest now includes spaced+0003 attemptLimit;
existing22 checks and four-edition supplemental browser/native gates remain.
Full172 local browser acceptance and current-head all10 CI/log/review pending.
Chromium151 is supplementary; Playwright expected153 install blocked CDN403.
No clean full local browser claim, and no generic driver-cause inference.

Parent22704e2995a READY: all10 CI/logs867/237dev/237built/SidePanel4/native2004=22.
Parent2268f706306 READY: latest unchanged Windows-only retry, all10 logs855/
237/237/4, runtime16/Pear13/1.2=13/2004=21 and five clean exits/ACKs perOS.
Original Windows fixture forced shutdown after app-closed is retained/unattributed;
original19c4 Pear25minute cancellation retained. Scheduling-only35minute ceiling
does not establish a cause or fix for the separate shutdown. Parent228 owner-head
CI/reviews still pending; descendant evidence never replaces an owner's gate.

Full mandatory XML/numeric/SPM/history/API/error/URI/sequencing/operations and
reference corpus matrices remain OPEN. Authorized exports/license/Rustici
account/Safari/Android/production inputs remain BLOCKED. Epic133 OPEN;
production DISABLED.

Follow-up notation probes retain0PASS/1FAIL for+000.0000001 completion
converted to1e-7 and0PASS/3FAIL for three-edition small scaled-passing-score
bootstrap. Keep validated completion decimal text, remove plus/redundant integral
zeros/trailing dot, normalize negative zero; do not round through Number/String.
Host normalized measure uses explicit en-US/no-grouping/significant-digit number
formatting to retain the existing JS-double value without an exponent. Expanded
choice3 and weighted1 exercise small decimals; actual native manifest includes
spaced small primary minNormalizedMeasure as well as+0003 attemptLimit.
New signed small-score domain3 expands numeric17/boolean26 focused to43PASS,
zero fail/skip/cancel exit0. Updated build/typecheck complete exit0.
The earlier907 domain/build/browser results describe the earlier tree. During
its full-browser run the server notation/build changed; that run is retained
but is not an exact final-tree full acceptance result. Fresh final full domain/
browser is required. Intermediate38PASS/2FAIL retained: thresholds with20
fractional digits are admitted by XML but the shared engine's18-digit decimal
lexical ceiling still refuses bootstrap. This is an explicit internal OPEN bug
for the next engine slice, not an external blocker or clean conformance claim.

Final domain910/129files completes all plans/footers/exits and aggregate exit0.
Expanded native test1PASS/3FAIL retained: adding a primary objective populated
CMI objective data, contradicting the existing absent-collection fixture; trace
pageError explicitly says Absent collection value. Remove only this added
objective from that fixture, retain the spaced integer definition and all
absence/lost-ACK/retry/resume/native assertions. Small passing-score binding
remains in built choice3 and domain3; no product guard or budget weakened.
Fresh native4/full browser and final fixture-dependent domain verification follow.

Corrected native4 completes PASS exit0 (26.9s). The sole domain file depending
on the native fixture, native-fixture-lifecycle.test.ts, revalidates5PASS exit0
(4.7s) after its manifest correction; remaining905 tests/128 files unchanged
from fresh full910/129files. Final expanded built7 PASS exit0; build/typecheck
exit0. Full172 final browser uses one fixed build/source throughout, pending.
Parent2283f65b8a5/run37895406184 now READY: all10 SUCCESS jobs/logs893 domain/
237dev/237built/SidePanel4 and host lanes; threeOS runtime16/Pear13/1.2=13/
2004=22, five clean native/fixture exits and quitAcknowledged perOS, no forced
shutdown, fresh owner head and no unresolved reviews. Historical/local failures
remain separate. Precision successor original6FAIL/prototype6PASS retained;
prototype is not product/browser/native acceptance.

Exact final-tree full172 SCORM browser completes169PASS/3FAIL exit1 (7.4m):
2004-4 support download deadline, managed ServiceWorker permission denial,
2004-3 Retry DOM.describeNode/internal server error/session closed. Every trace
inspected; cause unproved beyond these observations. All changed numeric7 and
native4 journeys pass in full. Historical mixed-build172=168PASS/4FAIL retained,
not final-tree evidence. Current local validation: full910/129files plus affected
fixture5 revalidation, focused43, expanded built11, typecheck/build complete
exit0; no clean full local/browser/platform conformance claim. Current owner-head
CI/all10 logs/native threeOS22 and fresh reviews remain required before READY.
No deadline/assertion/retry/envelope change. Next internal decimal precision and
exact runtime boundary probes reproduce6FAIL+6FAIL; prototype9PASS is diagnostic
only and does not replace product acceptance. Epic OPEN; production DISABLED.
