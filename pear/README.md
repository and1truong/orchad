# Pear

Independent deterministic LMS in Orchad. React/TypeScript, same-origin Fastify, Node 24 SQLite. Development port 4314; Guava 4310, Mango 4311 and Lime fixtures 4313 remain separate. This is the first runnable vertical slice of [#49](https://github.com/and1truong/orchad/issues/49), not full Go1 parity.

## Run

From repository root, run npm --prefix packages/bridge-contract ci, then npm --prefix pear ci. Inside pear run npm run dev and open http://127.0.0.1:4314. One process serves Vite middleware and API on the same origin; edits hot reload. SQLite defaults to .data/pear.sqlite, with migrations and idempotent synthetic seed. No Go1 subscription, provider key or paid API required.

Synthetic accounts: learner-a, learner-b, manager, admin, editor, assessor; password is account name followed by -dev. manager has only learner-a as a direct report. An outsider account in another tenant exists solely for negative tests. All three original courses are authored in src/server/seed.ts; no Go1 catalog/material was copied. The security course intentionally disables model processing to exercise the egress gate.

Learner: Explore → filter/preview/save/enroll → My learning → study/acknowledge prerequisite lessons → start quiz → select own answers → confirm submission → backend score/completion/certificate → reload/resume. Admin: Administration → create/edit draft → publish new version → assign active learner → scoped learning report. Manager can assign/report only current direct reports. Content Admin can edit/publish/retire but cannot assign. Assessor workflow is not yet implemented; that identity receives no added privilege.

## Build, persistence and deployment gate

npm run build performs TypeScript checks and creates dist. npm start serves built assets and API. Synthetic login is disabled in this mode unless PEAR_DEVELOPMENT_AUTH=true is explicitly set; this override also requires loopback host/origin. Production identity is not implemented, so ordinary production mode fails closed at login. A local built-mode demo uses PEAR_DEVELOPMENT_AUTH=true npm start. Never enable these accounts for real learner data.

Configuration: PORT defaults 4314; HOST defaults 127.0.0.1; APP_ORIGIN must be the exact origin; DATABASE_PATH selects the SQLite file; COOKIE_SECURE=true requires HTTPS. Set matching APP_ORIGIN when changing port/host. Node 24+ required. Dependencies are exact-pinned with a clean npm ci-verified lockfile.

## Test lanes

- npm test: independent domain/SQLite and HTTP/security tests. Does not require Lime/Mango installation.
- npm run typecheck and npm run build: independent Pear checks, including human browser tests.
- npm run test:e2e: three human/admin/responsive browser journeys. Install Chromium first with npx playwright install chromium. Test DB is unique per runner invocation.
- npm run test:production: build plus the same browser journeys against built assets, with synthetic loopback accounts explicitly opted in.
- With Mango and Lime dependencies installed and builds complete: npm run typecheck:host, npm run test:host, npm run test:browser-host. The browser host lane uses production Lime HostPolicy, shared Pi agent-client, scripted fake Mango and real Pear browser/HTTP/SQLite. Browser transport and approval UI are labelled fixtures; it is not a live extension test.
- npm run test:lime: actual unpacked Lime extension-page UI, actual MAIN-world bridge and real Pear backend with fake Mango. First run npm --prefix mango ci, npm --prefix lime ci and npm --prefix lime run build from root. This lane requires an extension-capable Chromium runtime supporting a persistent profile. It is strict: inability to start a browser/extension fails, never turns into PASS. Native Chrome Side Panel container remains a separate manual lane.

CHROMIUM_PATH can choose a compatible local executable for browser lanes. CHROMIUM_EXTRA_ARGS is an optional JSON array used only by the unpacked-extension test harness. CI runs independent, human built/dev, shared-host browser and actual extension lanes and uploads actual screenshots/traces from artifacts/test-results.

Host integration checks use their own TypeScript config because they import Chrome host types/peer packages. They are excluded from the independent production build, then typechecked in typecheck:host after host installation. Runtime code in Pear never imports them.

## Lime and data boundaries

Sign in to Pear, choose the intended learner/admin workspace, then use Lime to select/pin the Pear tab, choose your configured gateway/model and consent to that target. Learner/admin navigation changes documentId, invalidating an old host binding. Describe/context/invoke use Bridge 0.1; reads and tools still require backend permissions. Search is keyword-based, not semantic search. A bounded tool list exposes explicit domain operations, not arbitrary DOM/JS/SQL/fetch.

Host mutation approvals cannot acknowledge learning, select or submit graded quiz answers: those operations exist only in the human controller, absent from the agent catalog. Quiz keys stay on the backend; published versions stay immutable; certificate creation follows a valid passing transaction. No score/pass or approved/userId/role argument is accepted.

Bridge lesson/assessment/draft reads with model processing disabled return a labelled withheld result. Human authenticated reads still work. The host owns gateway/provider consent and sending permitted context. Session cookies/CSRF are never model context. Source text, titles and tool results are untrusted data.

## Limits and open epic scope

See [capability register](docs/CAPABILITIES.md), [ADR](docs/ADR-001-LEARNING-BOUNDARIES.md) and [implementation report](IMPLEMENTATION-REPORT.md). Courses contain ordered lessons with prerequisite checks; separate modules/reusable item/playlist/award authoring remains open. The human editor edits basic first-lesson/first-question fields, preserving other fields of an existing draft; advanced multi-lesson/media authoring is available through authorized domain schemas but not a full editor. Course content is limited to 44 KiB and bridge envelopes to 64 KiB; page results have row/byte bounds. Catalog/learning/draft UI provides pagination; reports show the first 50 rows and saved lists the first 20 entries. No scaling claim beyond the synthetic slice.

Certificate download is text, not PDF/accredited. VI/EN main navigation/actions and original content are fixtures, not full localization/translation parity. Video requires a transcript; captions/screen-reader/WCAG 2.2 AA audit remains open. No upload/package/archive/iframe launch exists, so no privileged SCORM package is allowed to run same-origin.

P2–P4 features, paid/reference plan entitlements, licensing, production identity/retention and partner/native/channel lanes remain open. No public deployment or full-parity closure is part of this PR.

## Observed UI

Real browser screenshots, synthetic content only:

![Learner completion and backend-issued certificate](docs/evidence/human-completion.png)

![Responsive catalog](docs/evidence/mobile-catalog.png)
