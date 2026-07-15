-- Migration: thêm cột phone_verified/contract_name vào bảng creators đã tồn
-- tại trên production. Chạy 1 lần (idempotent - chạy lại nhiều lần vẫn an
-- toàn). 2 cột này chỉ có trong dữ liệu từ API live /users/<id>, nên sau khi
-- chạy migration, các creator ĐÃ có sẵn trong DB vẫn sẽ có giá trị NULL cho
-- tới khi được tải lại - chạy:
--   npm run sync -- <vc-token> [số-ngày] --refresh-creators
-- để backfill cho toàn bộ creator xuất hiện trong cửa sổ ngày đang sync.

alter table creators add column if not exists phone_verified boolean;
alter table creators add column if not exists contract_name text;
