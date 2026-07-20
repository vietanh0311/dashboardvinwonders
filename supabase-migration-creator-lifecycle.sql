-- Migration: creator_lifecycle_json - cohort giữ chân creator + funnel kích hoạt
-- (thời gian tới bài đăng thứ 2/3). Chạy 1 lần (idempotent - chạy lại nhiều lần
-- vẫn an toàn). Xem giải thích đầy đủ ở supabase-schema.sql.
--
-- Dùng dòng is_latest=true của bảng videos làm "toàn bộ lịch sử video từng
-- sync" (mỗi content_id luôn có đúng 1 dòng is_latest=true, không bao giờ bị
-- videos_retention_cleanup xoá - xem supabase-schema.sql) để tính:
--   cohorts - xếp creator vào "cohort" theo THÁNG đăng bài đầu tiên, đo % còn
--             hoạt động (>=1 bài) ở mỗi tháng kế tiếp (0-5 tháng sau).
--   funnel  - % creator đạt bài #2/#3, và số ngày trung vị giữa bài #1->#2,
--             #2->#3 - đo tốc độ "kích hoạt" sau bài đầu tiên.
--
-- LƯU Ý: KHÔNG có mốc "ngày đăng ký/mời tham gia" ở đâu trong hệ thống (creators
-- chỉ được ghi nhận khi sync phát hiện qua video của họ - xem upsertCreatorRows
-- trong lib/supabaseData.ts), nên "onboarding funnel" thật (mời -> đăng ký ->
-- bài đầu tiên) KHÔNG đo được. Funnel ở đây đo từ bài #1 (proxy tốt nhất hiện
-- có) - xem TODO ở lib/api.ts/fetchCreatorLifecycle.

create index if not exists videos_creator_id_published_idx on videos (creator_id, published_at) where is_latest;

create or replace function creator_lifecycle_json()
returns jsonb
language sql
stable
as $$
  with posts as (
    select creator_id, published_at,
           row_number() over (partition by creator_id order by published_at asc) as post_seq
    from videos
    where is_latest and creator_id is not null and published_at is not null
  ),
  first_posts as (
    select creator_id, min(published_at) as first_post_at
    from posts
    group by creator_id
  ),
  activity_offsets as (
    -- distinct vì posts có thể có nhiều bài trong cùng 1 activity_month - chỉ cần biết
    -- creator có hoạt động ở tháng đó hay không, không cần đếm số bài.
    select distinct fp.creator_id,
           date_trunc('month', fp.first_post_at) as cohort_month,
           (extract(year from date_trunc('month', p.published_at))::int
              - extract(year from date_trunc('month', fp.first_post_at))::int) * 12
             + (extract(month from date_trunc('month', p.published_at))::int
                  - extract(month from date_trunc('month', fp.first_post_at))::int) as month_offset
    from posts p
    join first_posts fp on fp.creator_id = p.creator_id
  ),
  cohort_sizes as (
    select date_trunc('month', first_post_at) as cohort_month, count(*) as cohort_size
    from first_posts
    group by 1
  ),
  retention_counts as (
    select cohort_month, month_offset, count(distinct creator_id) as active_creators
    from activity_offsets
    where month_offset between 0 and 5
    group by cohort_month, month_offset
  ),
  funnel_gaps as (
    select creator_id,
           max(published_at) filter (where post_seq = 1) as post1_at,
           max(published_at) filter (where post_seq = 2) as post2_at,
           max(published_at) filter (where post_seq = 3) as post3_at,
           count(*) as total_posts
    from posts
    group by creator_id
  )
  select jsonb_build_object(
    'cohorts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cohortMonth', to_char(cs.cohort_month, 'YYYY-MM'),
        'cohortSize', cs.cohort_size,
        'retention', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'monthOffset', rc.month_offset,
            'activeCreators', rc.active_creators,
            'retentionPct', round((rc.active_creators::numeric / cs.cohort_size) * 100, 1)
          ) order by rc.month_offset), '[]'::jsonb)
          from retention_counts rc
          where rc.cohort_month = cs.cohort_month
        )
      ) order by cs.cohort_month), '[]'::jsonb)
      from cohort_sizes cs
    ),
    'funnel', jsonb_build_object(
      'totalCreators', (select count(*) from funnel_gaps),
      'reachedPost2', (select count(*) from funnel_gaps where total_posts >= 2),
      'reachedPost3', (select count(*) from funnel_gaps where total_posts >= 3),
      'medianDaysToPost2', (
        select round((percentile_cont(0.5) within group (
          order by extract(epoch from (post2_at - post1_at)) / 86400
        ))::numeric, 1)
        from funnel_gaps where post2_at is not null
      ),
      'medianDaysToPost3', (
        select round((percentile_cont(0.5) within group (
          order by extract(epoch from (post3_at - post2_at)) / 86400
        ))::numeric, 1)
        from funnel_gaps where post3_at is not null
      )
    )
  );
$$;
