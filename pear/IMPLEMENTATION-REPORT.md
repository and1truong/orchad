# Pear implementation evidence — 2026-10-06

Repository baseline: main 864f40caff7ae6918358c7ea4c60e5fcbd9dd2d1. Part of epic #49. The foundation PR #59 delivers the initial synthetic learning slice and P0 design/register. This next layer adds standalone item/module authoring, targeting branch codex/pear-lms-49. It does not claim or close full Go1 parity, and P1 acceptance is incomplete where the required runtime evidence is unavailable.

## Implemented

- Independent React/Fastify same-origin app on 4314; pinned dependencies, clean npm ci, production bundle, persistent SQLite/WAL/FKs, idempotent migration/seeds, three original VI/EN courses and synthetic role/tenant fixtures.
- Keyword/metadata catalog, preview/save/enroll, private my learning, fixed/no due date assignment, course/lesson player, prerequisite checks, MCQ/attempt caps, progress/resume, backend completion and private versioned text certificate.
- Admin/content admin validated draft creation/edit/publish/version/retire; manager/admin scoped assignment/report and bounded audience; role/tenant/current-account enforcement through common domain services for human/bridge.
- Bridge 0.1 and frozen role/effect/schema catalog using canonical validators/bounds/result helpers. No AI/model runtime in Pear. Learner human acknowledgement/answer/submit operations are absent from agent tools. Model-processing restrictions withhold lesson, quiz and draft text.
- Per-learner aggregate revisions, shared library administration CAS, cross-aggregate assignment revision updates, atomic dedup/payload/revision/audit transaction and explicit duplicate-enrollment semantics. Published version edits preserve attempts/progress.
- Loopback opt-in synthetic auth, exact Origin/Host, HttpOnly SameSite cookies, CSRF and captured-session epoch binding, deactivation/auth-version revocation. No production SSO fallback.
- Capability register G01–G23 retains incomplete/internal/commercial/reference gaps. ADR records tenant/role/aggregate/content/completion/model-egress/media policy and rollout gates. CONTRACT.md remains byte-identical to root.

## Observed test lanes

| Lane | Outcome | Exact evidence and limits |
|---|---|---|
| Clean dependency installation | PASS | npm ci in Pear; clean regenerated lockfile, no borrowed node_modules required |
| Independent typecheck/build | PASS | npm run typecheck; npm run build, Vite production bundle |
| Host integration typecheck | PASS | npm run typecheck:host, separate Chrome/peer dependency config |
| SQLite/domain + HTTP | PASS, 22 tests | npm test: scoring, prerequisites, attempt cap, immutable answers, certificates, stale/conflicting keys, lost-response retry, DB reopening, version/retirement, tenant/roles/direct reports, rollback on audit failure, bounds/byte pagination, model egress, Origin/Host/CSRF/session changes, deactivation/current role and disabled synthetic auth |
| Real Lime HostPolicy → Pear HTTP/domain | PASS, 3 tests | npm run test:host: consent, approve/deny/cancel, zero denied dispatch, target/session invalidation, concurrent same-key dedup and different-key stale CAS |
| Human browser, development server | PASS, 5 journeys | npm run test:e2e: learner catalog/filter/preview/bookmark/enroll/quiz/refresh/certificate; admin draft/publish/assign and manager/learner isolation; mobile/keyboard focus/page bridge/account-switch. Chromium headless-shell 138.0.7204.0, Playwright 1.63.0 |
| Human browser, built production assets | PASS, same 5 journeys | PEAR_E2E_PRODUCTION=1 npm run test:e2e. Synthetic loopback auth explicitly enabled, unique test DB. Includes built CSP/static serving. Same Chromium runtime |
| Shared Pi client + fake Mango → real Lime policy → actual browser Pear/HTTP/SQLite | PASS, 1 journey | PEAR_E2E_PRODUCTION=1 npm run test:browser-host. Production shared Pi runAgentTurn, production HostPolicy, actual page bridge/backend. Only browser transport and trusted approval UI are labelled fixtures; scripted Mango is not a live provider. Approved bookmark commits once, denied second write zero dispatch, unknown human-submit tool denied, reload invalidates binding |
| Actual unpacked Lime extension | Parent PR CI PASS; new head CI pending | Parent [CI run 37442609227](https://github.com/and1truong/orchad/actions/runs/37442609227/job/112199735863) passed the strict extension lane, with [artifact evidence](https://github.com/and1truong/orchad/actions/runs/37442609227/artifacts/11402185913). Local limitation: npm run test:lime attempted. Headless-shell has no extension service worker. Full official Chrome for Testing 138.0.7204.183 fails before extension startup: process singleton Unix socket returns EPERM in this execution environment. No local PASS claim; the strict script and CI lane run for every stack head |
| Native Side Panel container | NOT RUN | Extension-page test harness is not native side-panel evidence |
| Coconut/native host, Pear via real MCP companion | NOT RUN | Requires separate native/companion lane; existing host MCP support is not Pear integration evidence |
| Live provider/Go1/partner/IdP/Slack/Teams | NOT RUN / BLOCKED account or license | No paid provider calls, provider licenses, account installs or public deployment performed |
| WCAG 2.2 AA/screen reader/captions | NOT VERIFIED | Semantic labels, keyboard focus, responsive human lane and transcript requirement are not a full audit |

Browser screenshots are captured from real UI. See docs/evidence/human-completion.png and docs/evidence/mobile-catalog.png; CI uploads all browser screenshots/traces from artifacts/test-results. E2E discovered and fixed a controlled-radio persistence UI issue and status-message refresh race; final journeys pass. Synthetic data only.

Authoring coverage in tests/authoring.test.ts and tests/e2e/authoring.spec.ts adds additive migration/restart, standalone role/tenant isolation, module sequencing and prerequisite rejection, exact-version refs, item retirement versus retained course snapshots, forged inline override rejection, license inheritance/egress, UTF-8 bounds after materialization, CAS/dedup/audit rollback, human multi-module/multi-question preview/edit/reload and backend learner completion. tests/http.test.ts adds HTTP/bridge authoring and restricted-item checks. The CI artifact additionally captures modular-authoring.png.

## Remaining scope

P0 reference offering/portal and plan entitlements remain NOT VERIFIED. Standalone items, module/reusable-item authoring and every current bounded course/MCQ field now have human UI. Playlist/award rules and human authoring are implemented in the next program layer; richer assessment/media types remain open. Full localization/accessibility, cross-portal playlist sharing, advanced assessment/assessor/submission/event workflows, user/groups/recurrence/notification, saved reports/exports, production identity/retention/media storage, licensed catalog lifecycle/entitlements, SCORM/xAPI/connectors/webhooks, semantic recommendation/practice quality and channel/conversation/native integration remain open in the register.

P2–P4 are not silently reduced or marked complete. Exact reference/legacy/commercial decisions need evidence or explicit scope approval before full-parity closure. Production identity and real-data/privacy gates must be satisfied before using this synthetic app for real learners.

## Program layer — stacked on PR #60

Additive migration 003, immutable playlists/awards, required/elective alternatives, credits/hours/target, nested/ongoing policies, learner-confirmed evidence, scoped assessor moderation and synthetic award certificates. See ADR-003 and program domain/browser tests. Program-layer tests and runtime results below apply to this head, independently of parent CI.

Program head observed: typecheck/build PASS; domain/HTTP 30 tests PASS; HostPolicy/HTTP 3 tests PASS; production-browser 6 journeys PASS; built shared-Pi browser-host 1 journey PASS. Development program journey PASS (the earlier exact-label test selector was corrected to the accessible combobox role). Parent PR #60 acceptance CI run 37446089489 completed successfully, including strict unpacked Lime; new head requires its own CI result. Synthetic loopback accounts only.

## People layer — stacked on PR #61

Additive migration 004, user lifecycle/profile/custom fields and session revocation/history, own language/interests, reviewed atomic CSV import with row errors and stale-review protection, formula-safe all-page CSV export and static/dynamic ALL/ANY/custom/date groups with active/direct-report preview. Program parent acceptance run 37450632989 passed all eight jobs, including Pear strict unpacked Lime. See ADR-004 and people/domain/HTTP/browser evidence; other capability gaps remain open.

People head observed: independent typecheck/build PASS; SQLite/domain/HTTP 36 tests PASS; host typecheck and HostPolicy/HTTP 3 tests PASS; production browser 7 journeys PASS; built shared-Pi browser host 1 journey PASS. Human tests include CSV download, custom group preview/save, own interests/language after reload and manager isolation. Tests found and fixed duplicate sibling React keys, mobile CSV-header wrapping, initial profile hydration and stable textarea labels. New head still requires its own strict-extension CI.

## Assignment layer — stacked on PR #62

Migration 005 preserves prior graded records and adds independent course/award cycle ledgers, fixed/dynamic audiences, future dates/rolling/fixed deadlines, UTC-day recurrence, close/cancel/edit, fair bounded deterministic jobs, private in-app notifications and fresh recurring-award proof. See ADR-005 and assignment domain/migration/browser tests. Parent #62 acceptance run 37452053734 passed all eight jobs, including Pear strict unpacked Lime. Calendar-month/DST recurrence and external delivery remain explicit gaps.

Assignment head observed: independent typecheck/build PASS; 45 SQLite/domain/HTTP tests PASS; host typecheck and 3 HostPolicy/HTTP tests PASS; 8 production-browser journeys PASS; 1 built shared-Pi browser-host journey PASS. New HTTP test rejects caller-supplied clock, manager job dispatch and foreign notification access, and verifies retry dedup. Mobile journey verifies reviewed recurring assignment, due jobs, learner completion notification/reload and certificate preservation on cancel. Parent #62 strict-extension CI is green; this head runs independently.

## Report layer — stacked on PR #64

Migration 006 adds creator-owned saved definitions and persists/reconstructs scheduled award deadlines from cycle/delivery history. Typed report templates/filters/columns/sorting, live direct-report/tenant scope, own course/award transcripts, formula-safe CSV export permutations and per-export snapshot continuity are implemented. Browser print/save PDF uses the same authorized rows/columns. Course acknowledged-lesson progress, quiz score and award required/target progress remain separate. No elapsed-time telemetry, NL report/chart or delivery integration claim is made. See ADR-006 and reports tests.

Report head observed: independent build/typecheck PASS; 51 SQLite/domain/HTTP tests PASS; host typecheck and 3 HostPolicy/HTTP tests PASS; 9 production browser journeys PASS, plus report print-layout rerun after fixing surplus blank pages. Chromium generated a real one-page A4 PDF; extracted text preserved “Học tập có chủ đích” and own learner scope. Tests cover four export permutations, owner restrictions, stale snapshots/live manager changes, formula/newline quoting, audit rollback, restart and v5 deadline recovery. The browser modal is intercepted for automation; ordinary humans choose Save as PDF in the print dialog.

Parent #64 acceptance run 37454726356 passed Pear (including strict unpacked Lime), Lime, Mango, Guava, Coconut, contract-sync and agent-durable; Coconut native timed out after its denied-read consent check. That job has been rerun; no green/native claim is inferred from other lanes. Each new stack head requires independent CI.

## Contextual tool layer — stacked on PR #65

Bounded domain catalogs cover all authorized operations without truncation or changing Bridge's 64-tool/64-KiB limits. Domain-qualified document bindings share canonical personal/library revisions. Human UI remains fully usable while agent groups are explicit and role-filtered. Tests cover every role/group descriptor, union completeness, schema/size bounds, shared CAS, unknown/foreign aliases and pending-approval revocation with zero dispatch. Parent #65 acceptance run 37456645248 passed all eight jobs including strict unpacked Lime and real Coconut native.

A debug-only native runner barrier waits for the real sidebar's first binding-driven consent revocation before granting read consent; it addresses a timing race candidate from #64's two timeout runs, with no permission-gate change. Local environment has no Cargo/native runtime, so compile/runtime results require this head's CI. Parent native success is not counted as validation of the changed runner.

Contextual head observed: build/typecheck PASS; 52 SQLite/domain/HTTP tests PASS; host typecheck and 3 host tests PASS; 9 production human journeys PASS; 2 built shared-Pi browser-host journeys PASS. Native harness JavaScript syntax check PASS; Rust/runtime pending strict CI. No new capability-parity closure is implied by this supporting layer.

## Assessment layer — stacked on PR #66

Migration 007 preserves old MCQ scores/certificates and adds persisted presentation, final feedback release, pending/manual grading, course-assessor delegation, immutable essay reviews and bounded retry allowances. Human authoring/player/review supports MCQ/matching/blanks/long answers, exact weighted partial credit, question/choice shuffling and pinned rubric/version evaluation. Answers, key release and rubric grading are human-only; bridge reads withhold learner responses and all keys/rubrics. Course/award completion notices and certificates remain backend-derived.

Observed: build/typecheck PASS; full domain/HTTP 57 tests PASS plus the added exact fractional matching threshold test; host typecheck and 3 host tests PASS; 10 production human journeys PASS; 2 built shared-Pi browser host journeys PASS. Browser tests found and corrected delayed controlled-radio selection; responses now update immediately and roll back if saving fails. Tests cover no certificate while essays await review, delegated/revoked roles, human/bridge separation, 32-KiB combined UTF-8 response limits, audit rollback, final-grade dedup and restart/pinned rubric preservation. Parent #66 follow-up acceptance run 37458555343 passed all eight jobs, including strict unpacked Lime and actual Coconut native. This head requires independent CI.


## Media layer — stacked on PR #67

Immutable SQLite files, SHA-256 metadata, ownership confirmation, binary-only upload lane, 8-MiB/file and 128-MiB/512-object tenant limits. PDF/audio/video/interactive HTML can be published as standalone items and pinned into courses. Downloads enforce tenant and published-item/unlocked enrolled-lesson scope; retired source items preserve enrolled files. Upload CAS/dedup/audit share an atomic transaction. API limits stay 64 KiB outside the dedicated binary route.

Interactive scripts run under an opaque origin imposed by both iframe and response CSP sandbox, with no same-origin permission or parent Bridge message handler. Browser attacks against parent DOM/Bridge, cookie/storage and API fetch are blocked; practice clicks work and no official revision changes. PDF attachment and Blob native audio/video remain human-only. MIME/signature checks are not malware scanning: production uploads fail closed pending configured scanning/storage policy.

Observed: build/typecheck PASS; 63 SQLite/domain/HTTP tests PASS; host typecheck and 3 host tests PASS; 11 production human journeys PASS (media includes playable WAV/MP4, real PDF and hostile HTML sandbox). Parent assessment PR #67 acceptance run 37459884867 passed all eight jobs including strict unpacked Lime and actual Coconut native. This new head requires independent CI. Development media browser PASS; built shared-Pi browser-host 2 journeys PASS.

## Blended learning layer — stacked on PR #68

Migration 009 preserves content file operation keys and adds private enrollment-bound PDF artifacts, submitted/reviewed assignment history, shared immutable session IDs and bookings. Course policy derives human acknowledgement/review/attendance plus the official quiz. Submissions require learner confirmation and scoped human scores; attendance requires delegated humans after start. Upload/book/script/self-attestation cannot pass a blended lesson. Live role/tenant/delegation, prerequisites and capacity/cutoff guards run on the backend; private submission files cannot be published as course assets. Deactivation/dynamic withdrawal/cancel releases unassessed slots while retaining history. Private ICS uses explicit UTC instants, escaping and UTF-8-safe line folding, with DST fallback fixtures.

Observed: build/typecheck PASS; 71 SQLite/domain/HTTP tests PASS; host typecheck and 3 host tests PASS; 12 production human browser journeys PASS. Blended browser journey authors a mixed course, submits a PDF, reviews the pinned rubric/file, books and downloads calendar, records human attendance after actual start, passes the quiz and verifies persisted transcript/certificate. Concurrent HTTP requests against capacity 1 produce exactly one booking and exact valid retry. Queue, revoked assessor, Content Admin/private-file denial, failed submission history, audit rollback and restart fixtures PASS.

Browser regression found and fixed a SQLite UNION ordering error, an event review initialization race, and stale selected-player progress after refresh. The larger suite exposed synthetic login counting every successful shared-IP login toward the failure budget: failed guesses now have a separate 30/minute budget that valid logins cannot reset, alongside a bounded 120/minute request budget and Retry-After. Production password login stays disabled. The deterministic login test covers valid shared-IP use, cumulative failures and expiry.

Parent #68 acceptance run 37461891409 passed all eight jobs including strict unpacked Lime and real Coconut native. This head requires independent CI. Development blended journey PASS; built shared-Pi browser-host 2 journeys PASS. Development React warnings exposed duplicated media/blended sibling keys; domain prefixes now keep player identity separate, and the browser journey asserts no key warnings. No full-parity, production upload scanning or external calendar/video connector claim is inferred from fixtures.

## Award file evidence — stacked on PR #69

Migration 010 adds private immutable PDF evidence pinned to the own award enrollment and exact nested criterion, with byte-hash duplicate detection. The existing confirmed moderated/self-attested policy still determines credit; upload alone is discovery/storage. Owners and live delegated assessors can download the exact PDF. Content admins/managers cannot read it or launder it into published content; Bridge results withhold files, IDs, hashes and statements. Tests cover revocation, audit rollback, persisted retry and legacy migration. PR #70 head d4ba2c6e5be56cbc5c0d0209c968edef35b0402b passed all eight acceptance jobs in run 37468044994, including strict unpacked Lime and actual Coconut native. PR #69 updated head c3b465f10562315d048c3a78fdcf35abc63e55dc likewise passed all eight jobs in run 37467334159 after native marker parsing was made safe across stderr chunk boundaries.

## Feedback and printable certificates — stacked on PR #70

Migration 011 adds one voluntary, confirmed opinion per completed learner/course version. Human own reads and tenant-admin review preserve private comments; agents receive only version-scoped rating count/mean. Comments are omitted from operational audit. Ratings cannot affect official learning or certificates. Shared certificate rendering prepares authenticated course/award data for the browser Print/Save PDF dialog, retaining plain-text downloads, pinned identity, Unicode and explicit synthetic/non-accredited issuer. Only the chosen print view is rendered, with report landscape and certificate portrait pages. See ADR-012 for boundaries and retained provider/insight gaps. Current-head verification is recorded in its PR/CI rather than inferred from the preceding stack.

Observed for the feedback/certificate head: build/typecheck PASS, 77 domain/HTTP tests PASS, host typecheck and 3 host tests PASS, all 12 production human journeys PASS and the 5 affected development journeys PASS. Actual Chromium PDFs for course/award are one-page portrait A4; pdftotext preserves the Vietnamese course title and excludes unrelated learning, evidence and feedback. CI installs the explicit Poppler verification dependency. Built shared-Pi browser-host validation is independent of strict native/Lime CI on this head.

## Standalone reading ledger — stacked on PR #71

Migration 012 pins one learner/item/version record, with human-only reading confirmation, monotonic completion time, owner-only body access and immutable content/file history after source retirement. Raw files and prohibited content remain outside Bridge results. No course/award credit, assessment or certificate is created. Item transcript/report/export rows retain live tenant/direct-report scope and separate reading completion from official assessment scores. ADR-013 and standalone domain/browser fixtures record the policy and retained cross-portal/provider gaps. Parent #71 head 9ac817a4df793ec97c1a1754fc1c6f936cafa62b passed all eight acceptance jobs in run 37469668252, including strict unpacked Lime and actual Coconut native; this head requires independent CI.

Observed standalone head: build/typecheck PASS; 81 domain/HTTP tests PASS; host typecheck and 3 host tests PASS; 13 production human journeys PASS and 3 affected development journeys PASS. The final exact-retry refinement allows reconciliation of an already committed tracking key after source retirement, while a new key still cannot track retired content; all 81 tests and the affected production journey passed again. Browser regression also moved the reader out of discovery for tracked learning, clears the other study surface when switching between item/course and keeps pending close/navigation consistent. Built shared-Pi browser-host 2 journeys PASS. Strict extension/native evidence remains per current-head CI.

## Calendar-month recurrence — stacked on PR #72

Optional monthly policy uses original date/clock anchors in a named timezone, clamps month ends, explicitly resolves repeated times and shifts missing times by the gap. Fixed deadlines retain their separate calendar anchor; rolling deadlines remain elapsed days from actual delivery. Existing delivered cycles remain pinned through edits. Six domain fixtures and one browser journey extend validation for transitions, deadlines, restart and bounded catchup. No migration or external delivery claim. See ADR-014.

The local execution environment is disconnected. Calendar arithmetic goldens were exercised against the actual helper in the authoring runtime; Node build/typecheck, SQLite tests and browser lanes have not yet been claimed as passing. Exact-head GitHub Actions results will be recorded in the PR.

Calendar PR #73 head b0ac1160431ce32672479cd7fe7870d3440315e3 passed all eight acceptance jobs in run 37475793046, including strict unpacked Lime and actual Coconut native; Pear ran 87 domain/HTTP tests, 14 development and 14 production journeys, and 2 shared-Pi journeys.

## Optional study telemetry — stacked on PR #73

Migration 013 stores private timer totals and one session-bound lease per learner. Human readers explicitly start/pause; visible-browser pulses accumulate bounded server-clock intervals without accepting client duration. Long gaps, hidden tabs, revoked access and overlapping leases cannot inflate the same interval. Timers never change official learning or CAS revisions. Course/item transcript/report/export rows add separate intended duration and observed seconds; awards remain null. Five domain/HTTP fixtures and a production/development browser journey cover persistence, authority, rollback and no official progress. Local runner remains offline; exact-head CI is required before claiming Node/SQLite/browser PASS.

Telemetry PR #74 head 66e06288b414fe7914eef702fecc0b508808c7ae passed all eight acceptance jobs in run 37477517138, with 92 domain/HTTP tests, 15 development and 15 production journeys, and 2 shared-Pi journeys.

## Content promotion and retirement alternatives — stacked on PR #74

Migration 014 stores explicit organization curation metadata. Aggregate impact includes pinned enrollments, reusable course/playlist/nested-award references and future assignment plans. Exact source/replacement impact is rechecked in the retirement transaction; no learning or references silently migrate. Learners explicitly preview a currently available alternative while original tracked reading remains pinned. Five domain/HTTP fixtures and one human browser journey cover metadata/privacy, role scope, stale impact, retry, rollback/restart, nested references and retained reading. Exact-head CI remains required; local runner is offline. External provider lifecycle feeds are unverified.

Curation PR #75 passed all eight acceptance jobs in run 37479392709, with 98 domain/HTTP tests, 16 development and 16 production journeys, and 2 shared-Pi journeys. The opaque standalone interactive launch regression also passes real HTTP owner/session/CSP assertions.

## Actual Pear native/MCP lane — stacked on PR #75

A strict native lane builds the real Pear guest and drives the real Coconut Tauri binary/sidecar under Xvfb. An external MCP SDK client discovers the authenticated Pear target, searches actual catalog metadata and submits a separately approved real enrollment; denied/hidden-host requests must leave the ledger unchanged. Human official-confirmation tools remain absent, progress stays pinned and account switching revokes old pairing. Fixture bootstrap/state routes exist only in the CI script and synthetic loopback process, never normal application entry points. No new native trust permission or guest evaluation primitive is introduced. Current-head runtime evidence is pending GitHub Actions because local execution is unavailable.

The first actual native Pear attempt exposed a Coconut sidecar EOF bug: with no durable gateway, optional chaining skipped the exit callback and left the MCP listener alive after native shutdown. The fix always resolves the optional close before exit; a child-process regression checks EOF/port release, and listener startup now reports bind errors directly. This is a runtime lifecycle fix, not a permission bypass. Native Pear evidence still requires the corrected exact head.


Corrected native PR #76 head fd186f143a42dceda48f9ca284b48e70ef3258f9 passed all eight acceptance jobs in run 37482539179, including actual Pear WebView and external Coconut MCP flow. The EOF/port-release and occupied-port regressions passed.

## Bounded course discovery — stacked on PR #76

Migration 015 records actual publication timestamps with unknown legacy dates. Versioned author metadata powers intersected filters, whole-row paging, explicit comparison and declared-profile recommendations. Controlled concepts provide transparent metadata paraphrases without claiming full semantic AI parity. Bridge egress withholds human-only outcomes and uploaded file identifiers; due unfinished work leads the learning list. Six domain fixtures and one browser journey require exact-head CI; local execution remains unavailable. See ADR-018. Provider content, taxonomy, language coverage and accessibility audit remain open.
