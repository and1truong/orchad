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
