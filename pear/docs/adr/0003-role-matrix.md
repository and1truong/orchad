# ADR 0003 — Role matrix

Trạng thái: Chốt (P0). Áp cho cả HTTP API lẫn bridge dispatch — server kiểm
tra permission riêng cho từng action, không tin role do page/model khai.

## Roles (G12)

| Role | Scope | Được | Không được |
| --- | --- | --- | --- |
| `learner` | self | đọc catalog được entitlement; enroll self; bookmark; attempt/answer/submit của mình; book session; submit external record của mình; đọc progress/certificate của mình | đọc roster/attempt người khác; mọi admin op; đọc answer key |
| `manager` | direct reports | mọi quyền learner; assign learning cho direct reports; report/progress trong scope | admin ops; người ngoài direct reports; đổi SSO/settings |
| `content_admin` | org content | mọi quyền learner; CRUD draft + publish course/playlist/award; curation flags; content lifecycle | user/role/integration/settings admin; assign (trừ khi cũng là manager scope) |
| `assessor` | assigned scope | mọi quyền learner; chấm long-answer/submission/attendance **trong danh sách được giao** | đọc submission ngoài scope; mọi quyền admin khác |
| `admin` | org tenant | đầy đủ trong tenant boundary | mọi thứ ngoài tenant; vượt ADR 0004 |

- Một user có thể giữ nhiều role; quyền hiệu dụng = union trong tenant.
- Assessor scope được gán trên assignment/submission cụ thể (list), không
  phải role flag toàn org.
- Manager→direct reports là quan hệ dữ liệu (`user.managerId`), check trên
  membership thật tại thời điểm gọi — không cache trong tool args.
- Role revoke mid-session: `sessionEpoch` đổi hoặc permission check fail ở
  dispatch tiếp theo; authority cũ fail closed theo contract.

## Kiểm tra bắt buộc (P1+)

Negative tests qua **cả** HTTP lẫn bridge: learner đoán ID người khác,
manager ngoài scope, stale session/role revoked, answer-key leakage,
content_admin sửa settings.
