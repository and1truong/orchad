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
