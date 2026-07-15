-- Migration: thêm cột is_latest vào bảng videos đã tồn tại trên production +
-- backfill dữ liệu hiện có. Chạy 1 lần (idempotent - chạy lại nhiều lần vẫn an
-- toàn). Xem giải thích đầy đủ ở supabase-schema.sql và lib/supabaseData.ts
-- (markLatestSnapshot).

alter table videos add column if not exists is_latest boolean not null default true;

-- Backfill: với dữ liệu cũ (upsert trước khi có is_latest), đánh dấu true cho
-- đúng dòng snapshot_date lớn nhất của mỗi content_id, false cho phần còn lại.
with latest as (
  select distinct on (content_id) content_id, snapshot_date
  from videos
  order by content_id, snapshot_date desc
)
update videos v
set is_latest = (v.snapshot_date = latest.snapshot_date)
from latest
where v.content_id = latest.content_id
  and v.is_latest <> (v.snapshot_date = latest.snapshot_date);

create index if not exists videos_is_latest_published_idx on videos (published_at) where is_latest;
