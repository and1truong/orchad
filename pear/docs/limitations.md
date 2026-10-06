# Pear P1 — limitations và evidence

Phase P1 (vertical slice) của epic #49. File này ghi thành thật chỗ nào
chưa đạt / chưa verify — theo nguyên tắc epic: BLOCKED/NOT VERIFIED thay
vì đóng mắt.

## Đã làm (evidence: `npm test` 13/13, CI lane `pear`)

- Scaffold chạy local: `npm run dev` port 4315, SQLite migrations + seed
  deterministic (org-demo; learner1/learner2/manager/cadmin/admin; 3 course
  VN tự viết + 2 item; quiz là item có payload quiz).
- Learner UI: Học của tôi (giao/đang học/hoàn thành/đã lưu + progress),
  catalog search + filter, item detail + enroll + bookmark, course player
  (module TOC, lesson body, "Đánh dấu hoàn thành"), quiz flow
  start→save_answer→submit→score backend + retake trong attempt cap.
- Admin UI (role manager/content_admin/admin): content list + drafts,
  course editor (modules + lessonIds + prerequisiteModuleIndexes) →
  save_course → publish_course với draftRevision pin; Giao bài →
  preview_assignment → create_assignment (manager scope direct reports).
- Contract pipeline đúng P0: BEGIN IMMEDIATE, idempotency lookup trước
  revision check, atomic write + audit; answer keys không egress; backend
  grading; documentId aggregates (workspace/enrollment/course/org).
- `window.agentBridgeV1` trên app page: describe → catalog freeze,
  getContext → aggregate theo route hiện tại + sessionEpoch binding,
  invoke → /api/invoke.
- Harness (`/harness/index.html`): mô phỏng host + fake Mango — scenario
  deterministic (search→enroll→my-learning; quiz boundary FORBIDDEN; RBAC
  deny; stale→retry), mỗi step qua Approve/Deny/Cancel của host trước khi
  invoke; console invoke thủ công + call log đầy đủ envelope.
- tests/harness.test.ts replay chính các scenario đó qua /api/invoke.

## Chưa làm / chưa verify trong P1

- **Lime side panel thật**: bridge đã có đủ describe/getContext/invoke theo
  contract và lime dùng `optional_host_permissions: http://*/*` nên
  127.0.0.1:4315 khả dụng — nhưng e2e với extension thật trong CI chưa có;
  verify thủ công qua lime-sidepanel-e2e skill, không tự động hóa ở P1.
- **Mango thật**: fake Mango chỉ phát canned steps — không inference, không
  streaming, không policy learning. Kết nối mango gateway thật là P2/P3.
- **Cancel mid-flight**: deny trước khi dispatch mô phỏng cancel cả chuỗi;
  cancel một invoke đang chạy in-flight chưa có (bridge 0.1 không định nghĩa
  cancel semantics).
- **assigned → enrolled**: learner UI hiện khóa được giao trong "Được giao"
  nhưng chưa có nút "Bắt đầu" đổi assigned→enrolled ngoài enroll (self-enroll
  trên content khác). Assignment-created enrollments giữ status 'assigned'
  cho tới khi learner enroll — hiện learner phải enroll qua item page.
- **Retire/replace flow**: status `retiring`/`retired`/`replaced_by` có trong
  schema nhưng chưa có UI/tool nào set — P2.
- **p2 tools**: report_query, preview/save_group_rules, playlists, awards,
  book_session, submit_external_record, assess_submission → UNSUPPORTED (đúng
  freeze), implement ở P2.
- **Media/SCORM/upload**: ADR 0006 chỉ là quyết định — chưa có upload,
  quarantine, SCORM origin; P3.
- **Notifications/recurrence**: assignment `startsAt`/`recurrence` được lưu
  nhưng không có scheduler — P2.
- **a11y/i18n**: UI tiếng Việt hardcoded; keyboard navigation tối thiểu; chưa
  audit axe — P2.

## Evidence

- `npm test`: 13 tests (8 backend + 5 harness scenario).
- CI: lane `pear` chạy validate-catalog + tsc --noEmit + npm test.
- Manual smoke: login learner1 → catalog → enroll → player → complete 4
  lesson → quiz → score 66.67 fail → retake → pass → status completed.
