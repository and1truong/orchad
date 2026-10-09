# ADR-156: shared SCORM decimal capacity and exact integral ranges

Status: implemented; complete focused/domain/build/browser evidence recorded below; current-head CI/review required.

SCORM2004 RTE§4.1.1.7 real(10,7) specifies storage precision/scale, including
seven significant digits, rather than an eighteen-fractional-digit lexical
ceiling. Completion threshold§4.2.5 is [0,1]; scaled passing score§4.2.19 is
[-1,1]. Primary references:
- https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
- https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
- https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_RunTimeEnv.pdf

Parent229c3b8592d retains original0PASS/6FAIL for valid twenty-fractional-digit
host/learner values and0PASS/6FAIL for tiny excesses above1 rounded to1 in
score.scaled/host completion threshold. Logs scorm-decimal-precision-before.log
and scorm-decimal-boundaries-before.log and standalone probes remain in scratch.
Prototype6+3PASS is diagnostic only; it is not product acceptance.

Remove the arbitrary fractional digit ceiling in the one shared CMIDecimal
binding, retain the4096-character text bound, finite arithmetic refusal and
strict full-input match. Exact integral limits are checked before JS double
rounding/underflow. Route both host thresholds through that range validator;
retain read-only/type/range error categories and authored accepted CMI strings.
Current bounded ranges are integral; nonintegral limits keep the existing
floating comparison. JS-double arithmetic, existing CMI minus-only syntax,
numeric response/result/performance families and full numeric precision/SPM
matrix remain explicit OPEN work. No arbitrary-precision or certification claim.

Checksum-locked adaptation pear-decimal-capacity-v41 applies to the same shared
2004 engine and isolated second-edition closure. ESM SHA256:
6d9a5a3b33f911fcc447c8edf475022e22b07bb34166122e376d1b1ff32df086.
SCORM1.2 source remains eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642.
Installer tests cover pristine/all reviewed predecessors including exact v40,
reverse checksums, idempotence and unknown source/version refusal. Trusted v40
sequencing envelopes remain accepted; receipts/history/proofs are not rewritten.

Nine original domain tests (three editions) exercise raw engine/facade,
4096-character and long fractions, each shared decimal scalar family, finite
refusal, exact integer boundaries, host read-only thresholds, author XML host
bootstrap, typed replay/atomic forged refusal, exact receipt retry, SQLite reopen
and v40-envelope resume. Combined precision9/real15/XML numeric17/installer1
focused42 PASS, zero fail/skip/cancel, plan/footer and exit0 inspected.
The earlier root-directory invocation failed before finding tests and is retained;
it is not test evidence. Typecheck/build completes exit0.

Existing three wide-real built journeys also verify long decimal exact strings,
406/407 state preservation, lost ACK/exact receipts/Close/resume. Choice3 and
weighted1 use small twenty-fractional-digit XML measures. Native fixture adds
long decimal maximum text/small preferences and exact refused bounds, retaining
all collection absence, provenance, retry, isolation and proof guards. Native
2004 controller now requires23 checks;1.2 remains13. Chromium driver is
supplementary, not actual native evidence. No deadline, retry, quota or policy
relaxation. Exact full domain/browser results and current CI follow.

Epic133 remains OPEN and production DISABLED. Full mandatory API/data-model/
response/URI/history/sequencing/operations matrices remain OPEN. Authorized
exports/licenses/Rustici account/actual Safari and Android/production inputs
remain BLOCKED. Owner222e2b CI is absent and cannot be replaced by descendants.

Fresh full domain919/130files completes all per-file plans/footers/five counts/
exit0 and aggregate exit0. After choosing global score.max instead of the
interaction0 weighting field in the native fixture, revalidate its sole domain
dependency native-fixture-lifecycle5 PASS exit0; all unset interaction403 guards
remain unchanged, and remaining914 tests/129files unchanged from the full run.
Expanded built7 PASS exit0 (34.6s), supplemental native4 PASS exit0 (30.6s),
final typecheck exit0 and fixed v41 build exit0. Full172 fixed-tree browser
continues; failures will be recorded without a clean full claim.

Parent229 ownerc3b/run37899289895 has a Windows native2004-2 forced fixture
shutdown after app-close, with database-close absent, nativeExit0 and quitACK
acknowledged; cause unproved. 2004-3/4 were not reached in that Windows job.
Completed Linux/macOS logs each show runtime16/Pear13/1.2=13/2004=22, five clean
exit0/ACKs and no forced shutdown. Other owner jobs still ongoing; keep Draft.
Independent successor work continues without weakening shutdown/native gates.

Final fixed-source/build full172 local browser completes168PASS/4FAIL exit1
(8.3m). Inspected all four traces: fourth-edition licensed support download
deadline60000ms, managed ServiceWorker permission denial, fourth-edition retry
and hidden navigation DOM.describeNode/internal server error/session closed.
All changed decimal7/native4 journeys pass in full. The DOM root cause is
unproved; no blanket driver explanation or clean full local browser claim.
No policy/assertion/deadline/retry/envelope relaxation. Current-owner all10 CI
logs, actual threeOS native23 and fresh reviews remain required before READY.
Parent229 full CI completes9SUCCESS/WindowsFAIL; Pear910/237dev/237built/
SidePanel4/host3/browserhost2/Lime/SCORMLime1 footers inspected. One unchanged
Windows-only retry requested after whole-run completion; original forced
shutdown evidence remains, and a retry cannot establish its cause or fix.

Unchanged-tree focused recheck of the two DOM-failed journeys completes2PASS
exit0 (6.3s), all assertions/deadlines retained. Original full168/4 remains;
this recheck neither proves the cause nor turns the full run into PASS.
