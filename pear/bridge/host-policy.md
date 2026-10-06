# Pear host policy mapping (freeze P0)

Mapping trong `policy-map.json` là contract giữa Pear và trusted host
(Lime/Coconut): consent cần cấp gì, write nào cần approval, dữ liệu tool
nào được đưa vào model context. Server Pear enforce lại toàn bộ — map này
không phải authorization, là ranh giới host phải giữ.

## Trường

| Trường | Giá trị | Nghĩa |
| --- | --- | --- |
| `phase` | `p1`/`p2` | phase roadmap của epic #49 mà tool thuộc về; implementation bắt đầu từ `p1` |
| `roles` | role list | roles backend chấp nhận cho tool (ADR 0003); server check lại, host chỉ nên offer tool khi user có role phù hợp |
| `effect` | `read`/`write` | mirror của descriptor `effect` — read chạy trong consent, write cần approval |
| `consent` | `catalog`/`lesson_content`/`personal`/`report`/`admin_surface` | lớp dữ liệu mà consent text phải nêu tên khi hỏi user (xem dưới) |
| `approval` | `none`/`required`/`required_confirm` | `none`: read trong consent; `required`: approval UI rõ ràng gắn tool + canonical args + expectedRevision; `required_confirm`: như `required` nhưng UI phải hiện xác nhận learner tường minh (submit bài thi) |
| `egress` | `metadata`/`per_item_license`/`personal`/`scoped` | dữ liệu result được phép vào model context ở mức nào |

## Consent classes

- `catalog` — metadata catalog công khai trong org (title, provider,
  outcomes, duration). Egress an toàn ở mức metadata.
- `lesson_content` — nội dung bài học của learner; mỗi result kèm `egress`
  field per-item (`model_ok`/`no_model` — ADR 0005). Host tôn trọng per-item
  flag hơn là class chung.
- `personal` — dữ liệu của chính learner (enrollment, progress, attempt,
  bookmark, external record).
- `report` — dataset báo cáo scoped (manager/admin).
- `admin_surface` — thao tác quản trị (course draft, assignment, group
  rules, assess).

## Egress classes

- `metadata`: result chỉ chứa metadata ngắn; cho phép vào model context.
- `per_item_license`: result có thể chứa licensed text; field `egress` của
  từng item quyết định — `no_model` thì không đưa vào context dưới bất kỳ
  dạng tóm tắt nào.
- `personal`: dữ liệu cá nhân của learner đang phiên; chỉ vào context của
  chính learner đó, sau consent.
- `scoped`: dữ liệu nhiều người (progress/report/admin preview) — chỉ vào
  context khi caller có scope, và chỉ phần server trả.

## Invariants host phải giữ (contract + epic)

- Reads chỉ tự chạy trong consent đã cấp; writes mặc định cần approval.
- Approval gắn client/session + target + tool + canonical arguments +
  expectedRevision; payload đổi hoặc hết hạn phải xin lại.
- `learning_submit_attempt` là `required_confirm`: approval UI hiện rõ đây
  là nộp bài chấm điểm, kèm lựa chọn/confirmation của learner — tutor không
  được nộp hộ ngầm.
- Navigation/open tool có side-effect UI (nếu thêm sau) phải khai báo và
  xử lý theo host policy — không giả read để né approval.
- Cấm tools: `set_score`, `mark_everything_complete`, SQL/JS tùy ý,
  arbitrary URL fetch, role escalation, generic admin proxy. Tool không có
  trong catalog không được cấp quyền.
- Logout, đổi account/course, revoke consent hay sessionEpoch đổi ⇒ mọi
  authority cũ fail closed; không replay mutation sau reconnect.
