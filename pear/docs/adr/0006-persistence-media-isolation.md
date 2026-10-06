# ADR 0006 — Persistence và media isolation

Trạng thái: Chốt (P0).

## Quyết định

1. **SQLite** (`node:sqlite`, built-in driver, Node 24+) với migrations +
   deterministic seeds — đủ cho vertical slice, giống Guava. Production
   storage/media/job scaling là ADR mới có evidence trước rollout; không
   kéo SaaS infrastructure vào demo.
2. Mọi mutation = một SQLite transaction: permission + validate + revision
   + idempotency ledger + audit trong cùng commit. Host timeout không
   chứng minh rollback — ledger là source of truth cho retry.
3. **Uploads**: thư mục quarantine ngoài web root; validate type (sniff,
   không tin extension) + size cap; signed access URL ngắn hạn; scan/quarantine
   policy trước khi available; archive extraction chặn traversal/zip-bomb.
   Upload không tự là pass/submit.
4. **SCORM/interactive** chạy ở origin riêng + iframe sandbox (`allow-scripts`
   không `allow-same-origin`), không chia cookie/bridge với origin Pear.
   Không nới sandbox để package "chạy được". (P3, G18.)
5. Dev port Pear: **4315** (tránh 4310/4313/4314/1420 đã dùng).
   `APP_ORIGIN` exact-origin check như Guava; cookie
   `Secure,HttpOnly,Strict,__Host-` khi HTTPS.
6. Audit ledger append-only trong DB: actor, action, aggregate, revision,
   payload hash, requestId, timestamp, quyết định (approved/denied/reason).

## Hệ quả

- Reload/đổi thiết bị không mất progress đã commit (server-authoritative).
- Browser tab thứ hai/host reconnect đọc ledger thật; không replay mutation
  khi kết quả cũ còn ambiguous — phải đọc outcome trước (recovery journey
  của epic).
