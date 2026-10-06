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

P0 reference offering/portal and plan entitlements remain NOT VERIFIED. Standalone items, module/reusable-item authoring and every current bounded course/MCQ field now have human UI. Playlist/award and richer assessment/media types remain open. Full localization/accessibility, playlist/award, advanced assessment/assessor/submission/event workflows, user/groups/recurrence/notification, saved reports/exports, production identity/retention/media storage, licensed catalog lifecycle/entitlements, SCORM/xAPI/connectors/webhooks, semantic recommendation/practice quality and channel/conversation/native integration remain open in the register.

P2–P4 are not silently reduced or marked complete. Exact reference/legacy/commercial decisions need evidence or explicit scope approval before full-parity closure. Production identity and real-data/privacy gates must be satisfied before using this synthetic app for real learners.
