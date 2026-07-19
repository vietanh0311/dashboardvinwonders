-- Migration: bổ sung nốt các trường profile mà trước đây CHỈ lấy được từ API
-- live /users/<id> (qua nút "Tải profile" trên trang /creators).
--
-- Mục đích: sau migration này bảng creators chứa đủ MỌI trường mà UI cần, nên
-- trình duyệt không còn phải gọi VC API nữa - dashboard chỉ đọc Supabase. Điều
-- này quan trọng vì VC API chỉ nhận IP đã whitelist/VPN, trong khi người xem
-- dashboard thì không có.
--
-- Chạy 1 lần trong SQL Editor của Supabase (idempotent - chạy lại vẫn an toàn).
-- Sau khi chạy, creator ĐÃ có trong DB vẫn NULL ở các cột mới cho tới lần sync
-- kế tiếp có refresh profile:
--   npm run sync -- --refresh-creators
-- (không cần truyền token - sync tự đăng nhập, nhớ bật VPN).

-- Thông tin cá nhân (từ users/<id>.info + emailVerified)
alter table creators add column if not exists email_verified boolean;
alter table creators add column if not exists birth_day text;
alter table creators add column if not exists gender text;

-- Hợp đồng
alter table creators add column if not exists contract_tax_number text;

-- Trạng thái khoá tài khoản
alter table creators add column if not exists banned boolean;
alter table creators add column if not exists banned_reason text;

-- Thống kê tiền (users/<id>.statistic). Dùng numeric thay vì bigint vì đây là
-- số tiền và không có gì đảm bảo API luôn trả số nguyên.
alter table creators add column if not exists cash_total numeric;
alter table creators add column if not exists cash_remaining numeric;
alter table creators add column if not exists withdraw_total numeric;
