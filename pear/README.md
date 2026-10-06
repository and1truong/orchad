# Pear

Independent deterministic LMS in Orchad. React/TypeScript, same-origin Fastify, Node 24 SQLite. Development port 4314; Guava 4310, Mango 4311 and Lime fixtures 4313 remain separate. This is a runnable vertical slice with stacked content-authoring delivery for [#49](https://github.com/and1truong/orchad/issues/49), not full Go1 parity.

## Run

From repository root, run npm --prefix packages/bridge-contract ci, then npm --prefix pear ci. Inside pear run npm run dev and open http://127.0.0.1:4314. One process serves Vite middleware and API on the same origin; edits hot reload. SQLite defaults to .data/pear.sqlite, with migrations and idempotent synthetic seed. No Go1 subscription, provider key or paid API required.

Synthetic accounts: learner-a, learner-b, manager, admin, editor, assessor; password is account name followed by -dev. manager has only learner-a as a direct report. An outsider account in another tenant exists solely for negative tests. All three original courses are authored in src/server/seed.ts; no Go1 catalog/material was copied. The security course intentionally disables model processing to exercise the egress gate.

Learner: Explore → filter/preview/save/enroll → My learning → study/acknowledge prerequisite lessons → start quiz → select own answers → confirm submission → backend score/completion/certificate → reload/resume. Admin: Administration → create/edit standalone item → publish reusable version → create/edit modular course draft → preview → publish new version → assign active learner → scoped learning report. Manager can assign/report only current direct reports. Content Admin can edit/publish/retire but cannot assign. Assessors can moderate only explicitly delegated award evidence.

## Build, persistence and deployment gate

npm run build performs TypeScript checks and creates dist. npm start serves built assets and API. Synthetic login is disabled in this mode unless PEAR_DEVELOPMENT_AUTH=true is explicitly set; this override also requires loopback host/origin. Production identity is not implemented, so ordinary production mode fails closed at login. A local built-mode demo uses PEAR_DEVELOPMENT_AUTH=true npm start. Never enable these accounts for real learner data.

Configuration: PORT defaults 4314; HOST defaults 127.0.0.1; APP_ORIGIN must be the exact origin; DATABASE_PATH selects the SQLite file; COOKIE_SECURE=true requires HTTPS. Set matching APP_ORIGIN when changing port/host. Node 24+ required. Dependencies are exact-pinned with a clean npm ci-verified lockfile.

## Test lanes

- npm test: independent domain/SQLite and HTTP/security tests. Does not require Lime/Mango installation.
- npm run typecheck and npm run build: independent Pear checks, including human browser tests.
- npm run test:e2e: nine human/admin/responsive/authoring/program/people/assignment/report browser journeys. Install Chromium first with npx playwright install chromium. Test DB is unique per runner invocation.
- npm run test:production: build plus the same browser journeys against built assets, with synthetic loopback accounts explicitly opted in.
- With Mango and Lime dependencies installed and builds complete: npm run typecheck:host, npm run test:host, npm run test:browser-host. The browser host lane uses production Lime HostPolicy, shared Pi agent-client, scripted fake Mango and real Pear browser/HTTP/SQLite. Browser transport and approval UI are labelled fixtures; it is not a live extension test.
- npm run test:lime: actual unpacked Lime extension-page UI, actual MAIN-world bridge and real Pear backend with fake Mango. First run npm --prefix mango ci, npm --prefix lime ci and npm --prefix lime run build from root. This lane requires an extension-capable Chromium runtime supporting a persistent profile. It is strict: inability to start a browser/extension fails, never turns into PASS. Native Chrome Side Panel container remains a separate manual lane.

CHROMIUM_PATH can choose a compatible local executable for browser lanes. CHROMIUM_EXTRA_ARGS is an optional JSON array used only by the unpacked-extension test harness. CI runs independent, human built/dev, shared-host browser and actual extension lanes and uploads actual screenshots/traces from artifacts/test-results.

Host integration checks use their own TypeScript config because they import Chrome host types/peer packages. They are excluded from the independent production build, then typechecked in typecheck:host after host installation. Runtime code in Pear never imports them.

## Lime and data boundaries

Sign in to Pear, choose the intended learner/admin workspace, then use Lime to select/pin the Pear tab, choose your configured gateway/model and consent to that target. Learner/admin navigation changes documentId, invalidating an old host binding. Describe/context/invoke use Bridge 0.1; reads and tools still require backend permissions. Search is keyword-based, not semantic search. A bounded tool list exposes explicit domain operations, not arbitrary DOM/JS/SQL/fetch.

Host mutation approvals cannot acknowledge learning, select or submit graded quiz answers: those operations exist only in the human controller, absent from the agent catalog. Quiz keys stay on the backend; published versions stay immutable; certificate creation follows a valid passing transaction. No score/pass or approved/userId/role argument is accepted.

Bridge lesson/assessment/course-draft/standalone-item reads with model processing disabled return a labelled withheld result. Human authenticated reads still work. The host owns gateway/provider consent and sending permitted context. Session cookies/CSRF are never model context. Source text, titles and tool results are untrusted data.

## Limits and open epic scope

See [capability register](docs/CAPABILITIES.md), [ADR](docs/ADR-001-LEARNING-BOUNDARIES.md) and [implementation report](IMPLEMENTATION-REPORT.md). Courses now support ordered modules, module/lesson prerequisites, and pinned reusable standalone item versions. The human editor covers all currently supported metadata, text/video/link/transcript lessons, module/lesson sequence, MCQ questions/options and quiz settings. Draft preview never records learning. Standalone items have their own draft/publish/retire lifecycle and learner reader; reading one does not award course completion. Programs navigation supports playlists and awards; Administration adds bounded playlist/award authoring, publication/retirement, assignment and scoped external evidence moderation. See [program ADR](docs/ADR-003-PROGRAMS.md). Internal self-authored PDF/audio/video/interactive HTML uploads and exact reusable media references are implemented; see [media ADR](docs/ADR-009-MEDIA.md). See [authoring ADR](docs/ADR-002-CONTENT-AUTHORING.md). Course content is limited to 44 KiB and bridge envelopes to 64 KiB; page results have row/byte bounds. Catalog/learning/draft UI provides pagination; reports/transcripts and saved definitions provide row/byte-bounded pagination. No scaling claim beyond the synthetic slice.

Certificate download is text, not PDF/accredited. VI/EN main navigation/actions and original content are fixtures, not full localization/translation parity. Video requires a transcript; captions/screen-reader/WCAG 2.2 AA audit remains open. Human uploads are immutable, scoped and bounded. Interactive HTML runs with an opaque sandbox origin and no access to Pear cookies, DOM, Bridge or network; its practice result cannot record completion. Production upload scanning/storage gates, archives and SCORM remain open.

P2–P4 features, paid/reference plan entitlements, licensing, production identity/retention and partner/native/channel lanes remain open. No public deployment or full-parity closure is part of this PR.

## Observed UI

Real browser screenshots, synthetic content only:

![Learner completion and backend-issued certificate](docs/evidence/human-completion.png)

![Responsive catalog](docs/evidence/mobile-catalog.png)

## Stacked delivery

The authoring layer targets codex/pear-lms-49 ([PR #59](https://github.com/and1truong/orchad/pull/59)), not main. Its PR diff contains only the next layer. Review/merge the foundational PR first; retarget/rebase dependent branches while preserving their incremental diffs. Epic #49 remains open until all parity capabilities and dependencies are resolved.

The program layer branches from codex/pear-authoring-49 (PR #60), continuing the stack. Human-only external evidence confirmation is absent from the agent catalog. Ongoing awards do not auto-complete; required rules and targets are independently enforced.

People and groups: Administration provides authorized roster, user lifecycle/custom fields, CSV dry-run/import/export and static/dynamic ALL/ANY/date group preview/save. Managers preview only direct reports. Learning preferences lets each user save their own interests/language. See [people ADR](docs/ADR-004-PEOPLE-GROUPS.md). This layer branches from codex/pear-programs-49 (PR #61).

Scheduled assignments: Administration provides audience/date/recurrence preview, version-pinned plan save/edit/close/cancel and admin due-job processing. Notifications are private and in-app. The deterministic scheduler runs every 30 seconds while the server runs; it catches up from persisted plans after restart. Recurring cycles have separate learning ledgers. Award course actions enroll the permitted course/version for that cycle. See [assignment ADR](docs/ADR-005-ASSIGNMENT-CYCLES.md). This layer branches from codex/pear-people-49 (PR #62).

Reports/transcripts: Transcript shows own course/award ledger and separate recurring cycles. Administration provides typed templates/filters/columns/sort, own saved report definitions and explicit filtered/all-authorized row plus visible/all-column CSV export. Print/save PDF uses the same authorized snapshot through the browser print dialog. See [report ADR](docs/ADR-006-REPORTS-TRANSCRIPTS.md). This layer branches from codex/pear-assignments-49 (PR #64).

Assistant workspace selects a bounded domain catalog. Navigation selects the matching group; changing it changes the Bridge document binding and requires the host to refresh context/tools/consent. Every domain retains backend role and aggregate authorization. Qualified views share the original personal/library revision. See [tool catalog ADR](docs/ADR-007-TOOL-GROUPS.md).

Typed assessments: course authoring supports MCQ, one-to-one matching, fill blanks and human-assessed long answers, with point weights, persisted question/choice shuffling and human-only answer release. Save typed responses before submission. Essay attempts show a pending review state; delegated assessors review under Administration, and the backend issues completion/certificates only after all questions are graded and the final score passes. Admin can allow further attempts for unfinished failed learning while retaining history. See [assessment ADR](docs/ADR-008-ASSESSMENTS.md). This layer branches from codex/pear-tool-groups-49 (PR #66).

Media layer: upload originals under Standalone content library, publish and reuse exact item versions in courses. PDF is downloaded as an attachment; audio/video uses native controls; interactive HTML is isolated practice. The binary upload endpoint alone accepts up to 8 MiB (128 MiB/512-object tenant quota); Bridge stays 64 KiB. Production uploads are disabled until scanning/storage gates are configured. Stack parent is assessment PR #67.

Blended learning: author Assignment submission or Instructor-led event lesson formats in the course editor. Learners confirm scoped PDF submissions or book a session. Course-delegated human assessors review submissions and record real attendance after start; these lessons cannot be acknowledged or passed by an assistant. All completed lessons then unlock the official quiz. Private calendar downloads describe the booked time; no provider meeting/calendar is created. See [ADR-010](docs/ADR-010-BLENDED-LEARNING.md). The next branch targets `codex/pear-media-49` (PR #68).
