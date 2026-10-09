# ADR-162: synchronous native fixture shutdown measurements

Status: diagnostic implementation/owner-head validation pending; no root cause claim.

Exact owner234d25 original Windows1.2 and owner235de1 original Windows2004-3
passed native quit ACK/exit0 but fixtureExit remained null and the unchanged
five-second deadline forced the fixture. Captured phase names end app-closed,
without database-closed. Multiple historical Windows failures and unchanged
retries are retained. Actual Linux/macOS clean shutdown does not identify the
Windows cause; a successful retry cannot be called a product repair.

The current six console phase messages carry no elapsed time and piped console
writes may buffer. Reuse core node:fs writeSync to emit the same phase prefix/
order synchronously, with finite elapsed performance.now milliseconds since
IPC cleanup starts. This permits a later real Windows log to distinguish
server close, synchronous database close, filesystem cleanup and pipe drain
without printing database values, credentials, capabilities or launch URLs.
No product entry point imports this isolated fixture. The shared controller
retains phase names and adds numeric phase timings/closed flag/output-error byte
counts; every existing native/API/authority/ACK/retry/resume/proof and clean
exit0/no-forced requirement remains. Database/server/filesystem close order,
close IPC and five-second budget remain unchanged; no exception suppression,
retry increase, assertion relaxation or arbitrary sleep.

Existing real IPC lifecycle test covers all five fixtures with an open partial
HTTP request, all six SCORM phases, finite monotonic times and completion within
the same deadline. Supplemental native4 checks the fault driver and all existing
vectors; full domain/browser/typecheck/build plus actual owner3OS CI are required.
No race cause is inferred from phase absence alone. If the measured Windows
failure remains, investigate the recorded slow/unfinished operation directly.

Engine remains v42SHA0447a6/1.2eb7539. Native runtime16/Pear13/1.2=13/2004-2=24/
2004-3=24/2004-4=25 remain unchanged. Local Chromium151 supplements actual native
proof; supported153 install blocked CDN403. Owner222e2b CI absent, descendant
results cannot replace owner gates. Full conformance/production matrices OPEN;
license/authorized authoring exports/Rustici account/Safari+Android/reviewed
production inputs BLOCKED. Epic133 OPEN, production DISABLED.

Initial focused5 was started before this worktree had built dist/scorm/runtime:
Pear1PASS/SCORM4 boot ENOENT failures exit1 retained, not a shutdown result.
Build then rerun required; no fixture/test/source relaxation. Owner235 original
complete run9SUCCESS/Windows2004-3forced failure, all10full logs inspected:
Pear958/237dev/237built/SidePanel4 plus host3/browser-host2/realLime/SCORMhost1,
Linux/mac actual16/13/13/24×3/five clean exit0 ACK each. One unchanged
Windows-only retry requested after complete run, originals retained/unproved.
Parent236411ad754 opened Draft/run37913908277 pending; local focused91/full964/
built2/native4/typecheck/build PASS, fixedfull172168PASS/4FAIL retainedADR161.
Parent234d25 now READY owner10/latestfull logs/reviews, unchanged WinretryPASS
with original forced1.2 failure retained, cause unproved.

ADR162 implemented isolated native SCORM phase writeSync/timing helper,
existing prefix/order/IPC/server/database/filesystem/deadline unchanged.
Controller adds only numeric timings/closed/output-error byte metrics, no
CMI/capability/URL disclosure. Existing real IPC five-fixture lifecycle test
adds complete finite monotonic phase times within unchanged5000ms criterion.
Typecheck/build exit0; corrected focused5PASS/zero fail/cancel/skip exit0
(4.6s). Initial1PASS/4 boot failures from missing dist retained; built then
reran without source/test relaxation. Native4/fresh full964/135files/full172
follow; no pending PASS/root-cause/product repair/actual Windows proof claim.
Parent236411 Draft/run37913908277;234d25 READY10owner latest logs/reviews;
235de1 original Windows2004-3forced retained/all10logs/one unchanged retry
pending. MatricesOPEN/externalBLOCKED;epicOPEN/prodDISABLED.

ADR162 native4PASS exit0 (26.2s); fresh full964 domain/135files completes
964PASS/zero fail/cancel/skip, every file plan/footer/five counts/exit0 and
aggregate exit0 inspected. Fixed full172 browser running, source/build frozen.
Original prebuild boot failure retained; no pending browser PASS/Windows
root cause claim. Independent unused-NCName U+2028/U+2029 rejection probe
6PASS exit0 on original tree, no NCName product patch; collection ID/IDREF
valid outer XML whitespace9FAIL remains separate next binding work.

Predecessor236411 actual Windows/macOS completed native16/Pear13/1.2=13/
2004-2=24/2004-3=24/2004-4=25 with five clean native/fixture exit0/ACKtrue
each/no forced. Both complete logs inspected; Linux/Pear incomplete, Draft.
These owner236 results do not replace future diagnostics own-head gates or
resolve prior owner235 Windows2004-3 shutdown cause/retry.

Predecessor235de1 now READY: owner run37911439757 latestattempt2 all10
completedSUCCESS/all10latest complete logs/freshhead/review_threads[] checked.
Pear958/237/237/4 plus host3/browserhost2/realLime/SCORMhost1; three OS native
16/13/13/24×3 and5clean exit0/ACKtrue/no forced each. Original Windows2004-3
forced failure retained; one unchanged Windows-only retry PASS, cause unproved.
Diagnostics branch does not claim a repair or use descendant proof for owner.

Final fixed-tree full172 browser:166PASS/6FAIL, process exit1 (9.2m).
Every failed trace/error context inspected: fourth-edition download60s timeout
(cause unproved), managed ServiceWorker permission denial, and four2004-2/3
retry/retryAll next-SCO DOM.describeNode/session-closed failures (cause unproved).
All four supplemental native journeys also PASS inside this full run. No
product/build/test/timeout/retry/policy changes during the run; no clean full
local or supported153/native-platform claim. Original failures remain retained.
Predecessor236 owner Windows/macOS/Linux full native logs now checked: each
16/13/13/24/24/25, five clean exit0/ACKtrue and no forced shutdown. Pear still
pending; these results do not identify previous Windows failures or satisfy
this diagnostic owner's future CI gates. Predecessor235 now READY as above.
