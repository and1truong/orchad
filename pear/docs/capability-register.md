# Pear capability register — Go1 parity baseline

Snapshot P0 của epic #49. **Baseline nghiên cứu: 2026-10-05.** Chuẩn chính
là Go1 Learn hiện hành; phân biệt Go1 Content Library, Go1 AI, Morgan,
integrations và phần còn ở MyGo1. Register này là coverage baseline có
nguồn, **không** phải inventory tuyệt đối của mọi hợp đồng Go1.

Mỗi hàng = một feature/subfeature với: nguồn (link + ngày truy cập), product
surface, entitlement (plan/add-on điều kiện), Pear equivalent, phase,
test/evidence dự kiến, trạng thái, decision.

## Trạng thái

| Giá trị | Nghĩa |
| --- | --- |
| `PLANNED` | Trong scope Pear, chưa implement; phase ghi thứ tự delivery |
| `BLOCKED` | Cần dependency bên ngoài (account, sandbox, license, partner) trước khi verify |
| `DEPENDENCY` | Dữ liệu/dịch vụ thương mại — không đạt được chỉ bằng code; cần quyết định scope hoặc hợp đồng |
| `NOT VERIFIED` | Tài liệu công khai chưa đủ để khẳng định; phải xác minh trên reference portal trước khi chốt |
| `PASS` / `FAIL` | Chỉ gán sau khi có evidence từ test/demo trong phase tương ứng |

Quy tắc: không tự xóa hàng khỏi scope; mọi ngoại lệ cuối cùng cần decision
được chủ dự án chấp thuận. Feature Go1 phát hiện sau baseline được triage
riêng, không âm thầm thêm vào parity.

Reference portal/plan chưa chốt — **chốt trong discovery P1**, không mặc
định Premium Pro bao gồm mọi add-on, không suy dấu check từ bảng marketing
([plans](https://www.go1.com/plans), [product updates](https://help.go1.com/en/articles/11006201-curate-product-updates), truy cập 2026-10-05).

## G01 — Search

Nguồn: [find content with search](https://help.go1.com/en/articles/10632880-find-content-with-search) (truy cập 2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Keyword search toàn catalog | mọi plan | `learning_search` + catalog index | P1 | fixture query trả đúng/ổn định | PLANNED |
| Filter facets (skill, topic, provider, language, duration, level, type, rating, industry, updated, accessibility) | mọi plan | filter fields trong `learning_search`; metadata catalog có provenance | P1 | mọi filter tôn trọng entitlement; filter set test | PLANNED |
| Sort + preview + compare | mọi plan | sort enum; `learning_get_item` preview/outcomes; compare qua UI | P1 | preview không lộ nội dung không cấp | PLANNED |
| Semantic/AI-assisted search | Go1 AI (add-on/plan) | Lime diễn đạt ý định qua shared core; ranking semantic | P4 | bộ query semantic chuẩn tìm được nội dung liên quan khác từ khóa; **không gọi keyword-only là semantic parity** | BLOCKED (cần quality eval harness + dữ liệu metadata đủ lớn) |

## G02 — Homepage

Nguồn: [Go1 Learn homepage](https://help.go1.com/en/articles/10537333-getting-the-most-from-your-go1-learn-homepage) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Assigned/continue learning/saved sections | mọi plan | Learner home + `learning_get_my_learning` + `learning_set_bookmark` + resume | P1 | hai learner thấy đúng dữ liệu riêng; ưu tiên due/overdue; refresh/relogin giữ state | PLANNED |
| Personalized discovery/skill recommendations | theo plan | profile/interests + recommendation có lý do | P1 đơn giản, P4 chất lượng | recommendation chỉ chứa nội dung được phép; giải thích gắn source IDs | PLANNED |
| Curated/promoted content trên home | theo plan | featured/spotlight từ G03 | P2 | admin promote → learner home đổi; audit | PLANNED |

## G03 — Content administration + Go1 AI curation

Nguồn: [content administration](https://help.go1.com/en/articles/12147083-content-administration), [Go1 AI](https://www.go1.com/go1-ai) (2026-10-05). Surface: Go1 Learn admin + Go1 AI.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Organization library, endorse/spotlight/featured | admin | org library + curation flags | P2 | admin preview ảnh hưởng trước khi đổi | PLANNED |
| Content preferences | admin | content preference settings | P2 | preference áp cho đúng audience | PLANNED |
| Retiring/retired + replacement workflow | admin | content lifecycle states + replacement proposal | P2 | retired ngừng enrollment mới, giữ lịch sử; không đổi silently version đang học | PLANNED |
| Provider lifecycle feed (retirement từ provider) | Content Library | adapter ingest lifecycle feed | P3 | fixture feed → retiring state đúng | BLOCKED (cần provider feed/format) |
| AI curation (draft playlist/collection) | Go1 AI | Lime draft playlist qua shared core; admin approve | P4 | draft chỉ đề xuất; publish qua đúng role + host approval | PLANNED |

## G04 — Custom content structures

Nguồn: [create custom content](https://help.go1.com/en/articles/11574240-create-custom-content) (2026-10-05). Surface: Go1 Learn admin.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Standalone item | admin | content item (text/video/link/document) | P1 | CRUD + draft/preview/publish/unpublish | PLANNED |
| Course | admin | course + modules (G05) | P1 | validation từ chối cấu trúc con không hợp lệ | PLANNED |
| Playlist | admin | playlist = curated list, **không** completion riêng, không assign như course | P2 | assign playlist bị từ chối; share view-only | PLANNED |
| Award | admin | award/program (G08) | P2 | nested/depth limit theo ADR | PLANNED |
| Access scope (portal/audience) | admin | content access scope per portal/group | P2 | learner ngoài scope không thấy | PLANNED |

## G05 — Courses

Nguồn: [create and edit courses](https://help.go1.com/en/articles/13262124-create-and-edit-courses) (2026-10-05). Surface: Go1 Learn admin + learner.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Modules, sequence, prerequisites | mọi plan | course/module editor + prerequisite gate backend | P1 | backend chặn bỏ qua prerequisite qua cả UI lẫn bridge | PLANNED |
| Blended content types (text/video/link) | mọi plan | lesson types cơ bản | P1 | player render + progress per type | PLANNED |
| Media/document/audio/interactive lessons | mọi plan | thêm lesson types | P2 | render + tracking từng loại | PLANNED |
| Reusable content references/uploads | admin | content item reuse trong nhiều course | P2 | edit item → version mới, course pin cũ giữ nguyên | PLANNED |
| Course versioning không phá progress | mọi plan | immutable published versions (ADR 0002) | P1 | sửa course không mất attempt/progress bản đã học | PLANNED |

## G06 — Quizzes

Nguồn: [create and edit quizzes](https://help.go1.com/en/articles/16936766-create-and-edit-quizzes) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| MCQ auto-graded | mọi plan | quiz builder + backend grading từ immutable quiz version | P1 | golden fixtures scoring; **đáp án không ra learner API/bridge** | PLANNED |
| Matching, blanks, long answer | mọi plan | thêm question types | P2 | scoring fixtures per type; long answer chờ assessor | PLANNED |
| Attempts cap, retry rules | mọi plan | attempt cap + policy | P1 | cap enforced server-side | PLANNED |
| Randomization, partial credit, feedback, answer-release rules | mọi plan | quiz config fields | P2 | config matrix test; release rule tôn trọng | PLANNED |
| Quiz version behavior on edit | mọi plan | keep-version/reset có audit | P2 | decision log; không mất attempt đã nộp | PLANNED |

## G07 — Course submissions + events

Nguồn: [courses](https://help.go1.com/en/articles/13262124-create-and-edit-courses), [product updates — event release](https://help.go1.com/en/articles/11006201-curate-product-updates) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Submission upload + review | mọi plan | submission + assessor workflow | P2 | upload không tự là pass; assessor scoped | PLANNED |
| Instructor-led event/session | mọi plan | event/session entity | P2 | timezone/capacity/cutoff đúng | PLANNED |
| Booking | mọi plan | `learning_book_session` | P2 | concurrent booking không vượt capacity | PLANNED |
| Attendance | mọi plan | assessor marks attendance | P2 | attendance ledger, không self-mark | PLANNED |
| Calendar/video-link integration | theo plan | adapter | P3 | ics/link đúng learner timezone | BLOCKED (calendar/video provider) |

## G08 — Awards

Nguồn: [create and edit awards](https://help.go1.com/en/articles/16062130-create-and-edit-awards) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Target + required/elective | mọi plan | award rules engine | P2 | đạt target nhưng thiếu required → chưa complete | PLANNED |
| Alternatives (OR branches) | mọi plan | award alternatives | P2 | fixture mọi nhánh | PLANNED |
| Ongoing/recurring awards | mọi plan | ongoing award không auto-complete | P2 | recurrence test | PLANNED |
| Nested awards | mọi plan | award chứa award | P2 | reject cycle/depth quá giới hạn đã chốt trong ADR | PLANNED |
| External learning records | mọi plan | `learning_submit_external_record` + moderation | P2 | pending/failed record không cộng | PLANNED |

## G09 — Assignments

Nguồn: [assign learning](https://help.go1.com/en/articles/13283815-assign-learning-to-your-organization) (2026-10-05). Surface: Go1 Learn admin/manager.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Direct assignment (individual) | mọi plan | `learning_create_assignment` | P1 | learner nhận assignment; audit | PLANNED |
| Manager assign direct reports | mọi plan | scope check direct reports | P1 | manager ngoài scope bị FORBIDDEN | PLANNED |
| Group assignment + dynamic join/leave | mọi plan | group audience | P2 | fixture fixed cohort + dynamic | PLANNED |
| Fixed/rolling/no due date | mọi plan | due spec enum | P1 fixed, P2 đủ | due-date semantics test | PLANNED |
| Future schedule + recurrence | mọi plan | deterministic job schedule | P2 | job retry không nhân đôi enrollment/notification | PLANNED |
| Edit/close/cancel assignment | mọi plan | lifecycle ops | P2 | state machine test | PLANNED |

## G10 — Assignment progress + learner report

Nguồn: [track assignment progress](https://help.go1.com/en/articles/13284509-track-assignment-progress), [learner progress report](https://help.go1.com/en/articles/13298163-view-and-report-on-learner-progress) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Progress ledger (assigned/self-directed/overdue/completed) | mọi plan | enrollment/progress ledger | P1 | refresh/resume nhất quán | PLANNED |
| Duplicate enrollment semantics | mọi plan | idempotent enroll | P1 | định nghĩa rõ, test | PLANNED |
| CSV/PDF transcript export | mọi plan | report export | P2 | reconcile export với ledger; CSV formula-injection guard | PLANNED |
| Intended duration vs telemetry | mọi plan | duration metadata tách actual time | P2 | phân biệt trong report | PLANNED |

## G11 — Reports

Nguồn: [create and manage reports](https://help.go1.com/en/articles/13284409-create-and-manage-reports) (2026-10-05). Surface: Go1 Learn admin/manager.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Report templates/filters/columns | mọi plan | bounded report builder + `learning_report_query` | P2 | direct-report/org scope server-side | PLANNED |
| Saved reports + ownership | mọi plan | saved report entity | P2 | creator-only update | PLANNED |
| Export filtered/all rows, visible/all columns | mọi plan | export options | P2 | export không bypass ACL | PLANNED |
| NL → report spec (Lime) | Go1 AI | Lime chuyển yêu cầu tự nhiên thành spec reviewable | P4 | NL không execute SQL tùy ý; spec human/agent review | PLANNED |
| Scheduled export/delivery | theo plan | delivery channel | P3 | recipients authorized | BLOCKED (channel) |

## G12 — Roles

Nguồn: [roles and permissions](https://help.go1.com/en/articles/13191268-understand-user-roles-and-permissions) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Learner / Manager / Admin | mọi plan | role matrix ADR 0003 | P1 | server denies UI + bridge vượt scope | PLANNED |
| Content Admin | mọi plan | content admin role | P1 | không quản trị integrations/settings | PLANNED |
| Scoped Assessor | mọi plan | assessor scope per assignment | P2 | assessor không có quyền org-admin | PLANNED |
| Custom roles/permission overrides | theo plan | explicit permission table | P2 | permission matrix test | NOT VERIFIED (granularity plan-dependent) |

## G13 — Users + groups

Nguồn: [create and manage users](https://help.go1.com/en/articles/13211547-create-and-manage-users), [create a group](https://help.go1.com/en/articles/14406040-create-a-group) (2026-10-05). Surface: Go1 Learn admin.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| User lifecycle/profile/custom fields | admin | user CRUD + profile fields | P2 | deactivate revoke access giữ records | PLANNED |
| CSV import/export | admin | import pipeline | P2 | validation/dry-run/error rows; không duplicate identity | PLANNED |
| Static groups | admin | group membership | P2 | membership test | PLANNED |
| Dynamic groups (ALL/ANY/date rules) | admin | `learning_save_group_rules` + preview | P2 | preview đúng trước save; deterministic eval | PLANNED |
| Lime draft group rules | Go1 AI | agent draft → admin approve | P4 | draft không tự apply | PLANNED |

## G14 — Learner permissions: transcripts/certificates/ratings/insights

Nguồn: [roles](https://help.go1.com/en/articles/13191268-understand-user-roles-and-permissions), [plans](https://www.go1.com/plans) (2026-10-05). Surface: Go1 Learn learner.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Completion certificate + download | theo plan | certificate từ authoritative completion | P2 | trace được content/version/issuer | PLANNED |
| Feedback/ratings | theo plan | feedback entity | P2 | rating vào catalog aggregate | PLANNED |
| Skill/content insights | theo plan | insights surfaces | P4 | thiếu external benchmark phải nói thiếu | BLOCKED (benchmark dataset) |
| Accredited certification | provider/commercial | — | — | **không tự xưng accredited** | DEPENDENCY |

## G15 — Device support + accessibility

Nguồn: [browser and device support](https://help.go1.com/en/articles/5468374-browser-and-device-support), [search accessibility filters](https://help.go1.com/en/articles/10632880-find-content-with-search) (2026-10-05). Surface: Go1 Learn.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Responsive UI (mobile/tablet/desktop) | mọi plan | responsive human UI | P1 | E2E 3 form factors | PLANNED |
| Keyboard/screen reader, captions/transcripts | mọi plan | accessibility work trên app | P2 | keyboard/focus/captions test | PLANNED |
| Accessibility metadata filter | mọi plan | accessibility facet có provenance | P1 metadata, P2 audit | filter chỉ hiện item có metadata thật | PLANNED |
| WCAG 2.2 AA | — | **target Pear tự audit**, không claim Go1 | P2 | a11y report | PLANNED |
| Mobile learning không phụ thuộc extension | — | human UI độc lập Lime | P1 | mobile viewport E2E không cần bridge | PLANNED |

## G16 — Languages + Intelligent Translations

Nguồn: [finding content in your language](https://help.go1.com/en/articles/9755931-finding-content-in-the-language-of-your-choice), [Intelligent Translations](https://help.go1.com/en/articles/15160310-intelligent-translations) (2026-10-05). Surface: Go1 Learn + Content Library.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| UI locale + metadata language filter | mọi plan | VI/EN fixture; language facet | P1 | một content identity nhiều variants | PLANNED |
| Provider translations | Content Library | translated derivative assets có provenance | P3 | ưu tiên bản dịch có quyền, fallback rõ ràng | BLOCKED (provider content) |
| Intelligent/machine translation | Go1 AI | translation pipeline + quality review + disclosure | P4 | không tự dịch nội dung ngoài license | BLOCKED (license + quality gate) |
| Full supported language list | theo plan | — | — | gap phải hiện rõ, không coi VI/EN là parity | NOT VERIFIED |

## G17 — SSO + SCIM

Nguồn: [learner profiles](https://help.go1.com/en/articles/14848974-set-up-learner-profiles-to-power-personalisation-in-go1), [SCIM provisioning](https://help.go1.com/en/articles/9775525-scim-user-provisioning-and-de-provisioning) (2026-10-05). Surface: Go1 Learn platform.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| SSO sign-in | theo plan/IdP | SSO adapter | P3 | login/session revoke test | BLOCKED (IdP sandbox) |
| SCIM provision/update/deactivate | theo plan/IdP | SCIM endpoint | P3 | claims không tự nâng quyền | BLOCKED (IdP sandbox) |
| Support matrix protocol/provider | — | documented matrix | P3 | Go1 SCIM group behavior khác Okta/Azure — **không suy rộng mọi IdP** | PLANNED |

## G18 — SCORM/xAPI/LTI + LMS/HRIS connectors

Nguồn: [integration partner updates](https://help.go1.com/en/articles/11005352-integration-partner-product-updates), [MyGo1→Go1 Learn changes](https://help.go1.com/en/articles/16978924-changes-from-mygo1-to-go1-learn) (2026-10-05). Surface: platform/integrations.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| SCORM import/launch/tracking/export | theo plan | isolated SCORM runtime (origin/sandbox riêng) | P3 | fixture package launch/resume/completion; unsupported version fail rõ | BLOCKED (SCORM runtime lib + license profile cần chốt) |
| xAPI adapter theo conformance profile | theo plan | xAPI ingest/egress | P3 | duplicate/out-of-order statements test | BLOCKED (profile chưa chốt) |
| LTI 1.1/1.3 legacy | — | **không là dependency bắt buộc** — Go1 dừng hỗ trợ 2027-01-01 | P3 decision | explicit compatibility decision | DECIDED (không bắt buộc cho demo) |
| LMS/HRIS catalog/delivery connectors | partner | connector adapter matrix | P3 | sandbox/live evidence tách biệt | BLOCKED (partner sandbox) |

## G19 — REST API + webhooks

Nguồn: [webhooks](https://developers.go1.com/api/rest/2025-01-01/webhooks/), [webhook security](https://developers.go1.com/docs/developer-tools/webhooks/security/) (2026-10-05). Surface: platform.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Scoped integration API | theo plan | scoped API tokens | P3 | auth/scope tests | PLANNED |
| Signed/replay-protected webhooks | theo plan | outbox + signed events | P3 | signature/timestamp/retry/dedup/order tests | PLANNED |
| Wire-compatible Go1 API | — | — | — | **không hứa wire-compatible toàn bộ** | DECIDED |

## G20 — AI discovery + curation

Nguồn: [AI assistant search](https://help.go1.com/en/articles/17228184-search-content-with-the-ai-assistant), [Go1 AI](https://www.go1.com/go1-ai) (2026-10-05). Surface: Go1 AI.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Natural-language find/compare/explain | Go1 AI | Lime qua shared core + `learning_*` reads | P1 retrieval, P4 quality | recommendations có source IDs + giải thích; no-match trung thực | PLANNED |
| Draft playlist/admin proposals | Go1 AI | draft → đúng role + host approval | P4 | không quyền từ tool description | PLANNED |

## G21 — Knowledge Checks

Nguồn: [knowledge checks](https://help.go1.com/en/articles/14118571-knowledge-checks) (2026-10-05). Surface: Go1 Learn learner.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Optional practice sau bài học, tách graded quiz | theo plan | practice mode + Lime tutor | P4 | practice **không** sửa completion/official score | PLANNED |
| Tutor hỏi/gợi ý/giải thích từ nội dung được đọc | — | **thiết kế Pear**, không claim Go1 có đủ | P4 | grounded + nhãn AI; learner được skip | PLANNED |

## G22 — Morgan (flow-of-work assistant)

Nguồn: [about Morgan](https://help.go1.com/en/articles/14685020-about-morgan-by-go1), [Morgan learner flows](https://help.go1.com/en/articles/15595003-how-morgan-by-go1-works-for-learners) (2026-10-05). Surface: Morgan (separate product surface).

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Assistant: my learning, recommend, save/open, planning | Morgan | Lime-first assistant flow | P1 Lime, P4 full | real Lime → Pear journey; đọc kết quả thật | PLANNED |
| Slack/Teams channel adapters | Morgan | channel adapters | P4 | DM isolation, no channel leaks | BLOCKED (installs + consent + runtime ADR) |
| Digest/calendar links | Morgan | notifications/digest | P4 | bounded digest, đúng learner/timezone | BLOCKED (channels) |

## G23 — Go1 discovery MCP

Nguồn: [integration updates — MCP release](https://help.go1.com/en/articles/11005352-integration-partner-product-updates) (2026-10-05). Surface: platform/integrations.

| Subfeature | Entitlement | Pear equivalent | Phase | Test/evidence | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| Discovery exposed tới external agents | theo plan | Pear qua Agent App Bridge 0.1 + host MCP facade hiện có | P1 bridge, P3/P4 coverage | real host → Pear contract test | PLANNED |
| Native WebMCP | — | optional adapter sau verification | — | không gọi page bridge là MCP server | DECIDED (optional, không chặn) |

## Mục cần xác minh thêm trước khi chốt full parity

- Exact SCORM/xAPI profiles và export restrictions.
- Content launch/re-certification/notification edge cases.
- Complete supported language list.
- Plan entitlements/add-ons trên reference portal đã chốt.
- Skill/Content Insights metrics chính xác.
- Tenant branding/settings/share-across-portals.
- Legacy-only assessment/admin flows và lịch migration còn lại.

Thiếu bằng chứng **không** biến thành "Go1 không có". Không đưa gamification,
commerce, native mobile/offline, proctoring vào danh sách đã xác minh — nếu
muốn bổ sung ghi là Pear proposal kèm lý do, không tính vào parity.
