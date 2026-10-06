# Pear bridge fixtures (freeze P0)

Envelope fixtures làm chuẩn contract cho implementation P1 và host tests.
Shape theo root `contract` §2–3; tool schemas theo `../bridge/tool-catalog.json`;
policy theo `../bridge/policy-map.json`. `node ../scripts/validate-catalog.mjs`
kiểm mọi file ở đây (schema dialect, envelope shape, error codes, args đúng
inputSchema).

## Files

- `describe.json` — canonical `describe()` response: `protocolVersion`
  `"0.1"`, `appId` `"pear"`, `tools` = đúng `bridge/tool-catalog.json`
  (validator bắt deep-equal, không cho drift).
- `getContext.json` — `getContext()` response của learner đang ở workspace
  mình: `documentId` dạng `kind:id` (ADR 0001), `sessionEpoch` có mặt.
- `invoke/*.json` — mỗi file `{name, request, result}`:
  `request` = đúng shape `invoke` (requestId, documentId, toolName,
  arguments, expectedRevision, idempotencyKey); `result` = envelope
  `{ok, revision, data, error}`. Field `notes` ghi invariant mà fixture
  pin xuống.

## Invariants được pin

- Reads: `expectedRevision` và `idempotencyKey` đều `null`.
- Writes: cả hai bắt buộc; retry đúng key trả kết quả đã lưu, khác payload
  trả `IDEMPOTENCY_CONFLICT`; stale revision trả `STALE_CONTEXT`.
- `learning_get_lesson` result không chứa answer key; kèm `egress` per-item.
- `learning_submit_attempt` result là điểm do backend chấm, không phải số
  do caller gửi.
- Role violations trả `FORBIDDEN` qua cả bridge lẫn HTTP.
