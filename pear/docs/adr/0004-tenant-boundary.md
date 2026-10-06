# ADR 0004 — Tenant boundary

Trạng thái: Chốt (P0).

## Quyết định

1. Mọi bảng domain mang `orgId`; mọi query/bridge dispatch scope theo
   `orgId` của authenticated principal. Không có code path đọc cross-org.
2. POC chạy single-org seed (`org-demo`) nhưng **schema và checks viết
   multi-tenant ngay** — thêm org thứ hai không đòi refactor.
3. `documentId` aggregates (ADR 0001) luôn resolve trong org của principal;
   ID đoán được của org khác trả `FORBIDDEN`/`NOT_FOUND` nhất quán (không
   lộ tồn tại).
4. Content library chia sẻ giữa portals (share-across-portals của Go1) là
   entitlement flag per content, không là exception của boundary.
5. Production identity/SSO/provisioning, retention/export/delete và audit
   access là gate trước dữ liệu thật (P3, G17). Development accounts và
   synthetic learners phải có nhãn rõ ràng.

## Hệ quả

- Negative test bắt buộc: principal org A đoán ID org B qua HTTP + bridge.
- Host binding thấy `appId` + origin; tenant resolve phía server từ session,
  không từ args.
