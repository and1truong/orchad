# ADR 0002 — Content versions và completion policies

Trạng thái: Chốt (P0).

## Bối cảnh

Epic yêu cầu: sửa course không làm mất attempt/progress của bản đã học;
không đổi silently course version đang học; quiz chấm từ immutable quiz
version; completion chỉ từ authoritative records; retired item ngừng
enrollment mới nhưng giữ lịch sử.

## Quyết định

1. **Immutable published versions.** Content item/course/playlist/award có
   draft (mutable, admin-only) và published versions (immutable, số version
   tăng đơn điệu). Publish tạo version mới; không sửa version đã publish.
2. **Pin theo enrollment.** Enrollment ghi `contentVersionId` lúc enroll;
   learner học đến hết trên version đó. Version mới chỉ áp cho enrollment
   mới hoặc khi admin chạy migration có audit + thông báo (P2).
3. **Completion policy per content type**, cấu hình admin, công khai trong
   item metadata: `all_lessons`, `quiz_pass`, `event_attendance`,
   `external_record_approved`, `self_attest` (chỉ khi admin bật — không là
   lối tắt của tutor). Completion là derived record từ ledger, lưu
   `{enrollmentId, policyVersion, satisfiedAt, evidenceRefs[]}`.
4. **Quiz attempts** chấm từ immutable `quizVersionId` + learner answers;
   score/pass do backend tính. Long answer tạo `pending_assessment`;
   assessor decision là record riêng có reason.
5. **Lifecycle states**: `draft → published → retiring → retired →
   (archived)`. Retiring/retired: không enrollment mới theo policy, giữ
   progress/history của enrollment hiện có; replacement workflow gắn
   `replacedById` + impact preview trước khi apply.
6. **Playlist** không có completion riêng và không assign được — chỉ
   curate/share (G04).

## Hệ quả

- Resume sau reload/đổi thiết bị đọc đúng version đã pin.
- Report/certificate trace được content + version + issuer.
- Duplicate enrollment giữ semantics rõ: cùng learner + cùng content → trả
  enrollment hiện có (idempotent), không tạo bản thứ hai.
