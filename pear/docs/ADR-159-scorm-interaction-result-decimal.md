# ADR-159: interaction result decimal fractional capacity

Status: implemented; complete local acceptance inspected; owner-head CI/review pending.

SCORM2004 RTE§4.1.1.7/4.2.9 binds interaction result to the four existing
vocabulary tokens or real(10,7). Storage precision/significant figures do not
establish an18-fractional-digit lexical ceiling: an exact half padded with
40 trailing zeroes is still exact half. Primary source reviewed:
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf

Original v41 probe on23203cd retains0PASS/6FAIL exit1 across all three editions,
raw engine and facade. Numeric learner/endpoint values pass before the result
refusal. Remove only the shared CMIResult fractional cap; retain whole-input
matching, existing numeric syntax, finite-number/4096-character guard, four
vocabulary tokens, ID dependency408, malformed406 and failed state/count rollback.
No arbitrary-precision arithmetic or broader real syntax claim. Full numeric/
response-type/edition/error matrices remain OPEN.

Checksum-locked forward/reverse v42 adaptation:
pear-interaction-result-decimal-v42;
2004 ESM SHA2560447a677c989ac331f2e883c3e450a04c9366dcf3b5e4b06c5cbb0d5fdb1a62b.
1.2 unchanged eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.
Retain v41 trusted sequencing-envelope compatibility; isolated engine closure
for2nd-edition URI grammar remains separate. No client source-version authority.

Nine original domain tests cover raw/facade finite/negative/4096-character
fractions, vocabulary, missing-ID/no append, all-state refusal, pre-init load,
unset-result403, typed checkpoint replay, exact retry, forged malformed/overflow/
over-budget results with unchanged state/receipts/audit, SQLite reopen/v41 resume
and absence of proof. Actual native fixture adds one named long-result check,
reading exact saved text before SetValue on resume, preserving malformed406
and all existing native authority/absence/type5000/response10000/large checkpoint/
retry/clean shutdown checks. Controller2004=24;1.2 remains13. Existing built wide
real3 journeys add a separate long-result record, saved-state and pre-rewrite
resume assertions while preserving lost ACK/exact receipt/proof checks.

Original installer declaration collision/incorrect forward-chain rename and
wrong working-directory invocation are retained diagnostics. First two focused
45-test runs complete10PASS/35FAIL exit1 against prematurely stopped historical
engine87e419, not product acceptance. Corrected engine checksum then completes
39PASS/6FAIL: new fixture called raw renderCMI on facade and wrongly required
empty preloaded result to throw. Use facade's existing checkpoint callback for
snapshot equality and retain blank-as-unset403 behavior; product boundary is
unchanged. Final focused45 completes45PASS/zero skip/cancel/fail exit0 (16.5s).
Typecheck/build exit0; repeat installer reaches exact v42 checksum. Fresh full
domain949/133files, built3/native4 and fixed full172 browser results follow.

Parent2306ec READY10owner logs919/237/237/4/native3OS23clean5ACK5/reviews empty.
Parent2317d original9SUCCESS/WindowsFAIL2004-2 forced fixture after app-close,
nativeExit0/quitACK, database-close absent; cause unproved. One unchanged Windows
retry running, original retained. Parent23203cd CI running; local XMLtime940/
132files/built6/native4/typecheck/build PASS, full172168/4 and DOMrecheck1/1
retained ADR158. Owner222e2b CI absent; descendant evidence cannot replace it.
Chromium151 is supplementary, expected153 install blocked CDN403. License/
authorized exports/Rustici account/actual Safari and Android/production inputs
BLOCKED. Epic133 OPEN; production DISABLED.

Expanded built wide real3 completes3PASS exit0 (31.9s), with exact long result
read before rewriting on resume, saved SQLite text, lost ACK and exact receipt
retry retained. Full949 fresh domain running; supplemental native4 follows
only after fixture lifecycle domain completes, avoiding shared-port conflicts.

Initial full949/133files completes948PASS/1FAIL aggregate exit1. Sole failure:
installer test reversed decimal v41 directly from v42 without undoing the new
result adaptation first. Extend the existing exact predecessor chain to undo
result v42, assert old v41 SHA6d9a, then undo decimal v41 and all historical
levels; include v41 in all exact installer inputs. Preserve every historical
pin/input/reinstall/idempotence/unexpected-byte/version refusal. Original full
log retained. Fresh full post-fix verification follows; no prior clean claim.
Parent2317d is now READY: latest attempt2 all10SUCCESS, every full latest log
inspected; Pear931/237/237/4,all3OS16/13/13/23×3clean5ACK5,reviews empty.
Original Windows failure and unproved cause stay retained.

Corrected installer predecessor/idempotence/version/byte checks complete1PASS
exit0 (42.8s). Supplemental native4 completes4PASS exit0 (33.6s), including new
exact-result read-before-write and406 rollback with every prior guard retained.
Final typecheck exit0; unchanged engine checksum/built bundle retained. Final
fresh-cache full949/133files is running; fixed full172 follows after it ends.

Final fresh-cache full949/133files completes949PASS with every plan/footer/
five counts/per-file exit0 and aggregate exit0 inspected. Source/build fixed
for full172 SCORM browser now running; no pending browser PASS claim.
Successor ADL rollup token whitespace original12FAIL across four fields and
three editions retained; all three primary CAM§5.1.11 sources bind xs:token.
No ADL importer change in this result-only slice.

Parent23203cd READY: current owner37906112237 all10completedSUCCESS, every
full log inspected, Pear940/237/237/4 plus host lanes and all3OS native16/13/
13/23×3,clean5ACK5/no forced; fresh review threads empty. Separate asset
pointerdown diagnostic on this fixed v42 build completes1PASS exit0 (6.0s),
clicks correct Continue/Retry/Finish targets; original DOM cause remains
unproved. First standalone probe failed module initialization/no tests exit1
and is retained separately. No product/test asset change or clean full claim.

Fixed source/build full172 SCORM browser completes170PASS/2FAIL exit1 (8.3m),
both failure traces inspected: fourth licensed support download60s timeout
(cause unproved), managed ServiceWorker enumeration permission denial. Every
changed built3/native4 passes in full. Original local full2FAIL remains, no
clean full local claim; supplementary Chromium151 is not supported153/native
proof. No retries/assertion/deadline/policy changes. Final source hash0447a6,
1.2eb7539 unchanged. Independent integer newline check confirms raw4/facade4
PASS exit0; initial facade3PASS/1FAIL was wrong expected1.2 code201 rather
than405, retained; no integer product change. Next ADL token12FAIL retained,
primary CAM2nd/3rd/4th§5.1.11 explicitly xs:token; separate successor work.
EpicOPEN/prodDISABLED; all remaining matrices/external gates retained.
