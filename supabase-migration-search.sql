-- Migration: index hỗ trợ tìm kiếm creator theo hashtag/tên/SĐT/link kênh/link
-- video (ILIKE '%...%'). Không có index phù hợp, Postgres phải quét toàn bộ
-- bảng (seq scan) cho mỗi lần search - chậm dần khi videos/creators tăng lên.
-- pg_trgm cho phép GIN index tăng tốc ILIKE substring match. Chạy 1 lần trong
-- SQL Editor của Supabase project (idempotent - chạy lại nhiều lần vẫn an toàn).

create extension if not exists pg_trgm;

create index if not exists creators_name_trgm_idx on creators using gin (name gin_trgm_ops);
create index if not exists creators_hashtag_trgm_idx on creators using gin (hashtag gin_trgm_ops);
create index if not exists creators_phone_trgm_idx on creators using gin (phone gin_trgm_ops);

create index if not exists videos_link_trgm_idx on videos using gin (link gin_trgm_ops);
create index if not exists videos_channel_username_trgm_idx on videos using gin (channel_username gin_trgm_ops);
