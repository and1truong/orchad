# Pear — Learning Management System

POC trong `orchad/pear`: một LMS độc lập bên cạnh `guava/`, với đích đến
feature parity với Go1 Learn. Người học dùng UI thường hoặc được hỗ trợ qua
Lime (host) theo Agent App Bridge 0.1. Epic: issue #49.

Pear sở hữu catalog, nội dung, enrollment, assessment, progress và quản trị
deterministic. Pear **không** nhúng model, provider key, chat UI, agent loop
hay domain-specific agent runtime — inference đi qua Mango/shared
`@orchard/agent-client`, tool dispatch đi qua host policy + consent +
approval rồi mới tới `window.agentBridgeV1`.

## Trạng thái

**P0 — Scope và contracts (đã đóng băng).** Chưa có code app. Mọi quyết định
kiến trúc và contract của đợt này nằm trong:

| Artifact | Nội dung |
| --- | --- |
| [docs/capability-register.md](docs/capability-register.md) | Capability register G01–G23 snapshot từ epic matrix: subfeature, nguồn/ngày, product surface, entitlement, Pear equivalent, phase, test, trạng thái, decision |
| [docs/adr/](docs/adr/) | ADR ngắn: aggregates/revisions, content versions/completion policies, role matrix, tenant boundary, license/model-egress, persistence/media isolation |
| [bridge/tool-catalog.json](bridge/tool-catalog.json) | Tool descriptors đã freeze theo bounded JSON Schema dialect (xem CONTRACT.md §2) |
| [bridge/policy-map.json](bridge/policy-map.json) + [host-policy.md](bridge/host-policy.md) | Mapping tool → role/consent/approval/egress mà host phải enforce |
| [fixtures/](fixtures/) | Envelope fixtures (describe/getContext/invoke/result/error) làm chuẩn contract cho implementation và host test |

`node scripts/validate-catalog.mjs` kiểm catalog + fixtures đúng dialect
`@orchard/bridge-contract` (chạy sau khi `npm ci && npm run build` trong
`packages/bridge-contract`). CI lane `pear` chạy kiểm này.

## Ranh giới đã chốt

- Parity = khả năng nghiệp vụ tương đương, không sao chép UI/mã/catalog Go1.
- Nội dung provider, bản dịch được công nhận, taxonomy độc quyền, benchmark
  thị trường và dịch vụ curator là dependency thương mại/dữ liệu — ghi
  BLOCKED/DEPENDENCY trong register, không xóa khỏi scope.
- Backend authoritative cho tenant/ACL/roles/entitlement/prerequisite/
  attempt cap/completion. Không tin `approved`, `userId`, `role` do
  model/page cung cấp.
- Reads tối thiểu, bounded; không trả answer key, toàn bộ roster,
  credential hay nội dung không được cấp.
- Mọi write: authenticated principal + aggregate revision + idempotency key
  + semantic payload, atomic trong một transaction; retry đúng key trả kết
  quả đã lưu, khác payload trả `IDEMPOTENCY_CONFLICT`.
- Auto-graded quiz chấm ở backend từ immutable quiz version; Lime không nộp
  score/pass. Submission/attendance/external evidence qua assessor workflow
  có scope và audit.
- Licensed full text/transcript không egress sang model nếu license cấm;
  answer key không bao giờ vào model context.
- Upload: validate type/size, quarantine, signed access; SCORM/interactive
  chạy origin riêng, sandbox, không chia cookie/bridge với Pear.

## Stack đề xuất (P1)

React/TypeScript + same-origin Fastify API + SQLite (`node:sqlite`), Node
24+, migrations và deterministic seeds — mô hình Guava, không copy canvas
logic. Dev port chưa dùng: **4315** (4310 guava trusted origin, 4313 coconut
sidecar, 4314 coconut fixture, 1420 vite dev). Cấu trúc dự kiến:
`src/client`, `src/shared`, `src/server`, `migrations`, `tests`.

## Không thuộc phase này

Chưa implement code, chưa deploy, chưa mua Go1/content/model API, chưa cài
Slack/Teams/IdP integration, chưa tạo credential, chưa scrape licensed
content. Các mục đó là kế hoạch có dependency/authorization riêng.
