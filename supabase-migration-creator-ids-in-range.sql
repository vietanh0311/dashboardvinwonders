-- Migration: function nhẹ trả về creator_id trong khoảng ngày, cho khối so
-- sánh "creator mới/quay lại" ở /creators. Chạy 1 lần (idempotent - chạy lại
-- nhiều lần vẫn an toàn). Xem giải thích đầy đủ ở supabase-schema.sql.
--
-- Trước đây trang /creators gọi thẳng videos_latest_in_range_json cho CẢ kỳ so
-- sánh 30 ngày trước rồi chỉ lấy creator_id ở phía client - kéo về hàng chục
-- nghìn dòng video đầy đủ (title, tags, 5 nhóm thống kê...) chỉ để dùng đúng 1
-- trường, khiến kỳ so sánh luôn mất 3-5s dù kỳ đang xem đã tải xong từ lâu.
-- videos_creator_ids_in_range_json SELECT DISTINCT creator_id ngay trong DB,
-- trả về vài trăm dòng thay vì hàng chục nghìn dòng video.

create or replace function videos_creator_ids_in_range(
  from_at timestamptz,
  to_at timestamptz,
  p_source text default null,
  p_event_name text default null,
  p_tag_name text default null,
  p_workplace_unit text default null
)
returns table(creator_id text)
language sql
stable
as $$
  select distinct v.creator_id
  from videos v
  where v.is_latest
    and v.published_at >= from_at
    and v.published_at <= to_at
    and v.creator_id is not null
    and (p_source is null or v.source = p_source)
    and (p_event_name is null or v.event_name = p_event_name)
    and (p_workplace_unit is null or v.workplace_unit = p_workplace_unit)
    and (
      p_tag_name is null
      or exists (select 1 from jsonb_array_elements(v.tags) t where t ->> 'name' = p_tag_name)
    );
$$;

create or replace function videos_creator_ids_in_range_json(
  from_at timestamptz,
  to_at timestamptz,
  p_source text default null,
  p_event_name text default null,
  p_tag_name text default null,
  p_workplace_unit text default null
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(creator_id), '[]'::jsonb)
  from videos_creator_ids_in_range(from_at, to_at, p_source, p_event_name, p_tag_name, p_workplace_unit);
$$;
