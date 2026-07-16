-- Migration: retention cho lịch sử snapshot + chuyển tính toán /trends về SQL.
-- Chạy 1 lần (idempotent - chạy lại nhiều lần vẫn an toàn). Xem giải thích đầy
-- đủ ở supabase-schema.sql.
--
-- 1. videos_retention_cleanup: bảng videos chèn ~1 dòng/video/lần sync (cửa sổ
--    90 ngày ~ 36k dòng/lần) nên sẽ phình ~1M dòng/tháng nếu sync hằng ngày.
--    Function này dọn bớt lịch sử cũ: giữ snapshot theo NGÀY trong
--    keep_daily_days gần nhất, xa hơn chỉ giữ 1 snapshot/TUẦN (ISO week) cho
--    mỗi video. Không bao giờ xoá dòng is_latest=true (dashboard/creators/
--    campaigns đọc dữ liệu "hiện tại" từ các dòng này).
--
-- 2. videos_trends_json: toàn bộ tính toán của /trends (velocity, so sánh
--    tuần, daily totals) chạy trong DB, thay cho việc computeTrends kéo mọi
--    dòng có snapshot trong cửa sổ (74k+ dòng, tăng dần theo lần sync) về
--    Node rồi mới tổng hợp.

create or replace function videos_retention_cleanup(
  keep_daily_days int default 14,
  max_delete int default 20000
)
returns bigint
language sql
volatile
as $$
  with candidates as (
    select content_id, snapshot_date
    from (
      select content_id, snapshot_date, is_latest,
             row_number() over (
               partition by content_id, date_trunc('week', snapshot_date)
               order by snapshot_date desc
             ) as rn
      from videos
      where snapshot_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date - keep_daily_days
    ) ranked
    where rn > 1 and not is_latest
    limit max_delete
  ),
  deleted as (
    delete from videos v
    using candidates c
    where v.content_id = c.content_id
      and v.snapshot_date = c.snapshot_date
    returning 1
  )
  select count(*) from deleted;
$$;

create or replace function videos_trends_json(from_date date)
returns jsonb
language sql
stable
as $$
  with win as (
    select content_id, snapshot_date, title, link, source, creator_name, views,
           row_number() over w as rn,
           lead(views) over w as prev_views,
           lead(snapshot_date) over w as prev_date
    from videos
    where snapshot_date >= from_date
    window w as (partition by content_id order by snapshot_date desc)
  ),
  velocity as (
    select content_id, title, link, source, creator_name,
           views, prev_views, prev_date, snapshot_date,
           views - prev_views as delta_views,
           greatest(1, (snapshot_date - prev_date) * 24) as delta_hours
    from win
    where rn = 1
      and prev_views is not null
      and views - prev_views > 0
    order by views - prev_views desc
    limit 20
  ),
  anchor as (
    select coalesce(max(snapshot_date), from_date) as d
    from videos
    where snapshot_date >= from_date
  ),
  bounds as (
    select a.d - 6  as tw_from_d, a.d      as tw_to_d,
           a.d - 13 as lw_from_d, a.d - 7  as lw_to_d,
           ((a.d - 13)::timestamp at time zone 'Asia/Ho_Chi_Minh') as lw_from_at,
           ((a.d - 6)::timestamp  at time zone 'Asia/Ho_Chi_Minh') as tw_from_at,
           ((a.d + 1)::timestamp  at time zone 'Asia/Ho_Chi_Minh') as tw_end_excl
    from anchor a
  ),
  week_rows as (
    select v.published_at >= b.tw_from_at as in_this_week,
           v.views, v.likes, v.comments, v.creator_id
    from videos v, bounds b
    where v.is_latest
      and v.published_at >= b.lw_from_at
      and v.published_at < b.tw_end_excl
  ),
  wow as (
    select count(*)                 filter (where in_this_week)     as tw_videos,
           coalesce(sum(views)      filter (where in_this_week), 0) as tw_views,
           coalesce(sum(likes)      filter (where in_this_week), 0) as tw_likes,
           coalesce(sum(comments)   filter (where in_this_week), 0) as tw_comments,
           count(distinct creator_id) filter (where in_this_week)     as tw_creators,
           count(*)                 filter (where not in_this_week)     as lw_videos,
           coalesce(sum(views)      filter (where not in_this_week), 0) as lw_views,
           coalesce(sum(likes)      filter (where not in_this_week), 0) as lw_likes,
           coalesce(sum(comments)   filter (where not in_this_week), 0) as lw_comments,
           count(distinct creator_id) filter (where not in_this_week)   as lw_creators
    from week_rows
  ),
  daily as (
    select snapshot_date, sum(views) as views, count(*) as videos
    from videos
    where snapshot_date >= from_date
    group by snapshot_date
  )
  select jsonb_build_object(
    'velocity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'contentId', content_id,
        'title', coalesce(title, ''),
        'link', coalesce(link, ''),
        'source', coalesce(source, ''),
        'creatorName', coalesce(creator_name, '-'),
        'views', views,
        'prevViews', prev_views,
        'deltaViews', delta_views,
        'deltaHours', delta_hours,
        'viewsPerHour', delta_views::float / delta_hours
      ) order by delta_views desc), '[]'::jsonb)
      from velocity
    ),
    'thisWeek', jsonb_build_object(
      'from', to_char(b.tw_from_d, 'YYYY-MM-DD'),
      'to', to_char(b.tw_to_d, 'YYYY-MM-DD'),
      'videos', w.tw_videos,
      'views', w.tw_views,
      'likes', w.tw_likes,
      'comments', w.tw_comments,
      'creators', w.tw_creators,
      'avgViewsPerVideo', case when w.tw_videos > 0 then w.tw_views::float / w.tw_videos else 0 end
    ),
    'lastWeek', jsonb_build_object(
      'from', to_char(b.lw_from_d, 'YYYY-MM-DD'),
      'to', to_char(b.lw_to_d, 'YYYY-MM-DD'),
      'videos', w.lw_videos,
      'views', w.lw_views,
      'likes', w.lw_likes,
      'comments', w.lw_comments,
      'creators', w.lw_creators,
      'avgViewsPerVideo', case when w.lw_videos > 0 then w.lw_views::float / w.lw_videos else 0 end
    ),
    'dailyTotals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(snapshot_date, 'YYYY-MM-DD'),
        'views', views,
        'videos', videos
      ) order by snapshot_date), '[]'::jsonb)
      from daily
    )
  )
  from bounds b, wow w;
$$;
