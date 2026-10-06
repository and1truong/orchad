# ADR 0001 — Aggregates, revisions và documentId mapping

Trạng thái: Chốt (P0) — freeze cho P1.

## Bối cảnh

Bridge 0.1 yêu cầu `documentId` + `revision` nguyên tử theo domain document,
và mọi mutation phải ràng `expectedRevision`. Epic #49 cấm dùng một global
revision toàn org (một learner sẽ chặn mọi learner khác). Cần chốt Pear map
`documentId` sang aggregate nào.

## Quyết định

`documentId` = định danh **aggregate root** mà run đang tương tác, format
`kind:id` (id do backend cấp, `[a-zA-Z0-9_-]{1,80}`):

| documentId | Aggregate | Chứa | Điểm mount UI |
| --- | --- | --- | --- |
| `workspace:{userId}` | Learner workspace | my learning view, bookmarks, recommendations, saved | Learner home |
| `enrollment:{enrollmentId}` | Enrollment | progress ledger, attempts của enrollment đó | Course/lesson player |
| `course:{courseId}` | Course draft/admin aggregate | modules, lessons, publish state | Admin course editor |
| `org:{orgId}` | Org surface | assignments, groups, reports, settings | Admin console |

- Mỗi aggregate có revision tăng đơn điệu riêng. Selection (lesson đang mở,
  filter đang dùng) đi qua `selectionIds`, không làm tăng revision.
- Write chỉ mutate một aggregate; args mang explicit IDs cho entity phụ
  (`questionId`, `sessionId`). Cross-aggregate effects (enroll → workspace
  list) là read-through, không ràng revision của aggregate phụ.
- Bridge `invoke.expectedRevision` luôn là revision của `documentId` trong
  call đó — ví dụ submit attempt ràng `enrollment:{id}` revision, không phải
  course revision.
- `getContext` trả `documentId` của surface đang mount + `sessionEpoch` khi
  đăng nhập. Đổi lesson trong player không đổi `documentId` (cùng
  enrollment); reload page → `pageInstanceId` mới theo contract.

## Hệ quả

- Concurrency an toàn: writes chỉ serialize trên aggregate của chính nó.
- Model/host nhìn `documentId` dạng chuỗi, không diễn giải ngữ nghĩa.
- Implementation P1 phải persist revision counter per aggregate row.
