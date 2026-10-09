# SCORM #133 requirement acceptance

This is the current requirement disposition, not a scope reduction or certification.
Accepted baseline is main `0888beee461e1656f1c717cefb205923f7705a6d`,
tree `095549250484b8a8484d8c46a79e76eb8bd01f93`; push acceptance
[37738101010](https://github.com/and1truong/orchad/actions/runs/37738101010) PASS.
The initial source stack is integrated; subsequent conformance PRs are stacked and retain exact-head gates; earlier #164 local counts are historical evidence.
[Completion register](SCORM-CONFORMANCE.md) assigns stable IDs to remaining
code/validation/external gates. ADR-098 adds textual-response corrections and
original three-edition domain/built-browser vectors; full compliance is OPEN.
ADR-099 corrects last-value session-time accounting in four editions, including
downward/zero corrections, immutable prior-session total, centisecond precision,
exact retry, rollback, DB reopen and built-browser close/resume.
ADR-100 corrects shared reserved-separator handling in learner and correct
responses. Original three-edition domain vectors cover bare punctuation, scalar
limits, literal backslashes, bracketed matching/performance and numeric ranges.
Built-browser ACK/close/resume vectors are authored; current-head CI is required.


| Requirement | Implemented evidence | Outstanding acceptance |
|---|---|---|
| Multi-file ZIP, XML organization/resources/paths, immutable import/export | scorm-packages / engine-foundation tests; ADR-075/076 | Production scanner is not configured; parser PASS is not malware scanning |
| Quarantine/review/publish/version/retire/revoke | Package/player/review tests, immutable versions and current authorization | Actual production storage/scanner/deployment policy |
| Isolated content host, exact channel/capability/attempt scope | Player/browser/adversarial authority tests; ADR-077/080/081/093 | Credentialless production origin, all-egress self-navigation/redirect/worker/popup enforcement on each actual platform |
| Eight synchronous methods, lifecycle/argument/access/error APIs | scorm-player/scorm2004/scorm-review tests and licensed wrapper browser journeys | Exhaustive edition-specific error precedence, vocabulary/range/encoding combinations; no certification claim |
| CMI status, scores, location, suspend, preferences, comments, objectives/interactions | Runtime replay and Unicode/interaction tests; ADR-079/095–097 | Identifier URI grammar and full response/language/error matrix; ADR-098 covers named textual prefix/whitespace cases |
| Durable ACK, retry, reopen/restart, concurrent/stale/reordered writes | Player/learning/sequencing/system-store tests and lost-ACK built journeys | Additional real engines and production durability/load/DR |
| Commit vs Finish/Terminate, technical attempts vs domain retake | Runtime/sequencing/selection/duration tests; ADR-078/080/084/094 | Exhaustive reference lifecycle/reset/time behavior |
| Time and calendar | Reported centiseconds and last-value session replacement, trusted host duration clocks and calendar windows; ADR-088/094/099/104/119; shared timestamp/calendar/precision/TZD vectors | Year/month/finer-precision duration bindings and standard-aligned calendar conversion; existing 365/30 reported-time policy is not full conformance |
| SCORM 1.2 multi-SCO/AICC prerequisites | Learning/player/assets tests and 1.2 built workflow | Full recognized 1.2 prerequisite/data-model reference coverage |
| 2004 flow/choice/rules/rollup/local maps/retry/limits/selection/assets | Sequencing/selection/assets/duration tests; ADR-080/083–088/092–094 | Exhaustive branching/rule/error/delivery/reference suite |
| Fourth-edition shared data and system objective maps | Authorized delta stores and migration/reopen/backup tests; ADR-089–091 | Full licensed reference/platform/production validation; unofficial isolation is explicit Pear policy |
| Standalone/course/module/nested award/cycle proof | Learning/sequencing tests; trusted transaction, per-SCO policy, immutable proof, separate quiz certificate | Reference-specific proof/reuse/retake/issuer equivalence remains #49 scope |
| Preview/practice and agents | No official proof, redacted semantic context, scoped support packets, host-policy tests | Production/platform authority matrix; agents never impersonate SCO score/commit |
| Compatibility fixtures | Pinned licensed pipwerks and ADL developer-guide wrappers, synthetic multi-SCO/adversarial packages | Licensed Storyline/Captivate/Rise exports, ADL legacy license/platform resolution, authorized Rustici differential account |
| Browser/native/device lanes | Built Chromium, actual unpacked Lime and four-profile Linux/macOS native evidence at the historical ADR-116 head; Windows runtime/Pear passed | Repaired exact-head Windows four-profile native acceptance, all successor heads, mobile Safari/Android and native Chrome Side Panel container |
| Operations/privacy | Diagnostics/log redaction/capacity/rollback/whole-DB backup/offline restore; ADR-082/090/091 | Reviewed production retention/archival/purge, immutable-proof preservation, load/RPO/DR/scanning/deployment |
| Delivery and register | G05/G10/G14/G18, support matrix/handoff reconciled through ADR-097 | Baseline integrated/main acceptance verified above; successors need their own exact-head evidence; #133 stays open for unfinished requirements |

External blockers require actual authorized accounts/assets/platforms and reviewed
production policy. Do not buy licenses, upload packages/PII, fabricate exports,
substitute Chromium viewport for mobile engines or enable production to get green.
Code conformance gaps remain implementation work; they are not external exceptions.
The full epic cannot close while either class remains unfulfilled.

Integrated #165 review corrections additionally recheck leaf/ancestor calendar
windows on active communication-session reopen independently of optional
duration clocks. Calendar-only legacy snapshots do not need a new clock.
Three-edition regressions prove inclusive boundaries and denied early/expired
reopen without launch/proof changes. Earlier-edition shared-data unavailability
(error 401) takes precedence over malformed Unicode/store validation.
The actual Lime practice harness waits for completed discovery before selecting
read permissions/consent, reusing its existing bind helper. No host guard or
assertion is removed. Current exact-head acceptance remains in the epic ledger.

ADR-102 adds common URI character/percent and identifier-length validation, typed matching replay, and the 144105-character response envelope required by 36 full-size choice identifiers. Original vectors and built pipwerks journeys cover exact state, invalid/forged/legacy rejection, lost ACK/retry and SQLite/browser resume. This does not close DM-02/RESP-02: full component/authority grammar, edition-specific IP literals, RFC 2141 URNs and equivalence/uniqueness remain OPEN. Exact-head validation is recorded in the successor PR/epic ledger.

ADR-104 corrects common engine timestamps, including Gregorian month-end/leap checks and full-input refusal. Original three-edition API/load/replay/SQLite tests and built lost-ACK/resume journeys extend TIME-03 evidence. Full acceptance belongs to the exact-head PR/epic ledger. ADR-105 resolves the named LMS-comment browser read-only mismatch and preserves collection count after rejected writes. Three-edition preloaded nested collection/reset/replay and built retry/resume vectors cover the correction; complete DM-03 acceptance remains OPEN.

ADR-106 extends named DM-03/API-02 state-preservation evidence to failed first/next/nested collection appends, including thrown and returned errors and trusted preload. Whole-CMI/API/receipt/retry/resume vectors cover the bounded correction; complete conformance and every external/platform gate remain OPEN/BLOCKED.

ADR-107 extends DM-03 path binding to both engines: malformed full indices cannot alias existing records on GetValue/SetValue. Four-edition original vectors include nested arrays, keywords, decimal/large boundaries, private state preservation and built lost-ACK/resume. Exact-head acceptance remains required; no profile certification or production enablement.

ADR-108 extends bounded failed-append atomicity to the 1.2 entry and verifies existing records, nested arrays, successful retry, typed errors, trusted preload and durable bound checkpoint/resume. The 2004 output is unchanged. Full 1.2 reference/API/data-model acceptance and remaining register families stay OPEN.

ADR-109 aligns supported 1.2 core/objective score initialization/reset with the ADL blank-default recommendation and preserves explicit stored maxima. Named API/preload/bound-checkpoint/retry and built resume evidence adds a bounded DM-03 correction; it does not close optional-field or complete score/reference acceptance.

ADR-110 adds nine original domain vectors and four built pipwerks journeys for API/state/argument binding and a throwing checkpoint queue. Failure returns a synchronous string, keeps communication/deltas retryable and does not add accepted receipts; normal persistence, lost ACK/exact retry and close/resume still require successful server acceptance. Exact-head full CI and every remaining register gate apply.

ADR-111 adds twelve original four-profile model-access regressions and four built pipwerks journeys. Engine objects/helpers/private fields are unavailable through synchronous standard methods; denied writes preserve identity/state and cannot replace model objects. Host field/identity validation remains independently tested and mandatory. No sandbox/all-egress/certification claim follows from these bounded API vectors.

ADR-112–115 extend named navigation-target, numeric-capacity, derived-error-reset
and language-preference evidence through the shared engine and original durable/
built journeys. They preserve their explicit full grammar/registry/sequencing
reference gaps in the completion register.

ADR-116 adds actual Windows/macOS runner gates and all four profiles on Linux,
including lost ACK, identical retry/receipt/revision/history, close/resume,
completion authority and identity rebind. Initial Linux/macOS logs passed;
Windows exposed a genuine subframe native callback failure. Supported Tauri
invoke_system now rejects iframe IPC before creating the key closure. Actual
new-head native CI remains required; 59 Coconut tests and supplemental browser
fixtures are not platform PASS.

ADR-117 binds support parameters without content object coercion; ADR-118 binds
1.2 invalid CMI names to 201 versus unsupported outside models to 401. ADR-119
binds shared timeinterval grammar and refuses malformed 1.2 latency checkpoints.
Named failure preservation/retry/receipt/resume evidence extends API-02/TIME-01;
full reference/field precedence, calendar conversion and every external, actual
platform, all-egress and operations requirement remain OPEN/BLOCKED.

ADR-120 adds conditional shared URN namespace/NSS binding with exact case/percent preservation and invalid typed/load/replay refusal. Non-URN behavior and 1.2 source stay unchanged. Full URI components, namespace-specific decoding/equivalence and all remaining conformance/platform/operations gates stay OPEN.

ADR-121 expands bounded synthetic dynamic-egress probes in all four native fixture profiles. Local built Chromium preflight 4/4 passed; current-head actual native acceptance remains pending. No all-egress production or mobile/Side Panel claim follows.

ADR-122 requires an actual Chrome SIDE_PANEL context and same-document React mount; CI pending. No extension-page fallback or local managed-policy bypass. Full native container consent/rebind/revoke/player journey remains OPEN.

ADR-123 adds original scheme/relative-first-segment vectors to shared/facade/preload/replay and existing built identifier retry/resume journeys. Full reference/authority/IP/equivalence and external/platform/production gates remain OPEN; exact-head acceptance remains required.

ADR-124 adds original simultaneous-invalid API error/state/queue preservation vectors in all four profiles and existing built refusal/ACK/retry/resume journeys. Exact-head full CI/native/review gates remain required.

ADR-125 adds original raw-fragment delimiter/encoded-data vectors to shared/facade/preload/replay and existing built identifier retry/resume journeys. Exact-head acceptance and remaining full component/authority/IP/equivalence gates remain required.

ADR-126 extends original result real-capacity/dependency/finite-envelope vectors through shared engine/facade/preload/replay and existing built wide-real ACK/retry/resume journeys. Exact-head full CI/native/review and remaining full conformance/external/production gates remain required.

ADR-127 extends the actual Side Panel check in all four SCORM profiles to
consented metadata read/private-state exclusion, read-consent revocation, exact
lost-ACK retry/close-resume/finish, account-change denial before gateway and
fresh pin/Disconnect. Exact native container and unchanged documentId required;
new-head full CI pending. Local managed extension policy is unchanged.

ADR-128 extends existing three built wide-real journeys to numeric learner/
correct and performance bound overflow/range refusal, stored exact strings
and lost-ACK retry/close-resume. Full new-head acceptance remains required.

ADR-129 adds six original three-profile shared/facade/typed replay cases for
empty locations/comment records and extends the existing three built read-only
comment journeys with empty save, persisted count/value and lost-ACK/resume.
Local734/106,focused50,build,three built journeys completed; new-head full CI
and all native/review gates remain required. Durable initialized/unset presence
and full field matrix remain OPEN.

ADR-130 adds six original choice-set append/replacement/preload/replay cases
and extends all three built URI/full-capacity journeys with reordered duplicate
refusal, retained pattern/count, same-index authored order and lost-ACK/resume.
Local740/107,focused34,build,three built journeys completed with exit0; full
new-head CI/native/review and remaining response/equivalence gates are required.

ADR-131 retains two original actual-request navigation/redirect counterexamples. Final build and six built Chromium journeys completed with exit0, including four real fault-driver profiles and combined inline playback. New native controller requires13 checks per SCORM profile with attempted/frame-src/403/zero-canary evidence, unchanged proofs and clean exit. Fresh full domain740/107 completed with exit0; exact-head CI/native/review remain required; full strict-egress remains OPEN.

ADR-132 controlled script-delivery regression fails before original fixture handler readiness is corrected. Fresh domain740/107/build pass. Full local43 completes32PASS/11FAIL; targeted12 completes10PASS/2FAIL, final unchanged three-case check3PASS. Passing evidence across attempts is not a clean full acceptance run. New-head full CI is mandatory, original failures retained, no assertions/timeouts relaxed.

ADR-133 focused70/fresh domain746 across108 files/build and three built comment journeys completed with exit0. Original six presence regressions failed; corrected shared/facade/preload/typed replay covers omitted children403 versus explicit blanks0, missing records301, read-only404 and malformed406 without mutation. Existing ACK/retry/revision/count/receipt/proof assertions remain. Exact-head CI/native/review remain required.

ADR-134 original six description-presence regressions failed; focused88 includes shared/facade/seed/typed replay/count/history/exact retry/resume plus sequencing/system-objective compatibility and historical installer checks. Build/fresh full domain752 across109 files/three built journeys complete exit0; exact-head CI/native/review remain required.

ADR-135 original6FAIL -> focused94/build complete exit0. Current legacy-scalar vectors6, fresh full domain758 across110 files and three built response/comment/description journeys complete exit0; exact-head CI/native/review remain required. Valid empty responses and absent response presence use shared model/loader/typed replay without weakening dependency/vocabulary/Unicode guards.

ADR-136 v32 preserves supplied empty location/suspend_data values versus omitted fields403 through shared snapshots/reset/loading and typed durable replay. Original6FAIL; final focused106/full domain764 across111 files/build/built3 complete exit0. Full local127 completes114PASS/13FAIL, retained; fresh-process failed-case rechecks pending. No clean full local acceptance claim. Historical explicit blanks are preserved without provenance inference. Full exact-head acceptance and remaining conformance gates stay required.

ADR-137 uses the existing transactional SCO ordinal for finished non-sequenced 2004 non-suspend exits: fresh CMI/revision/time, retained old history/receipts, unchanged suspend/unfinished recovery and no SCORM1.2/engine change. Original6 completes3PASS/3FAIL; focused87/full domain773 across112 files/final build/built3 complete exit0. Parent #208 fresh recheck commands complete10 success/3 failure (one selected an extra hidden variant), plus an exact non-hidden learning recheck fails; download/learning/service-worker permission failures remain. Its Windows CI consent-response timeout remains unattributed. New-head full CI/native/Side Panel and lifecycle gaps remain required; production disabled.

ADR-138 derives resume entry from the trusted suspendedActivity matching the selected SCO, overriding normal/empty exit while retaining revision/time/history/receipts and no proof. Original3FAIL; focused70/full domain776 across113 files/build/built3 complete exit0. Exact-head CI pending. Original time-out+continue probes deliver another SCO across three editions; separate root fix required. Parent Windows-only unchanged retry running; original failure retained. No full lifecycle or production claim.

ADR-138 P1 review correction retains trusted resume while the latest scoped
launch remains unacknowledged, including repeated exact registration keys and
a lost browser launch response. A content ACK ends the fallback. Original3FAIL;
owner v32 fresh full domain779/114 files, build and built3 complete exit0.
Initial browser3FAIL from incorrect alert scope is retained; corrected tests
assert the actual error and unchanged CMI/history/receipts/no proof. Original
head CI776/198 dev/198 built was successful but does not cover this correction.
New-head full CI/native/Side Panel/review gates remain required.

ADR-139 pear-timeout-exitall-v33 normalizes Terminate navigation and trusted preflight to ExitAll for time-out, preserving authored pending request until termination and historical v32 bytes/envelopes. Original6FAIL; first focused66/69 retained three test-only snapshot-access failures; corrected focused69/full domain782 across114 files/build/final typecheck/built3 complete exit0. Exact-head CI/native/Side Panel/review pending. Logout preflight/full lifecycle/independent reference gates remain OPEN; production disabled.

ADR-140 pear-logout-exitall-v34 extends shared Terminate/preflight ExitAll precedence to logout and terminates the sequencing service, retaining authored request and exact v33 installation/snapshot compatibility. Original6FAIL; focused75/full domain788 across115 files/build/final typecheck/built3 complete exit0. Exact-head CI/native/Side Panel/review pending. Full lifecycle/reference gaps remain OPEN; existing data-free deprecation warning retained; production disabled.

Parent #208 a49cdc8e / run37860684141 attempt2 completed10 jobs; all latest logs/head/reviews inspected. Pear764/192dev/192built/SidePanel4, actual Linux/macOS/Windows16/13/fourSCORM13 and five clean native/fixture exit0 records each. One unchanged Windows-only retry passed; original consent-response timeout retained/unattributed. Local download/learning/SW permission failures retained; no clean full local acceptance or full conformance claim. Successor exact-head CI remains required.

ADR-141 uses existing transactional removal paths and trusted v34 ExitAll for
acknowledged time-out/logout on human close or replacement, retaining old CMI
history and receipts without a fabricated Terminate or proof. Original3FAIL;
first focused82/88 retained, corrected final91/build/built3 complete exit0.
Fresh integrated full domain797/117 files/build/built6 complete exit0. Full local
SCORM browser145 completes134PASS/11FAIL, exit1: four EADDRINUSE from concurrent
draft-worktree port reuse, five unattributed sequencing practice-delivery failures,
download timeout and managed Service Worker permission refusal. Original traces
retained; sequential nine-case recheck completes7PASS/2FAIL, exit1. Four session-time
cases pass; interaction-records2004-3/duration2004-4 practice delivery still fails.
Retained trace shows server accepted Terminate/nextScoId=practice but no following
browser status lookup/replacement after manual retry; cause unresolved. No clean
full local acceptance claim. New-head full CI/native/Side Panel/reviews required.

ADR-142 v35 permits valid interaction ID replacement while retaining objective
ID immutability and URI/dependency/packed-array guards in the shared engine.
Original6FAIL; draft focused39/build/built3 pass. First integrated799/803 and
compatibility803/804 failures retained; timestamp oracle now uses one controlled
Date clock and complete restored-state equality. Build/integrated built9 pass;
fresh final domain804/804 across118 files/typecheck/focused64/64 complete exit0.
Historical v34 bytes/marker are
accepted with identity/unknown-source refusal. New-head full CI/reviews and
parent browser failures remain required; epic open, production disabled.

ADR-143 records v35 whole sequencing35/43 and diagnostic failures. Two observed
Retry clicks land in SCO HTML without shell click/runtime retry message. Explicit
scroll/viewport readiness keeps the original human click and all ACK/navigation/
time/proof checks; corrected focused10 pass/typecheck exit0. Whole43 completes42PASS/1FAIL
(unchanged retryAll DOM.describeNode/session closed). Separate unchanged retryAll recheck1PASS; full145 browser running;
no clean full local acceptance claim or attribution of every prior failure. CI/reviews and
production/external gates remain required.

ADR-143 full145 local140PASS/5FAIL and learning observation3/4 retained. One
observed hidden Close click lands in SCO HTML without shell click/Close request.
Learning Close now requires scroll/viewport and completed control removal;
original launches/history/proof/quiz/certificate checks stay intact. Corrected
learning6/6 and typecheck complete exit0, no clean full local claim; protocol/download/permission evidence
and exact-head CI/reviews remain required.

ADR-144 pear-urn-nul-v36 binds RFC2141 null-octet guidance in the shared short/
long identifier expressions. Original6FAIL, draft focused26/full804 across118
files/build/built URI3 pass, all exit0. Integrated latest-parent domain804/804
across118 files/build/built11 pass, all exit0. v35 exact bytes/marker upgrades with
identity/unknown-source refusal, prior receipt/history and SCORM1.2 unchanged.
Full145 current-parent browser acceptance and new-head CI/reviews remain required.
URI/IP-literal/full reference and production/external gates remain open.

ADR-144 c8aea0d0 full145 completes140PASS/5FAIL exit1: managed download/SW
restrictions and three DOM.describeNode/session-closed asset/retry/retryAll
failures retained. First exact-head CI Linux native smoke quit ACK times out;
exit-before-reply ordering is corrected to reply-before-exit. No weaker timeout/
shutdown/policy assertion. Local Rust/native unavailable; new-head CI mandatory.

ADR-145 v37 corrects absent interaction type/timestamp/weighting/result/latency
reads301 while preserving existing unset403/defaults/serialization/dependencies.
Final original6FAIL, focused32/build/built3/full domain810 across119 files/
supplementary native fixture4 pass exit0; integrated root acceptance pending. Sandbox PDF timeout and discarded initial
object-shape assertion failures are retained. Actual native301/403 checks before/
after resume and exact-head CI/reviews remain required; epic/prod gates unchanged.

ADR-145 caller review expands v37 to named objective/interaction scalar/score
fields and nested objective IDs/correct patterns: narrow focused32/full draft
810/build/browser3/fixture4/integrated root810/build pass retained; extension3
originalFAIL, broader focused35/build pass exit0. Broader full domain/browser/
root checks pending. Native fixture now records thirteen absent paths plus five
unset fields before/after resume; actual native CI required.

ADR-145 final broad source full813/813 across119 files passes exit0; reviewed
source/new test/vector files match root exactly. Integrated root focused35/build/
built12 pass exit0 (errors3, URI3, learning2, supplementary fixture4). Actual
three-OS named301/403 and current-head CI/reviews plus full148 local remain
required. Parent316 native ACK/clean shutdown now verified on all three OS; its
Pear job is pending. Historical failures/managed policies remain retained.

ADR-146 v38: original9FAIL on v37; shared ordered-array duplicate351 and valid
zero-member pattern. Focused35/build/typecheck/built7 complete exit0. Fresh full
domain822/822 across120 files completes exit0; full151 browser and current-head
CI/review remain required. New native named
ordered checks require actual three-OS logs; supplementary Chromium is not
native evidence. Parent21968/run37873160107 all10 jobs/logs verified, Pear813/
213dev/213built/SidePanel4 and native3OS16/13/1.2=13/2004=14/five clean ACK+exit0
records each. Parent full148=142PASS/6FAIL exit1 and unchanged diagnostic18PASS
remain recorded with unattributed driver failures; no clean full local claim.

ADR-147: original3 performance-capacity regressions FAIL on v38; bounded2MiB
checkpoint queue/server/HTTP agreement. Focused24/build/typecheck/full825 across
121 files, large/ordered built9 and supplemental native fixture4 PASS exit0.
Actual native over544KiB checkpoint/35 Unicode-record retry/resume and full157
local/current-head CI/review remain required. Parent220 full151=149PASS/2FAIL
exit1 download/SW restrictions is retained. Whole SPM combinations/load/ops
remain open; no production enablement or conformance claim.

ADR-148 guards acknowledged snapshots against strict-loader failure before queue
and durable replay. Focused3/build/full domain828/122files/built recovery3 plus
supplemental native fixture4 complete exit0. Full160/new-head actual native CI
and review remain required; native2004 adds type0/commit391/preservation/recovery
evidence. This does not complete retained-invalid-response type-change semantics.
Parent221 full157151PASS/6FAIL is retained, with Windows2004-2 fixture forced
shutdown after app-close in run37876846214. Epic133 OPEN, production DISABLED.

ADR-148 P1 Close correction: original six practice/enrolled refusal journeys
fail on10dcee62; final focused browser13, domain/lifecycle8 and confirmed build
pass with complete exit0. Local Commit refusal now promptly rejects both shells'
Close while preserving iframe/live response/launch/revision/receipts. Correction,
explicit Retry, Close and exact Resume remain verified. Intermediate12PASS/1FAIL
and sandbox3PASS/5EPERM failures are retained in ADR-148. Historical10dc CI all10
logs/Pear828/225dev/225built/SidePanel4/native3OS2004=17 is verified, but new-head
CI and fresh full828/166 acceptance remain pending. Full160156PASS/4FAIL remains
retained; no clean full local claim. Epic133 OPEN, production DISABLED.

ADR-148 fresh owner P1 full828/122files PASS exit0; full166 completes162PASS/
4FAIL exit1 (interop2004-4 reopen timeout, managed Service Worker denial,
2004-2 RetryAll and2004-3 ADL DOM.describeNode/session closure). All refusal6/
reload3/Close race4/native fixture4 pass. Interop explicit Close readiness and
disappearance verification completes5PASS/exit0; original full failure remains.
Current e903 workflow/check runs are
absent; direct gh API is Forbidden. Draft pending new-head CI/reviews, with
original/intermediate/full failures retained and no clean full claim.

PR222 support-download readiness repair: exact e2b1dfa original isolated five
interop journeys complete4PASS/1FAIL exit1(1.2m). Fourth-edition download60s
timeout trace/network/context read; pointer reaches SCO HTML, no diagnostics
request. Build on exact old product completes exit0. Reuse existing explicit
viewport readiness before the real support click, keeping packet/sequence/
redaction/close/resume/Finish/proof assertions. Accepted interop5PASS/exit0
(26.2s). No product/engine change, deadline/assertion/policy relaxation or
empty CI-trigger commit. Temporary instrumentation is outside tracked tests.
This reproduces and fixes this isolated missed action, not all historic causes.
Parent full828/122files and full166162PASS/4FAIL remain inherited evidence,
not rerun full results for this test-only repair. Historical10dc CI is not
new-head proof; own CI/all full logs/fresh reviews required. Existing P1 fix
and history retained; epic OPEN, production DISABLED.

ADR-149 v39: original four regressions fail; final draft focused27/build/fresh
full832 across123 domain files/supplementary native fixture4 pass exit0. Accepted
response type bindings preserve nonempty/supplied empty fields through exact
retry/trusted close/resume; current-type replacement clears bindings. Public
metadata/changed invalid input remains refused. Integrated fresh full832/123files/build and built16 (binding3/reload3/refusal6/
fixture4) pass exit0; full169 is running. Initial built13PASS/3FAIL wrapper
checkpoint ordering is retained and corrected with explicit accepted-response
DB verification.
new-head CI/review and actual native3OS2004=18 remain required. Parent222 owner
P1 e2b focused13/lifecycle8/build/fresh828 and changed interop5 pass; full166
162PASS/4FAIL remains retained and current CI has not yet appeared. First-checkpoint type provenance and full matrices
remain OPEN; historic failures retained in ADR-148–149, production DISABLED.

ADR-150: original first-checkpoint provenance3FAIL→focused10/typecheck/build/
built19 PASS exit0. Ordered typed journal is replayed/matched server-side; no
client-asserted origin bindings. New response3, accepted binding3, bounded guard3,
Close refusal6 and supplementary native fixture4 pass. First full835832PASS/
3FAIL EADDRINUSE from overlapping lifecycle/browser fixtures is retained; fresh
full835/124files then expanded838/124files complete PASS/exit0 after browser
completion; all original failures remain retained. Full172 is running. Full172/current-head CI/review and native
threeOS2004=19 required. Parent223 all10 jobs/logs verified832/234dev/234built/SidePanel4 and
actual3OS2004=18 clean5/ACK5, READY; full169165PASS/4FAIL retained. Parent222 e2b missing current CI even after
one close/reopen event replay; stays Draft. Epic133 OPEN, production DISABLED.

ADR-150/head72c2072f full172166PASS/6FAIL exit1 retained: download timeout,
managed ServiceWorker denial and four DOM.describeNode/session-closed failures
remain unattributed; all provenance3/binding3/guard3/Close6/native4 pass.
Run37885369934 attempt1: nine jobs SUCCESS/all ten logs read; Pear838/237dev/
237built/Side4, Linux/macOS runtime16/Pear13/1.2=13/each2004=19 clean5/ACK5.
Windows2004-3 fixture is forced after app-closed, before database-closed;
2004-4 not run. Original failure retained/unproved; unchanged Windows-only
retry accepted after run completion. #224 remains draft pending its gates.

ADR-151/v40 isolates contemporary RFC3986 URI components/authority/IP literals
from historical second-edition v39 lexical compatibility. Constructor profile
follows typed writes, trusted preload/bound-response probes/queue reload and
sequencing/selection/navigation copies; old v39 envelopes remain admitted.
Original IP-literal trial3FAIL; preliminary focused28/full844 and corrected
build pass. Initial built13 completes9PASS/4FAIL: native3 resume probes collided
with objective absence assertions, corrected using a separate collection;
2004-2 provenance click timeout unattributed. Final edition-scoped845/125files,
build and focused built22 PASS exit0; additional response-family matrix file8
passes. Fresh846 and full172 required; actual native3OS2004=20/current-head
CI/review required. Full RFC2396, exhaustive contemporary reference/URN/UTF8/
equivalence/dependency/type/SPM/seq/ops matrices remain OPEN, alongside external
license/account/export/platform/production-policy blockers. Epic133 OPEN;
production DISABLED.

ADR-151 fresh expanded846/846 across125 files completes PASS/exit0; every
footer/plan/exit checked, URI file8 includes all five response families/edition
bindings. Final focused built22 PASS/exit0. Full172 built browser running;
exact-head CI/native/review still pending.

Final head72c2072f/run37885369934 attempt2 completes all10SUCCESS/all10 latest
attempt logs inspected (nine retain original timestamps; only Windows reruns).
Unchanged Windows retry113679323066 passes runtime16/Pear13/1.2=13/each2004=19,
clean native/fixture exit0 and quitACK five times without forced shutdown.
Linux/macOS also clean5/ACK5; Pear838/237dev/237built/Side4 and host3/
browser-host2/Lime-host1 pass. Original Windows fixture failure retained/
unattributed. Fresh exact head and no unresolved review threads verified before
#224 READY; no clean full local acceptance or completed epic/production claim.

Final full172 built SCORM browser completes170PASS/2FAIL exit1: managed
ServiceWorker permission denial and2004-3 calendar DOM.describeNode/session
closed. Original logs/traces retained; driver cause unproved. All expanded URI3,
binding3/provenance3/guard3/Close6/native4 pass. Chromium151 is supplementary;
Playwright1.63 expects Chromium153. Installation to the user-specified browser
directory is blocked by CDN403 Domain forbidden, complete installer exit1; no
dependency, policy, timeout or assertion is changed. This is not clean full
local acceptance. Exact-head CI/native3OS2004=20/review gates remain required.

ADR-152 original consecutive-type history0PASS/6FAIL→basic6 and expanded
focused18/build PASS exit0. Mixed-origin durable Commit/Terminate/queue refusal/
forged journal deletion/receipt exact retry/Close/resume covered; no quota
relaxation. Old type-only quota cases0PASS/3FAIL retained; noncompactable
response/type histories preserve every refusal/Close/recovery assertion.
Built5000-type history and native journal length evidence added to existing
journeys; final focused built22 and fresh full domain855/126 files complete
PASS exit0. Full172 browser and actual3OS2004=21/current CI/review required. General witness compaction/full matrices remain OPEN.
Parent225 CI Windows1.2 fixture forced after app-closed,2004 not run; cause
unproved and original log retained, Draft until exact-head gates pass.


Full172 SCORM built browser completes169PASS/3FAIL exit1: support download
timeout,2004-2 target navigation DOM.describeNode/session-closed, and managed
ServiceWorker permission denial. All changed provenance/type-history3, binding3,
URI3, reload3, Close6 and supplemental native4 journeys pass. Full logs/traces
retained; no clean full local acceptance or proved driver cause. Supported
Chromium153 installation remains blocked by CDN403. Fresh domain855/126 files,
final build, focused18 and built22 complete PASS exit0. Parent225 head0ba also
fails built response correction after resume (846 domain/237 dev pass;
236 built pass/1fail, Side Panel/host not reached); its viewport correction is
being validated at its owner before integration. Windows shutdown cause remains
unproved. General successful response histories remain OPEN: an independent
original5000 consecutive learner/pattern-write regression across three editions
and Commit/Terminate completes0PASS/12FAIL exit1, preserved for a successor.


Head0ba183c7/run37888472163 attempt1 completes eight SUCCESS/two FAILURE.
Linux/macOS runtime16/Pear13/1.2=13/each2004=20 pass with five clean native/
fixture exit0 and quitACK records each. Windows113683752681 fails1.2 fixture
shutdown after app-closed, before database-closed; native exit0/ACK true, fixture
forced,2004 profiles not run. Cause unproved; original log retained. Pear
113683752715 completes846 domain/237 dev PASS; built236PASS/1FAIL exit1,
2004-3 bound-response correction click after resume waits for visible/enabled/
stable in a nested frame. Side Panel/host lanes not reached. Both binding and
first-provenance journeys now scroll the resumed outer iframe into viewport
and assert readiness before clicking correction. All recovery/state/proof
assertions and time budgets are retained; no forced click or retry is added.
This follows the existing interop readiness step. Original CI timeout retained;
changed journeys and complete new-head CI/log/review gates remain required.
No runtime, engine adaptation, source checksum or receipt/history change.

Changed built journeys complete6/6 PASS exit0 (2.1–2.5seconds each); footer and
process completion checked. Original failures remain retained. The current
head requires complete exact-head CI and native/review gates before READY.

Integrated owner225 viewport correction b32a9aba without rewriting either
history: documentation conflicts retain both evidence blocks. Changed built
binding/provenance6 completes PASS exit0 under CI30second test budget, including
5000-type compaction plus lost ACK/Retry/Close/resume/current-type correction.
Parent225 new-head run37890454443 is pending; historical0ba failures remain.


ADR-153 original0PASS/12FAIL consecutive learner/pattern histories retained;
focused24/24 PASS exit0 with unchanged quotas and expanded mixed-origin durable
refusal/forged witness/exact receipt retry/Close/resume. Existing built provenance
and native histories now exercise5000 writes perresponse; native2004=22 and
1.2=13/five clean shutdown+ACK perOS/current-head CI/review required. Full domain/
build/browser pending; general witness/full matrices OPEN. Epic OPEN/prod DISABLED.

Fresh full domain completes867/867 across127 files, every footer/plan/exit
checked, no skipped/cancelled cases; final build/typecheck completes exit0.
Focused/full browser and actual current-head CI/review gates remain required.

Expanded focused built19/19 completes PASS exit0: native4/reload3/Close6/
binding3/provenance3, including5000 learner/pattern writes and five-entry
provenance witness. The URI selector matched no file; URI3 are in the existing
scorm-identifiers journey and remain included in the full172 run now underway.
No22-test focused claim; exact-head CI/review remain pending.

Full172 built SCORM browser completes168PASS/4FAIL exit1: support-download
timeout,2004-2 target navigation and same-SCO retry DOM.describeNode/session
closed, managed ServiceWorker permission denial. Logs/traces retained; driver
cause unproved. All expanded response/type-history/provenance3, binding3, URI3,
Close6/reload3/native4 pass. This is not clean full local acceptance; Chromium151
is supplementary and supported153 CDN remains blocked.

Parent225 current b32/run37890454443 and226 current19c4efaf/run37890698928
native Linux/Windows/macOS logs are all inspected: runtime16/Pear13/1.2=13,
2004=20 (225) or21 (226), five clean native/fixture exit0+quitACK records eachOS.
No forced shutdown. Both Pear jobs remain pending; no READY claim. Original225
head0ba Windows failure and local browser failures remain retained/unattributed.
Owner225 b32a9aba now completes all10 current-head jobs/logs:846 domain,
237 dev/237 built/Side Panel4 and threeOS native2004=20, five clean exit0+ACK
records each; READY. Owner22619c4efaf/run37890698928 completes nine SUCCESS
jobs, including threeOS native2004=21/five clean exit0+ACK records each.
Pear855 domain/237 dev/237 built/host3/browser-host2/Lime/SCORM-Lime1
complete, but Side Panel starts four tests without a complete footer before
job cancellation at the25minute deadline (05:53:04–06:18:23 UTC; cancellation
06:18:17). Original logs/artifact11599286462 remain; this is not full acceptance.
Increase only the Pear job scheduling ceiling25→35minutes for both browser
lanes plus host/Side Panel work. Per-test/assertion/fixture deadlines, counts,
retries and all product budgets are unchanged. New-head all10 CI/logs and
review gates remain required; no historical/descendant evidence substitutes.


ADR-154 original XML boolean whitespace0PASS/12FAIL→named26 domain PASS
exit0, typecheck/build complete exit0. Shared sequencing/package boolean-token
normalization preserves XML/source hashes, rejects non-XML/internal spaces, covers
unused definitions/canonical groups/scopes/visibility/completion/shared-data and
exact retry/SQLite reopen. Existing choice3 and actual native2004 fixture journeys
expanded; fresh full domain/browser/current-head all10 CI/reviews pending. Full
XML typed binding remains OPEN; epic OPEN/prod DISABLED.

Fresh full-domain cache completes893/893 tests across128 files, every plan,
footer and exit checked, zero fail/skip/cancel and aggregate exit0. PDF5/4/4
complete in the fresh run. Expanded built choice3 completes PASS under30second
CI test budget; supplemental native fixture4 completes PASS exit0 (28.6s),
including authored spaced visibility/tracked flags, old full22 checks unchanged.
Full172 SCORM browser acceptance is now running; no complete full-browser claim.

Parent227 original9d7b/run37892225012 completed all10 jobs/logs:
867 domain/237dev/237built/SidePanel4; actual threeOS runtime16/Pear13/1.2=13/
2004=22/five clean exits+quitAcknowledged each. This is historical after04e299
merged the scheduling ceiling; current run37893318621 still pending.
Parent2268f706306/run37893220968 Windows fails2004-3 fixture shutdown after
app-closed before database-closed: nativeExit0/quitAcknowledged true, fixture
forced/null exit;2004-4 not run. Original log retained, cause unproved. Linux/
macOS complete2004=21/five clean exits+ACK each; Pear/run still pending. No
current-head READY or complete actual-platform assertion based on descendants.

Full172 SCORM built browser completes169PASS/3FAIL exit1 (7.3m):
2004-4 pipwerks support download waits until60second deadline;2004-3 target
navigation reports DOM.describeNode/Internal server error/session closed;
managed ServiceWorker registration is denied. Logs/traces are retained, cause
unproved beyond observed policy/error. All changed choice3 and supplemental
native4 pass, as do binding/provenance/URI/Close/reload related journeys. This
is not clean full local acceptance. Final893 domain/128files, typecheck/build,
focused26 and focused built7 all complete PASS exit0; current-head CI/native
threeOS/review gates remain required. No quota/assertion/retry changes.


ADR-155 original XML numeric probes0PASS/4FAIL,1PASS/6FAIL,0PASS/9FAIL retained.
Initial focused36PASS/4FAIL retained: three incorrect fixture targets repaired,
real accepted+000.50 completion CMI bootstrap mismatch fixed via canonical
translation. Later40PASS footer/wrapper exit1 retained; explicit repeat40PASS/
zero fail/skip/cancel NODE_EXIT=0 is final focused evidence. Fresh full907/907,
129 files/all plans/footers/exits checked, aggregate exit0; typecheck/build exit0.
Expanded choice3/weighted1/selected-pool3 completes7PASS exit0 with unchanged
ACK/retry/Close/resume/navigation/proof assertions. Actual native manifest
includes spaced+0003 attemptLimit; supplemental4/full172/current-head CI pending.
Source adaptation v40 unchanged; JS double precision/10000 and2048 integer
ceilings remain. Parent2268f latest10/logs READY855/237/237/4/native21 clean5ACK5,
original Windows forced shutdown retained/unattributed after unchanged retry;
parent22704e READY867/237/237/4/native22 clean5ACK5. Owner228 CI pending.
Epic OPEN; production DISABLED; full matrices/external blockers unchanged.

ADR-155 notation follow-up: original completion0PASS/1FAIL and scaled passing
score0PASS/3FAIL retained; notation fixes and signed score3 regressions produce
final focused43PASS/build/typecheck exit0. Earlier full907 is historical; full
browser in progress saw a server/build change, so not final-tree evidence.
Fresh final domain/browser required. Intermediate38PASS/2FAIL reveals shared
engine18-digit fractional ceiling (valid XML20digits fails bootstrap): internal
OPEN next slice; do not claim full numeric conformance or external blocker.

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


ADR-156/v41 fixes the retained6+6 original shared decimal fraction/range failures.
Focused42/full domain919 across130files/typecheck/build/expanded built7/
supplemental native4 complete exit0; after changing native probe field to global
score.max, its sole affected domain file revalidates5PASS, other914 unchanged.
Native2004 controller requires23 checks; historical1.2 remains13. Exact CMI
strings survive atomic406/407 refusal, typed replay/exact retry/SQLite reopen
and trusted v40-envelope resume. Full fixed172 browser pending; JS-double/full
numeric response/history/schema matrices OPEN. Parent229c3b Windows forced
fixture shutdown after app-close/database-close absent is retained/unproved;
Linux/macOS owner logs each16/13/13/22/22/22 with five clean exit0/ACKs. Pear
owner still running; no READY claim. Epic OPEN; production DISABLED.

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


ADR-157 reuses XML atomic token normalization at recognized IMS rule/rollup/
selection enumeration reads; present empty operator now refuses, omission
defaults/vocabulary/IDs/strings/history remain exact. Original9FAIL+3FAIL
retained. Focused55/typecheck/build completes exit0;12 token tests exercise
currently supported vocabulary/defaults, used/unused invalid definitions,
immutable XML/hash, exact retry, SQLite reopen/resume and exactly-one proof.
Expanded13 built/native4/full931domain/full172browser pending. Actual native
fixture includes token-authored never/always-not controls;2004=23 unchanged.
Full schema/condition semantics/reference/history/operations matrices OPEN;
external blockers unchanged. Epic OPEN; production DISABLED.

Fresh full domain931/131files completes all per-file plans/footers/five counts/
exit0 and aggregate exit0. Native4 completes PASS exit0 (27.3s), build/typecheck
exit0. Expanded built13 initial run completes10PASS/3FAIL exit1 (1.0m): third-/
fourth-edition retryAll and fourth-edition weighted navigation. All three traces
show DOM.describeNode/internal server error/session closed; cause unproved.
No generic driver claim or assertion/timeout weakening. Preserve initial logs/
traces and run the required full172 suite on one fixed source/build. The full
run will independently exercise every changed journey; pending results are not
PASS. Current-head all10 CI/log/review/native23 gates remain required.

Next internal XML dateTime/duration whitespace probe retains0PASS/6FAIL on this
tree (scorm-xml-time-whitespace-before.log); standards XSD collapse binding is
confirmed but not changed in this token slice. Full standard/calendar duration
profile remains OPEN; no external-blocker attribution for this internal bug.

Parent229c3b8592d/run37899289895 is now READY: all10 latest completed SUCCESS
jobs/full logs inspected, fresh owner head/reviews clear. Pear910/237dev/237built/
SidePanel4/host lanes; each Linux/macOS/Windows runtime16/Pear13/1.2=13/three
2004=22, five clean native/fixture exits and quitAcknowledged perOS. One
unchanged Windows-only retry passed; original forced shutdown after app-close/
no database-close remains retained/unattributed. This does not establish a cause
or fix or replace owner222e2b's absent CI. Successor2306ec owner CI still running.

Fixed-source/build full172 SCORM browser completes170PASS/2FAIL exit1 (7.7m):
managed ServiceWorker permission denial and fourth-edition weighted navigation
DOM.describeNode/internal server error/session closed. Both traces inspected;
DOM root cause unproved. Twelve of thirteen changed sequencing journeys and
all four native fixture journeys pass in full. The two retryAll journeys that
failed in the initial focused13 pass unchanged in full; all original10/3 logs/
traces remain. Weighted-only recheck follows; no clean full local/browser/native
conformance claim, and no policy/assertion/deadline/retry relaxation.

Unchanged-tree weighted-only recheck completes1PASS exit0 (5.5s), retaining
every viewport/ACK/retry/rollup/proof assertion. This plus twelve affected
sequencing journeys passing in full covers all thirteen changed journeys across
separate runs; it does not make the original10/3 or full170/2 runs PASS or prove
DOM cause. Supplemental native4 remains PASS. Parent2306ec completed Windows/
macOS logs each16/13/13/23/23/23, five clean exit0/quitAcknowledged records and
no forced shutdown; Pear/Linux owner jobs still pending. Current successor
requires its own all10 exact-head CI/full logs/native23/fresh review gates.


ADR-158 reuses XML atomic token normalization in the six dateTime/duration
importer fields; source stays v41 and original ZIP/XML/hash/clock accounting/
CMI/receipt/proof/Gregorian/timezone/precision/order/quota guards remain.
Original6FAIL; focused32/35 and full937/940 across132files retained. Three
failures came from a new fixture retrying a closed capability: server correctly
refused. Fixed fixture asserts closed refusal/exact retained receipt, pre-close
retry, host absolute7000ms/experienced2000ms resume and expiry denial; corrected
standalone9PASS diagnostic only. Final fresh focused/full verification pending.
Expanded calendar3/duration3 built and native4 import six time fields; native
fixture calendar2000–2099/authored3600-second limits do not change test budgets.
Full time/reference/matrices remain OPEN; external blockers unchanged.
Epic OPEN; production DISABLED.

Final committed-test focused35 completes35PASS/zero fail/skip/cancel exit0
(16.7s). Fresh-cache full domain940/132files completes all per-file plans/
footers/five counts/exits and aggregate exit0, with the product closed-capability
guard retained. Expanded built calendar3/duration3 completes6PASS exit0 (31.6s);
build/typecheck exit0. Final supplemental native4/full172 browser and final
typecheck follow on fixed source/build. Original32/3 and937/3 remain separate;
no failure or historical acceptance is overwritten.

Final supplemental native4 completes PASS exit0 (31.3s), preserving all
authority/absence/provenance/long decimal/ACK/retry/resume/proof/shutdown checks
with all six time fields admitted. Final typecheck exit0; build source remains
fixed v41. Full172 SCORM browser now runs on one unchanged source/build; every
result/trace will be inspected, without a clean full claim for pending results.

Final XMLtime tree: full172 browser168PASS/4FAIL exit1 (8.2m), all four traces
inspected. Fourth asset and second retryAll DOM.describeNode/session closed,
fourth support download60s timeout, managed ServiceWorker permission denial.
DOM/download causes unproved; changed calendar/duration6 and native4 pass in
full. Unchanged DOM-only recheck1PASS/1FAIL exit1 (12.9s), retryAll passes and
asset still DOM/session closed; original/recheck logs/traces remain. No clean
full supplementary local claim. Domain940/132files all plans/footers/counts/
exits and aggregate exit0, focused35/built6/native4/typecheck/build exit0.
Parent2306ec owner37901713762 READY:10completedSUCCESS/full logs inspected,
Pear919/237/237/4 and all3OS16/13/13/23×3,clean5ACK5; reviews empty.
Parent2317d owner37903569249 nineSUCCESS/WindowsFAIL:2004-2 fixture forced
after app-closed/no database-close phase, nativeExit0/quitACK; cause unproved.
One unchanged Windows-only retry running; original retained. Owner222e2b CI
absent. Next internal interaction-result fractional cap original6FAIL retained;
not fixed by XMLtime. Full matrices OPEN; external gates BLOCKED; epic OPEN;
production DISABLED. See ADR158; no acceptance/history deletion.

ADR159 interaction-result decimal capacity: original v41 probe six failures
(raw+facade/all three2004 editions), numeric learner/range values pass first.
Checksum-locked v42 removes only18-place result fraction ceiling, preserves
finite4096-character/type/vocabulary/dependency/error/receipt/proof guards;1.2
source unchanged. Wrong-cwd/installer-name/forward-chain diagnostics and two
focused10/35 failures retained, corrected engine39/6 false fixture assumptions
retained; final focused45PASS exit0 (16.5s), typecheck/build exit0. New9domain
raw/facade/preload/forged atomic replay/v41 SQLite resume; controller24/1.2=13
with pre-write exact-result native resume probe, existing built wide-real3.
Fresh full949/133files running; built3 completesPASS exit0. Full172/native4
follow without deadlines/assertions/retry/policy changes. Owner-head gates
required independently; no clean full local claim. Epic OPEN/prod DISABLED.

Result v42 initial full949:948PASS/1FAIL/133files aggregate exit1 retained;
sole failure installer predecessor chain lacked v42 reversal. Corrected exact
chain includes v41 as an input and retains every historical checksum/input,
install/idempotence/unexpected-byte/version check. Focused installer1PASS
exit0 (42.8s), supplemental native4PASS exit0 (33.6s), final typecheck exit0.
Fresh full949 running, no prior full PASS claim. Parent231 latest2 READY with
10current-owner full logs/reviews; all3OS native23clean5ACK5; original Windows
failure/unproved cause retained. Parent2329SUCCESS/Pearrunning.

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

ADR160 ADL rollup tokens: primary CAM2nd/3rd/4th§5.1.11 and ADL schema xs:token;
original four-field/three-edition12FAIL retained. One shared importer loop reuses
XML atomic-token normalization; omission defaults/vocabularies/invalid refusal/
ZIP/hash/identity/receipts/history/proof retained. New9domain all enums/used+unused
malformed/defaults/SQLite exact retry/resume/one proof. Focused97PASS exit0
(20.0s), typecheck/build exit0. Engine unchangedv42SHA0447a6/1.2eb7539; controller
24/1.2=13. Full958/134files and built3/native4/full172 pending. No pending PASS
claim/deadline/assertion/retry/policy changes. Parent234d25 actual PRnumber,CI
running; parent23203cd READY10full logs/reviews940/237/237/4/native3OS23clean5ACK5.
Owner222e2bCI absent; matricesOPEN/externalBLOCKED;epicOPEN/prodDISABLED.

Expanded built ADL3 completes3PASS exit0 (21.0s), supplemental native4 completes
4PASS exit0 (34.8s), including four ADL attributes with unchanged all prior
authority/absence/result/journal/ACK/retry/resume/proof/shutdown checks. Fresh
full958 domain/134files now running; fixed full172 browser follows after it
ends. No clean full local or pending PASS claim. Engine hashes unchangedv42.

ADL-token fresh full domain completes958PASS/134files, every file plan/footer/
five counts/exit0 and aggregate exit0 inspected. Expanded built3/native4 PASS,
fixed full172 browser running; no pending full-browser PASS. Parent234d25
Windows1.2 original forced fixture cleanup retained/cause unproved; owner CI
incomplete. Engine/current adaptation remains v42, no pending READY claim.

Fixed source/build full172 browser completes168PASS/4FAIL exit1 (9.5m),
all four failure traces inspected: managed ServiceWorker permission denial;
DOM.describeNode/session-closed during2004-4 retry,2004-2 duration and2004-3
ADL next-SCO delivery. DOM causes unproved; no blanket driver attribution.
All native4 pass in full; ADL2/3 pass here and earlier focused ADL3/3 PASS
retained. Original full failure remains; one unchanged exact-three DOM
diagnostic follows, no clean full/standard Chromium153/native proof claim.

ADL unchanged exact-three DOM diagnostic completes3PASS exit0 (17.5s);
original full172168PASS/4FAIL remains retained, DOM causes unproved. Fresh
full958/134files + focused97 + built3 + native4 + typecheck/build PASS; final
installed source hashes0447a6/1.2eb7539 unchanged. Own CI/review still pending.

ADR161 shared targetID xs:anyURI outer-XML-whitespace: original local/system
four-whitespace-kind probe0PASS/8FAIL exit1 retained; one shared targetID read
reuses xmlAtomicToken before existing bounds/duplicate/profile checks. New6
domain canonical4000/immutable hash/invalid-used-unused/scoped exact receipts/
SQLite resume/permissions/redaction/learner separation/one proof. Corrected
focused91PASS exit0 (17.1s), typecheck/build exit0. Initial root runner and
85PASS/one syntax TransformError/typecheck/build failures retained; corrected
computed-key syntax only. Built2/native4/full964/135files/full172 pending.
Native only2004-4 gains25th named shared-target check;1.2=13/other2004=24.
Engine unchangedv42SHA0447a6/1.2eb7539; defaults/authority/deadlines unchanged.
CAM/schema writeSharedData default conflict OPEN, no full XML anyURI claim.
Owner235de1CI pending;234d25original9SUCCESS/Win1.2fixtureForced retained,
all ten original full logs inspected, one unchanged Windows retry pending.
Owner222e2bCI absent;matricesOPEN/externalBLOCKED;epicOPEN/prodDISABLED.

Final added native shared-target assertions/typecheck complete; native4PASS
exit0 (25.0s), built2PASS exit0 (11.0s). Fresh full964 domain/135files completes
964PASS, zero fail/cancel/skip; each file plan/footer/all five counts/exit0
and aggregate exit0 inspected. Fixed full172 browser running on unchanged
source/build. Installed source hashes0447a6/1.2eb7539 unchanged. Independent
next XML collection ID/IDREF whitespace probe0PASS/9FAIL exit1 retained;
no collection/product changes in this slice.

Fixed full172 browser completes168PASS/4FAIL exit1 (7.6m), all four
traces inspected: fourth support download60sec timeout/cause unproved;
managed ServiceWorker permission denial;2004-2 retry and2004-3 retryAll
DOM.describeNode/session-closed at next-SCO delivery/cause unproved. Both
changed built shared/local-system journeys and native4 pass in full, including
new canonical-ID404/store/resume assertions. Original full failure retained,
no unrelated repeat just to obtain green counts; no clean full local/
Chromium153/actual native proof claim. No product/build/test/timeout/assertion/
retry/policy changes during full acceptance. Engine hashes0447a6/1.2eb7539
verified unchanged. Fresh owner CI/reviews still required before READY.

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

ADR163 implementation: two shared ID/IDREF reads use existing XML-only token
helper. Existing collection fixture gains optional manifest input and is reused
for native imports, preserving all previous authored sequencing bindings.
Corrected focused59PASS/zero fail/cancel/skip exit0; typecheck/build exit0.
Built collection3PASS exit0 (10.8s), supplemental native4PASS exit0 (27.3s).
Original probe9FAIL and NCName6PASS remain retained. Initial wrong-root runner
and wrong native filename diagnostics exit1/no tests retained; corrected paths
only, no source/assertion/deadline changes. Full973/136files and full172 running,
no pending PASS claim. Parent236 now READY: own10 completedSUCCESS/latestfull
logs/freshhead/review_threads[]; Pear964/237dev/237built/SidePanel4, all3OS
16/13/13/24/24/25 and five clean ACK/exit0 each. Parent237 diagnostics own CI
pending; no Windows failure cause or product repair inferred. MatricesOPEN,
external inputsBLOCKED; epicOPEN/prodDISABLED.

ADR163 fresh full domain973PASS/136files completes with zero fail/cancel/skip;
every file plan/footer/five counts/exit0 and aggregate exit0 inspected.
Build/source frozen for full172 browser; no pending browser PASS claim.
Original collection binding9FAIL and independent NCName6PASS retained.
Independent subsequent objective XML anyURI original probe11FAIL exit1 on
unchanged ADR162 tree, canonical manifest comparison; separate ADR164 work,
not part of this implementation. #222 current e2b owner again has no PR runs;
no skip-CI marker in commit message, cause remains unproved. No synthetic
workflow event, unrelated empty commit or descendant substitution.

Final fixed-tree full172 browser:167PASS/5FAIL process exit1 (8.5m), all five
trace/error contexts inspected. Fourth-edition download60s timeout/cause
unproved; managed ServiceWorker denial;2004-3 navigation target/retry/retryAll
next-SCO heading assertion failures (DOM/session evidence recorded in trace,
root cause unproved). Changed collection3 and supplemental native4 PASS within
full run. No unrelated repeat to obtain green counts; no clean full local or
supported153/actual native claim. Original full failure and diagnostics retained;
no source/build/test/deadline/assertion/retry/policy changes during acceptance.
Parent237 own Windows/macOS actual native full logs now inspected:16/13/13/
24/24/25, five clean ACK/native+fixture exit0 each. Measured Windows2004-3/4
app-to-database-close interval3804/3808ms; cleanup completes3810/3813ms within
unchanged five-second budget. This locates a slow synchronous operation in
successful measured runs, not the cause of prior forced failures. Linux/Pear
remain pending; no diagnostic owner READY or product repair claim.

ADR164 implemented five shared XML objective-name reads using existing helper;
no product native fixture or engine changes. Original11FAIL probe retained.
Focused74PASS/zero fail/cancel/skip exit0 (21.9s); typecheck/build exit0,
accepted typecheck after new canonical target/learner assertions exit0.
Built system-objective3PASS exit0 (13.0s); supplemental native4PASS exit0
(27.9s), all absence/API/authority/journal/recovery/proof/clean-shutdown guards
unchanged. Native absent-objective301 checks are not replaced by artificial
preloaded objectives; actual executed objective-map evidence is domain/built,
not a new native objective-mapping claim. Fresh full984/137files/full172 now
running, no pending PASS or ownerCI readiness claim. Parent238259 Draft own CI
run37917819864; parent237ab82 Draft nine complete logs checked/three OS clean,
Pear pending. MatricesOPEN/externalBLOCKED; epicOPEN/productionDISABLED.

ADR164 fresh full984 domain/137files completes984PASS/zero fail/cancel/skip,
every file plan/footer/five counts/exit0 and aggregate exit0 inspected.
Full172 browser still running on frozen source/build, no pending PASS claim.
Corrected interpretation of ADR162 timings: cumulative app-closed→database-
closed interval includes the preceding synchronous phase write. It narrows the
operation region but does not separately time DatabaseSync.close or prove
SQLite/WAL/driver cause. Node24.0 source review shows finalization/session/
SQLite close within the method; actual Windows runner is24.21.0, so source
version and future direct operation timing require their own evidence. Existing
five-second guard and every prior original failure remain unchanged/retained.

Parent237ab82 now READY: run37916286618 all10completedSUCCESS, all10latest
full logs/freshhead/review_threads[] checked. Pear964/237dev/237built/SidePanel4
plus host3/browserhost2/realLime/SCORMhost1; three OS actual16/13/13/24/24/25,
five clean ACK/exit0/no forced each and complete SCORM phase timing sets.
Cumulative Windows3.8s app/database gap is not a direct database-close duration;
preceding phase-write overhead is included. No original failure cause/repair
claim. Parent238 own gates pending; objective full browser still running.

Final fixed-tree full172 browser170PASS/2FAIL process exit1 (10.0m), both
complete trace/error contexts inspected. Fourth-edition support download60s
timeout/cause unproved; managed ServiceWorker permission denial. Changed
system-objective3 and supplemental native4 PASS inside full. No unrelated
rerun solely to obtain green counts; no clean full local/supported153/actual
native objective-mapping claim. Source/build/tests/timeout/assertion/retry/
policy unchanged during acceptance; engine hashes0447a6/1.2eb7539 verified.
Parent237 READY10/latestfull logs/fresh reviews; parent238 ownWindows/macOS
complete native logs checked:16/13/13/24/24/25, five clean ACK/exit0/no forced
each/complete monotonic phase sets. Parent238 Linux/Pear pending, Draft.
Original distinct RFC2396-empty absolute URI probe on unchanged ADR162 tree
6tests4PASS/2FAIL exit1; expanded separate-value12tests8PASS/4FAIL exit1,
only second-edition raw/facade accepts custom:/custom:#fragment incorrectly.
RFC2396 AppendixA requires nonempty hier/opaque part; RFC3986 admits path-empty
for contemporary profiles. Separate subsequent binding, no current URI patch.
Full matricesOPEN/externalBLOCKED; epicOPEN/productionDISABLED.

ADR165: initial wrong-working-directory edit command failed before mutation; later shell
exit0 masked that diagnostic, never counted as acceptance. First candidate used
String.replace replacement text containing literal $&, which substituted the
matched string and generated checksum-valid malformed JavaScript. Preserve
malformed engine/correction copies outside source, focused1PASS/2SyntaxErrorFAIL
exit1 and typecheck exit0/build exit1 logs. Callback replacement preserves literal
pattern text. Accepted installer and node --check exit0. Corrected focused17PASS/
1FAIL exit1 was a fixture cardinality error: likert permits only one correct
pattern, so appending slot1 correctly returned351 before URI validation. Use a
new valid interaction's empty pattern0 and retain existing-pattern replacement;
product cardinality remains unchanged. Final focused18PASS/zero fail/cancel/skip
exit0 (36.0s), including all predecessor/idempotence/syntax installer checks.
Corrected typecheck/build exit0; final updated-test typecheck follows.

ADR165 full acceptance pending. Parent238 own259/run37917819864 now READY10/latest full logs/fresh head/reviews[];973/237/237/4, all3OS native16/13/13/24/24/25/five clean ACK+exit0 each. EpicOPEN/prodDISABLED.

Final updated-test typecheck exits0. Targeted built URI3 + supplemental native4
complete7PASS exit0 (47.9s), all previous assertions retained. Fresh full domain
993PASS/138files, all package test filenames matched (completion order varies),
every plan/footer/five counts/individual exit0 and aggregate exit0 inspected.
An initial inspection incorrectly zipped completion-order output against source
order; it refused acceptance without changing/rerunning tests. Correct filename
mapping confirms all files present and complete. Fixed-tree full172 browser
is running; no pending PASS or clean full local/native-platform claim.

Parent239182/run37919418466 now READY: all10completedSUCCESS/latest full logs
and fresh exact-head/review_threads[] checked. Pear984/237dev/237built/SidePanel4
plus host3/browserhost2/realLime/SCORMhost1; actual3OS16/13/13/24/24/25 and five
clean quitACK/native+fixture exit0/no forced each. Parent238 own gates READY.
Mango51PASS/3 paid-accountSKIP remain unavailable-account evidence, not paid
service proof. All original failures retained, no Windows cause/repair claim.
Full local172 still running on fixed source/build/tests.

Exact second-edition RTE/errata retrieval remains unresolved: public viewer
returned HTML/no selected PDF and public index shell fetch returnedHTTP403;
Citeseer primary-document mirror fetch alsoHTTP403. No alternate-access bypass
or exact reference/errata/IP certification claim. RFC2396 AppendixA reg_name
explicitly admits semicolon along with colon/@; do not invent a host-only or
semicolon refusal. No authority patch was made on that unconfirmed suspicion.

Final fixed-tree full172 browser171PASS/1FAIL, process exit1 (9.6m). Sole full
trace and error context inspected: managed ServiceWorker enumeration permission
denied. All changed built identifiers3 and supplemental native4 pass within
full; timestamp3 and prior journeys retain assertions. This run's download
journeys pass; historical download/DOM failures remain preserved/unattributed.
No unrelated rerun to obtain green counts, no source/build/test/timeout/retry/
assertion/policy changes during acceptance. No clean full local/supported153/
actual native owner claim. Final hashes8bd81c/1.2eb7539 verified. Owner-head CI
and review gates remain pending. EpicOPEN/prodDISABLED.

ADR166 isolated fixture/controller direct databaseCloseMs measurement added to
existing phase line without extra logging call. Existing six-phase/order/IPC/
server/database/filesystem/5000ms/exit0/no-forced checks retained; five real
IPC fixtures additionally verify direct-duration metadata inside cumulative gap.
Typecheck/build exit0. Focused5 then native4/full993/full172 pending, no pending
PASS or original Windows cause/product repair claim. Enginev43SHA8bd81c/1.2eb7539
unchanged; parent240 ownCI pending;237/238/239 own gates READY. EpicOPEN/prodDISABLED.

ADR166 typecheck/build exit0; existing five-fixture IPC lifecycle completes
5PASS/zero fail/cancel/skip exit0 (6.7s), with direct-close metadata and all
prior close/partial-HTTP/phase/timing requirements. Supplemental native4 completes
4PASS exit0 (29.4s), preserving every prior assertion and authority/recovery/proof
check. Fresh full993/138files running; full172 follows once domain lifecycle
releases its shared ports. No pending PASS or actual Windows root cause claim.

Reviewed matching actual CI Node24.21.0 source (not inferred from24.0):
https://raw.githubusercontent.com/nodejs/node/v24.21.0/src/node_sqlite.cc
DatabaseSync::Close lines1356–1365 finalizes tracked statements, deletes sessions
and calls sqlite3_close_v2, then checks the return code and clears connection.
This confirms the measured JS call includes those internal operations, not which
operation caused an old failure or a platform gap. Existing WAL/busy_timeout5000
and product database/durability policy stay unchanged. Controller node --check
exit0; no separate controller/platform execution claim before actual CI.

Fresh ADR166 full domain993PASS/138files complete, every exact package filename/
plan/footer/five counts/per-file exit0 and aggregate exit0 inspected. Fixed-tree
full172 SCORM browser running, no pending PASS/clean local/native claim. Matching
Node24.21.0 implementation now reviewed; original forced-failure causes unproved.
Independent language registry requirements reviewed against fourth-edition RTE
4.1.1.7: ISO639-1 two-letter and ISO639-2 bibliographic/terminology three-letter
codes, IANA/private prefixes and undefined additional subcode requirements.
No blanket BCP47/country/current-registry rejection or production patch on this
diagnostic tree; named missing registry vectors remain separate successor work.

Final fixed-tree full172 browser completes169PASS/3FAIL exit1(8.1m). All three
complete traces and error contexts inspected: managed ServiceWorker enumeration
denied; 2004-4 support download60s timeout; 2004-2 interaction-record next-SCO
heading blocked by DOM.describeNode/session-closed error. Last two root causes
remain unproved. Every changed native4 journey passes in the full run; prior
assertions/deadlines/retries/policies unchanged. No clean full local claim.
Parent240 native Linux/macOS/Windows complete on exact5e9 with runtime16/Pear13/
1.2=13/2004-2=24/2004-3=24/2004-4=25 and all five ACK/both exit0/no forced;
Pear CI still running. These parent runs have cumulative phases only, not the
new direct-operation measurement; owner CI is required before READY.
Independent unchanged-parent language probe36tests0PASS/36FAIL exit1 confirms zz
admission in all six writable language paths across raw/facade and three editions.
Official LOC639-2 and IANA factual snapshots prepared separately:190 two-letter
current/historical registrations,506 bibliographic/terminology three-letter facts,
plus qaa-qtz local-use range. Preserve historical aliases/private/undefined extra
subcode policy; no language code changes in this diagnostic slice.

## ADR167 / ISO language primary registry

 implemented; full acceptance and owner CI pending. Epic #133, successor
of ADR166 / PR241 exact95d1f108. Original unchanged-parent probes6tests0PASS/
6FAIL and six-field raw/facade three-edition36tests0PASS/36FAIL exit1 demonstrate
unregistered ISO two-letter zz admission. Original logs/probes retained.

Use one installed shared primary pattern in CMILang and all five localized
patterns, not caller-specific guards. Reject unknown two/three-letter ISO primary
codes and unassigned ordinary one/four-to-eight-letter primaries with406, preserving exact case/text and failed append/replacement/preload/
server transaction atomicity. Keep empty preference/default, nonempty localized
language, 250 tag capacity, existing Unicode scalar/body capacities and delimiters.
Read factual registry snapshot only at checksum-locked installation, no runtime
network, label/Intl.Locale inference or new dependency.

Snapshot sources (facts only; no reference implementation/test corpus):
- LOC ISO639-2 bibliographic/terminology current table,487 rows:506 distinct codes.
  https://www.loc.gov/standards/iso639-2/ISO-639-2_utf-8.txt
- IANA file date2026-09-17, reviewed2026-10-09:190 current/historical two-letter
  registrations, including bh/in/iw/ji/jw/mo/sh absent from current LOC alpha2.
  https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
- LOC changes: retain historical jaw/mol/scc/scr, without canonicalization.
  https://www.loc.gov/standards/iso639-2/php/code_changes.php
- ISO reserved local-use range qaa–qtz retained (520 codes).
Canonical factual snapshot SHA256 ba31ec9e26eceaf7a82e2019f5b6c1700d5d03506cecf8b0dee0ddec721e9f5b;
this is the repository JSON hash, not a claimed original network-byte hash.
Shell LOC fetch403 retained; facts extracted through readable source pages with
all487 LOC row positions and the complete two-letter IANA section checked.

Scope: registered ISO primary codes and reserved i/x prefixes. Reject ordinary
one-letter and 4–8-letter reserved primaries; ADR115 subcode policy remains unchanged. IANA i-prefix membership, registered country/subcodes,
undefined additional-subcode requirements/equivalence and exhaustive edition
matrix remain OPEN, with no external-license blocker inferred for those vectors.
Private i/x spellings, case/multiple subcodes/local-use/historical text stay exact.
No blanket modern BCP47/country/canonicalization policy. Independent1.2 plain
characterstring language remains unchanged.

Requirements reviewed: ADL third-edition RTE1.0 §4.1.1.7(pp75–76), fourth-edition
RTE1.1 §4.1.1.7(pp73–74), second-edition addendum1.2 §2.9/§3.1(pp34/84) covering
RFC3066 part bounds and empty preference; exact original legacy RTE PDF remains
unresolved (old URL returns HTML, not a reviewed PDF).
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf

Checksum-locked pear-language-primary-registry-v44,2004 ESM SHA256
a8a7d45aae0d80cd982ab7260c2279b304e5da5f364622a636f5f879e426c9a3;
1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Exact v43 forward/reverse input and every historical pin retained;
unknown bytes/version still refused. Trusted v43 snapshot markers remain accepted
while invalid language snapshots fail closed without rewriting historical data.

Original36 regression replacements pass/exit0. Additional three-edition vectors
exercise all1220 factual/local-use codes with exact uppercase/subcode text,
strict preload across six writable plus readonly LMS-comment field, and typed
forged all-six-field rollback/exact receipt/SQLite close-reopen/v43 resume with
no official proof/certificate. New named native guard covers preference qtz and
historical localized scc plus ten406 refusals, all previous301/403 absence and
history/recovery/proof guards retained. Counts become runtime16/Pear13/1.2=13/
2004-2=25/2004-3=25/2004-4=26. Actual OS logs still required before native PASS.
Built preference-language journeys retain all lost ACK/exact retry/close-resume/
capacity/proof checks and add all six fields. Supplemental native4+built3 complete
7PASS exit0(36.5s), no actual-platform claim.

Initial focused90tests87PASS/3FAIL exit1 retained: durable test fixture attempted
to replace the manifest-preloaded immutable objective ID. Correct fixture uses
existing primary ID, without product validation relaxation. Corrected focused,
fresh full domain and fixed full172 browser remain pending until full footers/
counts/exits and traces inspected. Initial wrong-cwd editing/absent test invocation
exit1 retained; no success inferred from that diagnostic.

Parent2405e9/run37922413556 READY own10/latest full logs/fresh review, Pear993/
237dev/237built/SidePanel4, native3OS16/13/13/24/24/25 and five clean ACK/both exit0/
no forced each. Parent24195d1/run37924833794 CI pending; direct db-close metadata
is diagnostic only, no original Windows forced-failure cause or repair established.
Owner222e2b current CI absent/Draft; historical10dc proof is not current proof.
Chromium151 supplemental; supported153 downloadCDN403. Local historical failures
retained. Full matrices OPEN/license/authorized exports/Rustici account/actual
Safari+Android/reviewed production inputs BLOCKED. Epic OPEN; production DISABLED.

RFC3066 §2.2 reviewed directly: two/three-letter assignments are ISO639-1/2;
i/x reserved; other primary values unassigned without revision. Second-edition
addendum §2.9 explicitly references RFC3066. SCORM third/fourth permits both
bibliographic/terminology spellings, so do not apply RFC3066 preferred-code
rewriting to accepted authored text.
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2
Original separately executed30 reserved-primary cases0PASS/30FAIL exit1 retained
(a/A/abcd/abcdefgh/abcd-US × raw/facade × three editions). Earlier six-case probe
fails at a before later loop values; initial scratch-copy substitution did not
change zz and is not reserved-primary proof. Expanded probe establishes all five.
Initial ISO-only candidate bf5dd167, corrected focused90PASS exit0(44.2s), fresh
full1038PASS/139files exit0/all exact file plans/footers/counts/exits inspected,
and built3/native4 7PASS exit0(36.5s), retained as intermediate evidence. Final
v44 a8a7d45a additionally refuses reserved ordinary primaries through the same
six patterns; refined validation is pending, no reuse of intermediate full PASS.
Native guard now ten406 refusals per initial/resumed probe with original guards.

Refined accepted v44 a8a7d45a: typecheck/build exit0; focused90PASS/zero fail/cancel/skip exit0(44.4s); built3/native4 7PASS exit0(35.6s). Fresh full1038PASS/139files aggregate exit0; all exact package filenames/plans/footers/five counts/per-file exit0 inspected. Fixed full172 browser now running; no pending full PASS. Controller syntax and engine/current1.2 hashes verified.

Parent24195d1/run37924833794 READY on own10/all latest full logs/fresh empty reviews. Pear993/237dev/237built/SidePanel4 plus host3/browser-host2/real Lime/SCORM-host1; native3OS16/13/13/24/24/25 and five clean ACK/both exit0/no forced each. Direct SCORM close durations1.2/2nd/3rd/4th: Linux4.954/8.776/4.512/5.759ms(Node24.21), macOS63.206/88.453/16.874/16.683ms(Node24.20), Windows88.905/240.377/105.970/149.012ms(Node24.21). All four per OS complete six phases/fixtureClosed/errorBytes0. Actual successful instrumentation established; no original forced-failure cause/repair inferred.

Final accepted v44 a8a7d45a local validation completed: fixed full172 browser166PASS/6FAIL exit1(7.4m). All six complete trace/network streams and full error contexts inspected: fourth-edition interop support download60s timeout; third-edition navigation-target heading DOM.describeNode/session-closed; managed ServiceWorker enumeration denied; third-edition retry/retryAll and fourth-edition retryAll heading DOM.describeNode/session-closed. Intermediate polling mismatches are not separate terminal failures. Download/DOM causes remain unproved. All changed built-language3 and supplemental native4 journeys passed within this full run. No assertion/deadline/retry/policy changes or unrelated rerun. Full local browser is not PASS. Refined full domain1038/139files, focused90, typecheck/build and separate built3/native4 completed PASS/exit0 as recorded above; own PR/head CI remains pending until inspected.

Independent successor original36 tests0PASS/36FAIL exit1 confirms unregistered i-madeup accepted across six fields/raw+facade/three editions after valid i-klingon controls. Official IANA registry2026-09-17 contains13 historical i-prefix registrations (including deprecated tags); factual draft and forward/reverse candidate prepared separately, not yet accepted-tree or CI proof. Country/subcode/equivalence and exhaustive edition matrix remain OPEN. Epic OPEN; production DISABLED.

# ADR-168: shared registered IANA i-prefix binding

Status: implemented; local full acceptance and own exact-head CI pending.
Epic #133; stacked on PR242 exact9dd6b2b4 (ADR167/v44).
Original unchanged-v44 six-field/raw+facade/three-edition36 tests0PASS/36FAIL
exit1 retained: valid i-klingon controls pass before unregistered i-madeup is
incorrectly accepted. No external license/account blocker inferred for this bug.

RFC3066 §2.2 and reviewed ADL 2004 language type requirements reserve i for
IANA registrations. Require a registered first i-subcode in the shared installed
primary token, serving CMILang and all five localized regexes. Refuse bare i and
i-madeup/i-klignon/I-UNKNOWN with406. Preserve all13 historical registrations,
including deprecated values, uppercase and exact authored bytes; no preferred-
value rewriting. Additional subcodes and private x keep ADR115 lexical policy.
No new runtime registry fetch/dependency, capture change, capacity change or
blank preference/localized delimiter relaxation. SCORM1.2 remains unchanged.

Factual IANA registry File-Date2026-09-17, retrieved/reviewed2026-10-09:
https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
Complete contiguous historical i-prefix section reviewed: i-ami/i-bnn/i-default/
i-enochian/i-hak/i-klingon/i-lux/i-mingo/i-navajo/i-pwn/i-tao/i-tay/i-tsu.
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2
ADL third RTE1.0 §4.1.1.7/fourth RTE1.1 §4.1.1.7 and second addendum1.2 §2.9
reviewed in ADR167; exact original second-edition RTE PDF remains unresolved.
Country/subcode registration/equivalence, undefined later-subcode requirements,
simultaneous SPM and exhaustive edition matrices remain OPEN.

Checksum-locked pear-iana-language-prefix-v45 SCORM2004 ESM SHA256
62d0e92379a86ba6cad924e0cc40f28065970b0d0a6f373256ce8fb20333d151;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Single exact forward/reverse pair returns v44 a8a7d45a; all old pins
and direct installer historical inputs/idempotence/unknown-byte/version refusal
retained. Trusted v44 envelopes remain accepted; invalid states fail closed.
Previous ADR167 bare-i positive becomes refused by this explicit stronger binding;
old historical validation is preserved, not claimed unchanged.

Nine new domain tests cover all13 registrations across all six fields/raw+facade/
three editions, uppercase extra subcodes and private x; strict preload including
read-only LMS comments; typed forged all-six-field rollback/exact retry/SQLite
close-reopen/v44 resume/exact text/no official proof or certificate. Existing
1220 ISO facts and historical code checks retained. Built3 keeps prior capacity/
empty/lost ACK/receipt/close-resume/proof assertions and checks stored/resumed
historical IANA localized strings. Native fixture keeps qtz/SCC and old301/403
absence checks, adding interaction0 description I-MINGO without setting type;
four406 refusals and exact resume. One real named native check changes counts to
16/13/13/26/26/27. Actual three-platform owner CI required before native PASS.

Typecheck completed exit0; installer/controller/engine syntax and exact hashes
verified. Focused/build/browser/full domain running or pending: no incomplete
PASS claim. Parent242 exact-head run37928444356 pending; parent241 READY with
own10/latest full logs/fresh reviews. #222e2b ownCI absent/Draft; historical10dc
is not current proof. Local Chromium151 is supplemental; supported153 CDN403.
License/authorized exports/Rustici account/actual Safari+Android/reviewed prod
inputs BLOCKED. Epic OPEN; production DISABLED.

Local accepted v45: focused99PASS/zero fail/cancel/skip exit0(57.2s), typecheck/build exit0 and separate built3/native4 7PASS exit0(34.0s), retaining every original guard. Fresh full domain and fixed full172 browser remain pending until completed counts/exits/traces are inspected. Factual repository JSON SHA2567e3f3fe3397df67468ea0c019e1d53ebf7c756b685c0e891a70da9d2e68b3524 (not network original-byte hash).

Fresh full accepted v45 domain1047PASS/140files aggregate exit0 completed. Every exact package filename, plan, full footer/five counts and individual exit0 verified by filename mapping, zero fail/cancel/skip. Fixed full172 browser still running; no pending browser PASS. Independent successor reserved-country original six-field36tests0PASS/36FAIL plus six boundary-code raw/facade/three-edition36tests0PASS/36FAIL exit1 retained (AA/QM/QZ/XA/XZ/ZZ). Valid country/private/IANA/additional-subcode controls passed first. RFC3066 explicit42 user-assigned codes reviewed; separate candidate exact forward/reverse bytes/syntax checked, not accepted-tree or full-validation proof.

Final local accepted v45 full172 browser170PASS/2FAIL exit1(7.7m), complete footer inspected. Both complete trace/network streams and full error contexts read: fourth-edition support download60s timeout (cause unproved) and managed ServiceWorker enumeration denial. All changed built3/native4 pass within full; no unrelated rerun, assertion/deadline/policy relaxation or clean full local browser claim. Current1038 successor full1047/140files, focused99, typecheck/build and separate7 completed PASS/exit0 as recorded above. Own PR/head CI/reviews remain pending. Parent242run37928444356 now9/10SUCCESS: all three actual native OS complete16/13/13/25/25/26 with five clean ACK/both exit0/no forced each; latest full native logs inspected, Pear still running. No READY until owner10/latest full logs/fresh reviews.

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

# ADR-170: Support download control viewport readiness

The isolated unchanged fourth-edition licensed-wrapper journey completes1FAIL,
exit1 after60s. Pointer observation shows the intended support click reaches
SCO HTML (top:false), not the shell button; complete trace/network contains no
diagnostics request. Full context and timeout inspected. The initial wrong-cwd
exit127 is retained as an invocation failure, not regression evidence.

Reuse ADR143's existing scrollIntoViewIfNeeded and toBeInViewport before the
original real support click. The isolated candidate completes1PASS/exit0(5.0s);
pointer observation confirms top-level BUTTON delivery. Download packet format,
exact durable sequence, redaction, close/resume/Finish and exactly-once proof
assertions remain intact. No force/dispatch, sleeps, retries, deadline or policy
change, no product/engine change. Temporary instrumentation remains outside
tracked tests. This proves the isolated missed action; it does not establish
every historical timeout or compositor/browser-version cause.

Accepted tree's existing full five licensed-wrapper interop journeys complete
5PASS/exit0(15.0s). Fixed full172 browser running; no pending PASS. Product
bytes unchanged from country v46 parent e59616cd: inherited full1056 domain/
141files, typecheck/build and built3/native4 are parent evidence, not rerun
results. Current engine hashes unchanged4ad1c795/eb753959; native counts
16/13/13/27/27/28 unchanged. Own exact-head CI/all latest logs/fresh reviews
remain required. Parent243 own9/10SUCCESS, parent244 own run37932712095 pending.
#222e2b ownCI absent/Draft; historical10dc is not current proof.

DOM.describeNode/session-closed causes remain unproved; managed ServiceWorker
denial and supported Chromium153 CDN403 retained. Full conformance matrices
OPEN; licensed exports/Rustici account/actual Safari+Android/reviewed production
inputs BLOCKED. Epic #133 OPEN; production DISABLED.

Accepted fixed full172 browser completed169PASS/3FAIL exit1(9.1m); complete
three trace/network streams and contexts inspected. All five interop, including
support download, pass in full. Failures: managed ServiceWorker enumeration
denial; second-edition calendar/fourth-edition system-shared next-SCO heading
visibility with DOM.describeNode Internal server error/session closed, causes
unproved. No unrelated rerun or clean full local claim. Parent243 now READY
after own10 SUCCESS/latest full logs/fresh exact head/reviews. Parent244 exact
e59616cd own run37932712095 pending; immediate successor proceeds.

Existing PR222 received the same real readiness repair only after its own
isolated original4PASS/1FAIL exit1 on e2b, SCO-HTML/no diagnostics evidence,
then accepted5PASS/exit0 and build exit0. New head0e4965c0 own run37933481103
started; historical10dc remains non-current evidence. No empty trigger commit
or history rewrite; descendant branches preserved. Epic OPEN/prod DISABLED.

# ADR-171: Source-backed first-country membership

On unchanged v46, en-OO is admitted across all six writable language fields,
raw/facade and three editions: original36tests0PASS/36FAIL exit1. Valid assigned,
private, historical i and undefined later-subcode controls precede refusal.

RFC3066 section2.2 and ADL third/fourth RTE4.1.1.7 require ISO3166 two-letter
first country subcodes for ordinary ISO language primaries; second addendum1.2
section2.9 references RFC3066. Existing primary/language/private/capacity grammar
remains. Exact original legacy RTE/complete errata still unresolved.
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf

Extend the existing factual JSON with249 current assigned alpha2 values:
248 public UNSD M49 English rows (all row positions16–263 checked), plus TW
cross-checked in the official IANA region record. Entire contiguous IANA
alpha2 region section46125–47522 checked; all249 cross-checked, and eleven
deprecated country records AN/BU/CS/DD/FX/NT/SU/TP/YD/YU/ZR retained for authored
historical values, without preferred-value replacement. This is an explicit
reviewed current/historical profile, not a copy of an ISO standard or paid
licensed table. Shell source download403 retained; repository factual hash
does not claim original network bytes.
https://unstats.un.org/unsd/methodology/m49/overview
https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry

One checksum-locked lookahead in the existing shared primary token binds only
first two-letter ordinary ISO-country membership. Preserve i/private x,
additional subcodes, case/text, all captures, blank preference/nonblank localized
strings and capacities. Three–eight-character subcode registration, equivalence,
exhaustive edition/SPM combinations and broader historical/reserved-country
policy remain OPEN. No runtime registry fetch, new dependency or modernization.

v47 pear-country-registry-v47 SHA256
aed6a0dda87c61dd3fbddc8e756ea4ee03f07d4895540f30fd6810b00c9fe84b;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Single exact forward/reverse restores v46 4ad1c795; installer direct
v46 input/reverse and every old pin retained. Trusted v46 snapshot marker added;
invalid values fail closed without canonicalizing saved text.

Separate pre-branch candidate syntax/exact reverse and9360 positive/14976
atomic negative writes across two actual constructors/six fields checked exit0.
Initial nonexistent-export invocation SyntaxError retained, corrected to actual
Scorm2004API/Scorm2004LegacyAPI exports before running; no false PASS.
Accepted-tree nine domain tests cover260 countries and all416 other alpha2
pairs through six fields/three editions/raw+facade, preload/readonly LMS comment,
typed forged rollback/exact receipt/SQLite reopen/v46 resume/historical SU/ZR
text/no official proof or certificate. Existing built3 now exercises all260
countries and416 refusals, plus durable second historical-country comment while
retaining old IANA/capacity/lost-ACK/exact-retry/resume/proof guards. Native tests
all260 temporary country writes, restores original I-MINGO, refuses four
unassigned values and verifies original durable language through retry/resume;
old absence/type/capacity/history guards retained. One genuine named native
check:16/13/13/28/28/29; own OS evidence required.

Focused/full/typecheck/build/built3/native4 pending until complete exits/footers.
Parent243 READY; parent244 own9/10/native3OS PASS/latest completed logs read,
Pear pending; parent245 exact544b own run37934069946 pending. PR222 meaningful
repair0e4965 own run37933481103 pending; e2b absence and10dc historical evidence
retained. Local Chromium151 supplemental, supported153 CDN403. Conformance
matrices OPEN; licensed authoring exports/Rustici account/actual Safari+Android/
reviewed production inputs BLOCKED. Epic #133 OPEN; production DISABLED.

Accepted v47 focused117PASS/zero fail/cancel/skip exit0(156.3s), typecheck/
build exit0 completed. First built/native7 completed4PASS/3FAIL exit1(55s):
native4 PASS; all three new historical-country browser fixtures created comment
index1 before0, causing historical-country-write error. Complete failed traces/
networks/contexts read. Move added comment after existing index0 creation; no
product/assertion/deadline change. Original failure retained; corrected browser
results/full domain/full browser still pending. Factual repository JSON SHA256
d7a4d9dfa73b81a21ebc647a412c0d3544f1d2b723206e78a6ba3428e3ec341a
(not original source byte hash).

Corrected affected built3 completed3PASS/exit0(12.9s), combined with unchanged
native4 earlier PASS; original4/3FAIL retained separately. Fresh full1065PASS/
142files aggregate exit0 completed; every exact filename/plan/full footer/five
counts/per-file exit inspected, zero fail/cancel/skip. No cached predecessor
full claim. Fixed full172 browser started on frozen product/test tree after
native-lifecycle domain finished; no pending browser PASS. Parent244 now READY
after own10/latest full logs/exact head/fresh reviews.

Accepted v47 fixed full172 browser completed170PASS/2FAIL exit1(6.4m); both
complete trace/network streams and contexts inspected. Corrected built3/native4
all7PASS within full, prior intermediate4PASS/3FAIL retained. Failures: second-
edition navigation-target next-SCO heading DOM.describeNode Internal server
error/session closed (cause unproved), managed ServiceWorker enumeration denial.
No unrelated rerun, product/assertion/deadline/policy changes during full or
clean full local claim. Parent244 READY; parent245 own9/10/native3OS clean PASS
latest completed logs inspected/Pear pending. PR222 now READY on actual0e4965c0
run37933481103 own10/latest full logs/fresh head and one resolved P1/zero
unresolved threads:828 domain/231dev/231built/4SidePanel/native3OS17. Old
e2b absence/10dc historical evidence retained separately.

Next IANA first3–8 membership is separately reproduced216tests0PASS/216FAIL
exit1 after registered/private/later controls. Independent source-backed709-token
candidate25524 positive/288 atomic negative writes across two constructors/six
fields completed exit0 and exact reverse restores v47. Candidate outside accepted
tree; no pending accepted proof. Raw IANA shell fetch403 retained; web source
fields checked. Prefix-language semantics/equivalence remain OPEN. Epic OPEN;
production DISABLED.

# ADR-172: First IANA subcode token membership

Unchanged v47 accepts six unregistered first3–8 subcodes across six fields,
raw/facade/three editions: original216tests0PASS/216FAIL exit1 after valid
en-Latn-US/en-scouse/zh-cmn-Hans/zh-min/no-bok/art-lojban/de-1996/private/later
controls. This independently testable gap needs no account/license.

ADL fourth RTE1.1/third RTE1.0 section4.1.1.7 require registered IANA first3–8
subcodes; RFC3066 section2.1 supplies alphanumeric subcode syntax and2.2
registration/additional-subcode rules; second addendum1.2 section2.9 references
RFC3066. Exact legacy original RTE/complete errata remains unresolved.
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2

Append709 factual tokens to the existing JSON. Official IANA contiguous
sections43006–46124 and47523–49315 reviewed in full:258 extlang,225 script
(including private range Qaaa..Qabx),31 numeric-region,139 variant,26 grandfathered
and67 redundant records. Named tokens652, seven extra ordinary historical first
tokens lojban/gaulish/bok/nyn/guoyu/hakka/xiang,50 private-script range values.
Historical i-only tag components are excluded from the ordinary token set.
No original descriptions/table/paid ISO standard copied; retain case/exact text
without preferred-value replacements. Raw shell IANA fetch403 retained; facts
reviewed via web, repository hash does not claim original downloaded bytes.
https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry

One shared negative lookahead binds first3–8 alphanumeric token membership
only for ordinary ISO language primaries. Keep country/ISO/IANA-i/private-x,
undefined later subcodes, all captures/capacity/blank bindings and SCORM1.2.
This restricts unregistered tokens; it does not validate every whole registered
tag or prefix-language combination. Prefix semantics, equivalence, first
one-character interpretation and broader historical/edition/SPM matrices OPEN.
Current registered numeric-region/private-script tokens are an explicit reviewed
compatibility profile, not exhaustive legacy errata certification.

v48 pear-iana-subcode-registry-v48 SHA256
173633c973ab69464aba8afd36c615bc9e9e23d0b520037a2859cf732258865a;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Single exact forward/reverse restores v47 aed6a0dd; actual installer
v47 input/direct reverse/all older pins retained, trusted v47 envelope accepted;
invalid state fails closed without rewriting authored values.

Separate candidate syntax/exact reverse and25524 positive/288 atomic negative
writes across two actual constructors/all6fields complete exit0, not accepted
full proof. Accepted nine domain tests cover all709 tokens/all6fields/3ed/raw+
facade, unregistered whole-state refusal, strict preload/readonly LMS comment,
typed forged rollback/exact receipt/SQLite reopen/v47 resume/exact dialect
text/no official proof/certificate. Built3 exercises all709 positive tokens and
eight unknowns across six fields and extra durable en-SCOUSE comment, retaining
all country/ISO/i/IANA/capacity/ACK/retry/resume/proof guards. Native709 temporary
values then original I-MINGO restoration/eight atomic406 refusals retain original
durable language and all absence/type/capacity/history guards. One genuine named
native check:16/13/13/29/29/30; own actual OS evidence required.

Accepted typecheck/build exit0, focused126PASS/zero fail/cancel/skip exit0
(180.5s), supplemental built3/native4 completed7PASS/exit0(39.4s); complete
footers/exits checked. Fresh full domain/full172 browser pending. Support current
version label corrected from stale v46 beside correct v47 checksum in parent;
parent engine bytes/checksum evidence were unchanged. Current v48 row and old
ADR171 hash stay distinct. Parent245 READY own10/latest logs/fresh head/reviews;
parent246 f335 own run37936681321 pending. PR222 current0e4965 READY own10/
828/231dev/231built/4/native3OS17/resolved P1; old e2b absence/10dc historical
retained. Chromium151 supplemental; supported153 CDN403. Conformance matrices
OPEN; licenses/exports/Rustici account/actual Safari+Android/reviewed production
inputs BLOCKED. Epic #133 OPEN; production DISABLED.

Fresh accepted full1074PASS/143files aggregate exit0 completed; every exact
filename/plan/full footer/five counts/per-file exit0 inspected, zero fail/cancel/
skip. Fixed full172 browser started after lifecycle finished on frozen tree;
no pending browser PASS. Factual repository JSON SHA256
6600ea0cab46512676025a4dc3f0971e664b4f7001282071bcbd4ccc9f1afe86
(not original downloaded bytes). Independent first-two-character mixed/digit
country gap108tests0PASS/108FAIL exit1 on unchanged v48 retained outside tree
for immediate successor. Separate second-edition first-one-character72FAIL
probe retained; broader interpretation still OPEN, not a license/account blocker.

Fixed full172 completed165PASS/7FAIL exit1(7.7m), all seven complete trace/
network/context artifacts inspected; changed built3/native4 all7PASS in full.
Six heading failures: assets2nd, navigation-targets4th, retry2nd/3rd/4th and
retryAll3rd report DOM.describeNode/session closed; root cause unproved.
Sequencing traces also retain intercepted expected2/received1 intermediate
checkpoint assertion events; no cause or semantics repair inferred. Player
ServiceWorker enumeration denied by managed environment. No unrelated rerun,
assertion/deadline relaxation, or clean local full browser claim.
Parent246 original Windows113840368462 failed fourth fixture shutdown:
ACKtrue/native0, fixtureForcedtrue/exitnull, phases through app-closed4.775ms,
no databaseCloseMs/cleanup; cause unproved. Linux/macOS full logs completed
16/13/13/28/28/29 and five clean closes; Pear1065/237dev/237built/4 PASS.
Initial unchanged Windows retry request403 while run running retained; after
run completed, one unchanged retry was accepted, still pending. No new Windows
PASS or original shutdown repair claim. Independent mixed/digit country2
candidate9360 positive/22320 atomic negative writes across620pairs/two actual
constructors/all6fields completed exit0; exact single reverse to v48/syntax
checked, separate candidate evidence only. Immediate successor; epic OPEN,
production DISABLED.

# ADR-173: First country subcode character binding

Unchanged v48 admits en-11/FRE-1a/qaa-a1 across six fields/raw+facade/three
editions: original108tests0PASS/108FAIL exit1 after valid registered-country,
registered numeric-three-character region, private/i and undefined later
subcode controls. Existing first-country membership lookahead only examined
alphabetic pairs, so mixed/digit pairs bypassed the shared ISO alpha2 guard.

ADL third/fourth RTE4.1.1.7 and RFC3066 section2.2 require first ordinary
subcodes of two characters to be ISO3166 alpha2 countries. Second addendum1.2
section2.9 references RFC3066; exact original legacy RTE/all errata unresolved.
https://lms.technology/for/scorm/2004/4th_edition/standards/SCORM_2004_4ED_v1_1_RTE_20090814.pdf
https://help.aura-software.com/wp-content/uploads/sites/3/2023/11/SCORM_RunTimeEnv.pdf
https://lms.technology/for/scorm/2004/2nd_edition/standards/SCORM_2004_Addendum1.pdf
https://www.rfc-editor.org/rfc/rfc3066.html#section-2.2

One exact forward/reverse changes [a-zA-Z]{2} to [a-zA-Z0-9]{2} only in the
existing shared first-country negative lookahead. No new registry/profile
or dependency. All620 two-character ASCII alphanumeric pairs containing at
least one digit (36^2-26^2) now undergo the same assigned-country membership.
Preserve country249+11 historical profile/case, i/x and undefined later
subcodes (en-US-11/en-US-a1), registered numeric3-region en-001/FRE-419,
all captures/capacity/blank bindings and SCORM1.2. No preferred-value rewrite.

Separate candidate9360 positive/22320 atomic negative writes across620pairs,
three primary spellings/all6fields/two actual constructors completed exit0;
syntax and single exact reverse to v48 checked. Candidate is not accepted
full proof. v49 pear-country-subcode-characters-v49 SHA256
5213c4f81ce9d1e252c140a004faba1c7f615910ba781cbfdd81814547815a5b;
reverse restores v48 173633c973ab69464aba8afd36c615bc9e9e23d0b520037a2859cf732258865a;
SCORM1.2 eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642
unchanged. Actual installer v48 input/all older reverse pins/idempotence/
unknown-byte refusal and trusted v48 envelope resume retained.

Nine new domain cases exercise all620 pairs/three primary spellings/six fields/
raw+facade/three editions with whole-state406 refusal, plus30 representative
preload/readonly LMS/forged typed rollback cases per field, unchanged receipt/
audit/history/SQLite reopen/v48 numeric-region exact resume/no proof/certificate.
Bounded representatives cover both digit positions, endpoints and uppercase;
not an exhaustive typed/preload matrix. Existing built3 adds all620 refusals
in six fields and valid numeric/private/later controls; original dialect/
historical-country/IANA strings and ACK/retry/resume/capacity/proof guards
unchanged. Native620 refusals follow valid controls then original I-MINGO
restoration; one genuine named check raises2004 counts30/30/31, all other
native guards unchanged. Own OS evidence required; not a commercial export.

Initial accepted new9:6PASS/3FAIL exit1(33.1s); fixture copied-marker replacement
accidentally used nonexistent pear-country-characters-registry-v48. All three
full failures inspected: trustedSequencing correctly refused unknown identity.
Fixture corrected to real pear-iana-subcode-registry-v48, no assertion or product
trust relaxation. Original/candidate/intermediate logs retained. Initial editor
wrong cwd failed before writes; corrected editor later stopped at mismatched
native source anchor after product changes, resumed against actual anchor;
installer matched expected hash. Nonexistent typecheck:host command exit1,
actual typecheck/build completed exit0; accepted focused/full/browser pending.

Parent247 Draft019726 own run37940391505 pending; completed localfull1074/143,
f126/build/typecheck/built3/native4 PASS; fixed172165PASS/7FAIL exit1/all traces
read, DOM.describeNode/session-closed cause unproved and managed ServiceWorker
denied. Parent246 original Windows fourth shutdown failure retained/no cause
claim; initial retry403 while running, one unchanged retry accepted afterrun
completed, pending. Other nine original jobs full logs1065/237/237/4/n28/28/29
PASS. Parent245 and PR222 actual-head READY gates retained. Prefix/whole-tag/
equivalence/first-one-character/SPM/legacy matrices OPEN; licenses/exports/
Rustici account/actual Safari+Android/reviewed production inputs BLOCKED.
Chromium151 supplemental/supported153 CDN403. Epic133 OPEN, production DISABLED.

Accepted focused110PASS/zero fail/cancel/skip exit0(267.4s), actual typecheck/
build exit0 and supplemental built3/native4 completed7PASS exit0(41.8s).
Fresh full1083PASS/144files aggregate exit0; every exact filename/plan/full
footer/five counts/per-file exit inspected. Fixed172 fullbrowser now running
on frozen product/test tree after lifecycle finished; no pending PASS.
Parent246f335 READY: latest own37936681321 all10 completed SUCCESS/latest full
logs/fresh reviews0 unresolved. One unchanged Windowsretry113851854434 passed
16/13/13/28/28/29/five clean closes/fourSCORMsixphases/finite direct DBduration;
original fourth forced/null/noDBduration failure retained/cause unproved.
Independent unchanged-v49 mandatory250 interaction x10objective IDs original
3tests0PASS/3FAIL exit1(3.5s) at141032bytes: server2048-leaf quota rejects legal
combination. ADL third/fourth RTE4.1.1.4/4.2.9 reviewed; exactlegacy RTE remains
unresolved. Separate candidate prepared outside acceptedtree for successor;
no accepted SPM fix or exhaustive/certification claim. EpicOPEN/prodDISABLED.

Fixed full172 completed170PASS/2FAIL exit1(6.7m); both complete traces/network/
contexts inspected, changed built3/native4 sevenPASS in full. Player ServiceWorker
enumeration denied by managed environment; third retry heading DOM.describeNode/
session closed (plus retained intercepted expected2/received1 intermediate event)
cause unproved. No unrelated rerun/assertion/deadline relaxation/clean local full
browser claim. Parent247 own9/10/native3OS16/13/13/29/29/30 clean5/sixphases/
finite directDBduration PASS/full logs inspected; Pear still pending.
Separate SPM candidate initially .ts module-loading constructor error retained;
corrected outside .mts probe completed three profiles2500objectiveIDs plus five
unchanged authority/byte/ordinary-leaf/type/unknown refusals. Expanded candidate
all7000 interaction fields (250x8 scalars/10objectives/10patterns) exact accepted
at262759bytes in each edition, exit0; all15 negative controls retained. Additional
mixed response-origin journal candidate remains separate/pending, no accepted
product change here. Current engine v49 pins and factual JSON unchanged.
