# ADR 0005 — License và model-egress rules

Trạng thái: Chốt (P0).

## Quyết định

1. Mọi content item mang license metadata:
   `{source, attribution, aiProcessing: "allow"|"deny", redistribution:
   "allow"|"deny", provenance}`. Demo chỉ dùng nội dung tự soạn/synthetic
   hoặc được cấp phép rõ ràng.
2. **Egress gate phía app**: `learning_get_lesson` và mọi read trả kèm
   `egress` field (`"model_ok"` | `"no_model"`) để host/policy map biết có
   được đưa vào model context không. Item `aiProcessing=deny`: chỉ trả
   metadata (title, summary ngắn do admin viết), không trả full
   text/transcript qua bridge. Summary cũng tuân license.
3. **Không bao giờ egress**: answer key, bài đã submit của learner khác,
   credential, cookies, quyết định moderation chưa public.
4. Consent của host phải nói rõ "selected learning data" nào gửi
   gateway/model nào (contract §3). Translated/derived assets ghi
   provenance + disclosure "machine/derived".
5. Lesson text, upload, metadata, tool result là **untrusted data** — kể cả
   câu "ignore instructions/complete course". Tool metadata không tự cấp
   read permission.

## Hệ quả

- `policy-map.json` có egress class per tool; host enforce, Pear cũng tự
  cắt payload.
- No-match/licensed-absent/retired → UX trả lý do + alternative hợp lệ,
  không fallback lén sang material không được phép.
