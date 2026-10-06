# Pear — CONTRACT-CHANGES

Bản ghi đề xuất/tiếp nhận thay đổi vào root `contract` phát sinh từ Pear.
`pear/CONTRACT.md` luôn byte-identical với root `contract`; không sửa riêng.

## Đã tiếp nhận

- `sessionEpoch` tùy chọn trong `getContext` (session binding) — Pear phát
  hành epoch cho mọi phiên đăng nhập; logout/account-switch làm authority
  cũ fail closed. (Adopted vào root contract trước P0.)

## Đề xuất

Chưa có. Nếu P1+ cần mở contract (ví dụ bounded `documentId` nhiều
aggregate), đề xuất ở đây trước, đối chiếu với lime/coconut/guava/mango, rồi
mới cập nhật root và copy byte-identical sang mọi `CONTRACT.md`.
