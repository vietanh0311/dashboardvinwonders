-- Migration: phát hiện video/creator nghi buff view (mua view ảo) từ chính lịch sử
-- snapshot đã có trong bảng videos - không cần nguồn dữ liệu mới, không đổi sync.
-- Chạy 1 lần (idempotent). Trang dùng function này: /trends (Signals).
--
-- 5 chỉ số, mỗi chỉ số cộng điểm vào anomaly score 0-100 (trần 100) của 1 dòng
-- (content_id, snapshot_date). Ngưỡng dưới đây là NGƯỠNG KHỞI ĐIỂM theo kế hoạch
-- tái cấu trúc phễu - cần tinh chỉnh lại sau khi chạy thử trên dữ liệu thật ~2 tuần:
--
--   1. velocity_spike (+30)     - (delta_views hôm đó - median cùng nguồn/tuổi video)
--                                 / MAD >= 3.5 VÀ delta_views >= 5.000. Median/MAD tính
--                                 riêng theo (source, age_bucket) để video mới đăng tăng
--                                 mạnh (bình thường) không bị lẫn với video cũ tự nhiên
--                                 gần như đứng yên.
--   2. late_spike (+30)         - video >= 10 ngày tuổi, tuần trước gần như đứng yên
--                                 (views tăng <= 10% trong 7 ngày trước đó), rồi 1 ngày
--                                 bỗng chiếm >= 50% tổng views luỹ kế - mẫu hình mua view
--                                 cho video cũ để kịp KPI campaign.
--   3. engagement_mismatch (+20) - CHỈ xét khi đã có (1) hoặc (2): tỉ lệ (like+comment)/view
--                                 của riêng phần tăng thêm thấp hơn 30% so với tỉ lệ
--                                 tương tác trung vị của chính creator đó (hoặc theo
--                                 nguồn nếu creator chưa đủ mẫu) - view mua thường không
--                                 kèm like/comment tương ứng.
--   4. negative_views (+40)     - delta_views âm đáng kể (<= -5% views trước đó) - nền
--                                 tảng đã tự trừ view ảo, gần như bằng chứng trực tiếp
--                                 nên trọng số cao nhất.
--   5. creator_cluster (+20)    - >= 3 video của CÙNG creator dính (1)/(2)/(4) trong CÙNG
--                                 1 ngày sync - nâng cảnh báo lên mức creator (nghi buff
--                                 có tổ chức thay vì 1 video viral đơn lẻ).
--
-- Giới hạn đã biết (xem thêm GRAPH_REPORT/kế hoạch phễu):
--   - Sync ~1 lần/ngày -> độ phân giải velocity ~24h, không bắt được buff "bơm nhanh rút
--     nhanh trong vài giờ".
--   - videos_retention_cleanup chỉ giữ snapshot NGÀY trong 14 ngày gần nhất (xa hơn co về
--     1 snapshot/tuần) nên baseline theo tuổi video chỉ đáng tin trong cửa sổ ~14 ngày -
--     from_date truyền vào nên <= 14 ngày trước hiện tại.
--   - Đây là công cụ CHỈ HIỂN THỊ/CẢNH BÁO, không tự động kết luận buff/cheat - vẫn cần
--     người xem lại trước khi hành động (xem cột "reasons" để biết chỉ số nào đã kích hoạt).

create or replace function videos_anomaly_json(from_date date)
returns jsonb
language sql
stable
as $$
  with raw as (
    select
      content_id, snapshot_date, title, link, source, creator_id, creator_name,
      event_name, published_at, views, likes, comments,
      views    - lag(views)    over w as delta_views,
      likes    - lag(likes)    over w as delta_likes,
      comments - lag(comments) over w as delta_comments,
      greatest(1, (snapshot_date - lag(snapshot_date) over w)) * 24 as delta_hours,
      lag(views, 7) over w as views_7d_ago,
      (snapshot_date - published_at::date) as video_age_days
    from videos
    -- Lùi thêm 14 ngày so với from_date để lag()/lag(,7) có đủ lịch sử tính đúng ngay tại
    -- from_date, chứ không chỉ lọc trong CTE này rồi mất hết baseline ở biên cửa sổ.
    where snapshot_date >= from_date - 14
    window w as (partition by content_id order by snapshot_date)
  ),
  scoped as (
    select *,
      case
        when video_age_days <= 1 then '0-1'
        when video_age_days <= 3 then '2-3'
        when video_age_days <= 7 then '4-7'
        when video_age_days <= 14 then '8-14'
        else '15+'
      end as age_bucket
    from raw
    where snapshot_date >= from_date
  ),
  -- Baseline velocity theo (nguồn, tuổi video) - chỉ dùng cặp snapshot cách nhau ~1 ngày
  -- (18-30h) để không lẫn các cặp bị giãn do sync bỏ ngày (được co lại 1 snapshot/tuần).
  baseline_median as (
    select source, age_bucket,
           percentile_cont(0.5) within group (order by delta_views) as median_delta
    from scoped
    where delta_views is not null and delta_hours between 18 and 30
    group by source, age_bucket
  ),
  baseline_mad as (
    select s.source, s.age_bucket,
           percentile_cont(0.5) within group (order by abs(s.delta_views - bm.median_delta)) as mad
    from scoped s
    join baseline_median bm using (source, age_bucket)
    where s.delta_views is not null and s.delta_hours between 18 and 30
    group by s.source, s.age_bucket
  ),
  -- Baseline tỉ lệ tương tác (like+comment)/view của phần TĂNG THÊM mỗi ngày - ưu tiên
  -- theo creator (đủ >= 3 mẫu), fallback theo nguồn nếu creator quá ít video.
  creator_engagement as (
    select creator_id,
           percentile_cont(0.5) within group (
             order by (coalesce(delta_likes,0)+coalesce(delta_comments,0))::float / nullif(delta_views,0)
           ) as median_rate,
           count(*) as sample_count
    from scoped
    where delta_views is not null and delta_views > 0
    group by creator_id
  ),
  source_engagement as (
    select source,
           percentile_cont(0.5) within group (
             order by (coalesce(delta_likes,0)+coalesce(delta_comments,0))::float / nullif(delta_views,0)
           ) as median_rate
    from scoped
    where delta_views is not null and delta_views > 0
    group by source
  ),
  joined as (
    select
      s.*,
      bm.median_delta,
      mad.mad,
      case when mad.mad > 0 then (s.delta_views - bm.median_delta) / (mad.mad * 1.4826) else null end as velocity_z,
      case when ce.sample_count >= 3 then ce.median_rate else se.median_rate end as baseline_engagement_rate
    from scoped s
    left join baseline_median bm on bm.source = s.source and bm.age_bucket = s.age_bucket
    left join baseline_mad mad on mad.source = s.source and mad.age_bucket = s.age_bucket
    left join creator_engagement ce on ce.creator_id = s.creator_id
    left join source_engagement se on se.source = s.source
  ),
  flagged as (
    select j.*,
      (j.velocity_z is not null and j.velocity_z >= 3.5 and j.delta_views >= 5000) as velocity_flag,
      (
        j.video_age_days >= 10
        and j.delta_views is not null and j.views > 0 and j.delta_views >= 0.5 * j.views
        and j.views_7d_ago is not null
        and (j.views - j.views_7d_ago) <= 0.1 * nullif(j.views_7d_ago, 0)
      ) as late_spike_flag,
      (
        j.delta_views is not null and j.views is not null
        and (j.views - j.delta_views) > 0
        and j.delta_views <= -0.05 * (j.views - j.delta_views)
      ) as negative_flag
    from joined j
  ),
  flagged2 as (
    select f.*,
      (
        (f.velocity_flag or f.late_spike_flag)
        and f.baseline_engagement_rate is not null and f.baseline_engagement_rate > 0
        and f.delta_views is not null and f.delta_views > 0
        and ((coalesce(f.delta_likes,0)+coalesce(f.delta_comments,0))::float / f.delta_views)
              < 0.3 * f.baseline_engagement_rate
      ) as engagement_mismatch_flag
    from flagged f
  ),
  creator_cluster as (
    select creator_id, snapshot_date, count(*) as flagged_count
    from flagged2
    where velocity_flag or late_spike_flag or negative_flag
    group by creator_id, snapshot_date
    having count(*) >= 3
  ),
  final as (
    select f.*, coalesce(cc.flagged_count, 0) >= 3 as cluster_flag
    from flagged2 f
    left join creator_cluster cc on cc.creator_id = f.creator_id and cc.snapshot_date = f.snapshot_date
  ),
  result as (
    select *,
      least(100,
        (case when velocity_flag then 30 else 0 end) +
        (case when late_spike_flag then 30 else 0 end) +
        (case when engagement_mismatch_flag then 20 else 0 end) +
        (case when negative_flag then 40 else 0 end) +
        (case when cluster_flag then 20 else 0 end)
      ) as score
    from final
    where velocity_flag or late_spike_flag or negative_flag
  )
  select jsonb_build_object(
    'windowDays', (current_date - from_date),
    'videos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'contentId', content_id,
        'title', coalesce(title, ''),
        'link', coalesce(link, ''),
        'source', coalesce(source, ''),
        'creatorId', creator_id,
        'creatorName', coalesce(creator_name, '-'),
        'eventName', event_name,
        'snapshotDate', to_char(snapshot_date, 'YYYY-MM-DD'),
        'views', views,
        'deltaViews', delta_views,
        'deltaHours', delta_hours,
        'score', score,
        'reasons', (
          select coalesce(jsonb_agg(r), '[]'::jsonb) from unnest(array_remove(array[
            case when velocity_flag then 'velocity_spike' end,
            case when late_spike_flag then 'late_spike' end,
            case when engagement_mismatch_flag then 'engagement_mismatch' end,
            case when negative_flag then 'negative_views' end,
            case when cluster_flag then 'creator_cluster' end
          ], null)) as r
        )
      ) order by score desc, delta_views desc), '[]'::jsonb)
      from result
    ),
    'creators', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'creatorId', creator_id,
        'creatorName', creator_name,
        'snapshotDate', to_char(snapshot_date, 'YYYY-MM-DD'),
        'flaggedVideoCount', flagged_video_count,
        'maxScore', max_score
      ) order by max_score desc), '[]'::jsonb)
      from (
        select r.creator_id, max(r.creator_name) as creator_name, r.snapshot_date,
               count(*) as flagged_video_count, max(r.score) as max_score
        from result r
        where r.cluster_flag
        group by r.creator_id, r.snapshot_date
      ) per_creator
    )
  );
$$;
