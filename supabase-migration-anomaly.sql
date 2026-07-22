-- Migration: phát hiện video/creator nghi buff view (mua view ảo) từ chính lịch sử
-- snapshot đã có trong bảng videos - không cần nguồn dữ liệu mới, không đổi sync.
-- Chạy 1 lần (idempotent). Trang dùng function này: /trends (Signals).
--
-- 5 chỉ số, mỗi chỉ số cộng điểm vào anomaly score 0-100 (trần 100) của 1 dòng
-- (content_id, snapshot_date). Ngưỡng dưới đây là NGƯỠNG KHỞI ĐIỂM theo kế hoạch
-- tái cấu trúc phễu - cần tinh chỉnh lại sau khi chạy thử trên dữ liệu thật ~2 tuần:
--
--   1. velocity_spike (+30)     - (delta_views hôm đó - mean cùng nguồn/tuổi video)
--                                 / stddev >= 3.5 VÀ delta_views >= 5.000. Mean/stddev
--                                 tính riêng theo (source, age_bucket) để video mới đăng
--                                 tăng mạnh (bình thường) không bị lẫn với video cũ tự
--                                 nhiên gần như đứng yên.
--   2. late_spike (+30)         - video >= 10 ngày tuổi, tuần trước gần như đứng yên
--                                 (views tăng <= 10% trong 7 ngày trước đó), rồi 1 ngày
--                                 bỗng chiếm >= 50% tổng views luỹ kế - mẫu hình mua view
--                                 cho video cũ để kịp KPI campaign.
--   3. engagement_mismatch (+20) - CHỈ xét khi đã có (1) hoặc (2): tỉ lệ (like+comment)/view
--                                 của riêng phần tăng thêm thấp hơn 30% so với tỉ lệ
--                                 tương tác trung bình của chính creator đó (hoặc theo
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
--
-- LƯU Ý HIỆU NĂNG - ĐÃ ĐO THẬT: bản đầu tiên (percentile_cont/MAD theo nhóm, CTE không
-- đánh dấu materialized) mất 25-40s/lần gọi trên instance hiện tại (work_mem chỉ ~2.1MB
-- nên percentile_cont theo creator_id trên hàng trăm nghìn dòng luôn tràn ra đĩa; CTE
-- được tham chiếu nhiều lần bị Postgres tính lại từ đầu mỗi lần vì không materialized) -
-- vượt xa statement_timeout 8s của PostgREST, y hệt lỗi từng gặp ở /trends. Bản dưới đây:
--   - Đánh dấu MATERIALIZED các CTE trung gian dùng lại nhiều lần (raw/scoped/joined/
--     flagged/flagged2/result...) - tránh tính lại cả pipeline mỗi lần CTE được tham chiếu.
--   - Đổi baseline từ percentile_cont(0.5)/MAD sang avg/stddev_pop - cùng ý nghĩa thống kê
--     (lệch bao nhiêu độ lệch chuẩn so với "bình thường"), 1 trong 2 cách hợp lệ theo yêu
--     cầu ban đầu, nhưng tính được trong 1 lượt HashAggregate thay vì phải sort riêng từng
--     nhóm (creator_id có thể lên tới hàng nghìn nhóm).
-- Dù vậy, TOÀN BỘ pipeline vẫn quét ~250k+ dòng (không có filter nào loại được phần lớn
-- dữ liệu - đúng bản chất bài toán "so mọi video với baseline"), nên KHÔNG gọi hàm này
-- real-time mỗi lần load trang: xem anomaly_cache + refresh_anomaly_cache() ở cuối file -
-- trang /trends chỉ đọc lại kết quả đã cache, refresh_anomaly_cache() chạy 1 lần/ngày ngay
-- sau sync qua kết nối Postgres trực tiếp (không qua PostgREST, không bị giới hạn 8s).

create or replace function videos_anomaly_json(from_date date)
returns jsonb
language sql
stable
as $$
  with raw as materialized (
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
  scoped as materialized (
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
  baseline_stats as materialized (
    select source, age_bucket,
           avg(delta_views) as mean_delta,
           stddev_pop(delta_views) as stddev_delta
    from scoped
    where delta_views is not null and delta_hours between 18 and 30
    group by source, age_bucket
  ),
  -- Baseline tỉ lệ tương tác (like+comment)/view của phần TĂNG THÊM mỗi ngày - ưu tiên
  -- theo creator (đủ >= 3 mẫu), fallback theo nguồn nếu creator quá ít video.
  creator_engagement as materialized (
    select creator_id,
           avg((coalesce(delta_likes,0)+coalesce(delta_comments,0))::float / nullif(delta_views,0)) as mean_rate,
           count(*) as sample_count
    from scoped
    where delta_views is not null and delta_views > 0
    group by creator_id
  ),
  source_engagement as materialized (
    select source,
           avg((coalesce(delta_likes,0)+coalesce(delta_comments,0))::float / nullif(delta_views,0)) as mean_rate
    from scoped
    where delta_views is not null and delta_views > 0
    group by source
  ),
  joined as materialized (
    select
      s.*,
      bs.mean_delta,
      bs.stddev_delta,
      case when bs.stddev_delta > 0 then (s.delta_views - bs.mean_delta) / bs.stddev_delta else null end as velocity_z,
      case when ce.sample_count >= 3 then ce.mean_rate else se.mean_rate end as baseline_engagement_rate
    from scoped s
    left join baseline_stats bs on bs.source = s.source and bs.age_bucket = s.age_bucket
    left join creator_engagement ce on ce.creator_id = s.creator_id
    left join source_engagement se on se.source = s.source
  ),
  flagged as materialized (
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
  flagged2 as materialized (
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
  creator_cluster as materialized (
    select creator_id, snapshot_date, count(*) as flagged_count
    from flagged2
    where velocity_flag or late_spike_flag or negative_flag
    group by creator_id, snapshot_date
    having count(*) >= 3
  ),
  final as materialized (
    select f.*, coalesce(cc.flagged_count, 0) >= 3 as cluster_flag
    from flagged2 f
    left join creator_cluster cc on cc.creator_id = f.creator_id and cc.snapshot_date = f.snapshot_date
  ),
  result as materialized (
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

-- Cache kết quả videos_anomaly_json - singleton 1 dòng, ghi bởi refresh_anomaly_cache()
-- ngay sau mỗi lần sync (scripts/sync.ts, qua kết nối Postgres trực tiếp SUPABASE_DB_URL -
-- KHÔNG qua PostgREST vì role đăng nhập `authenticator` bị khoá statement_timeout=8s ở cấp
-- kết nối, không đủ cho query gốc dù đã tối ưu). computeAnomalies() (lib/supabaseData.ts)
-- chỉ SELECT lại dòng này - luôn nhanh (~vài chục ms) bất kể query gốc nặng cỡ nào.
create table if not exists anomaly_cache (
  id smallint primary key default 1 check (id = 1),
  computed_at timestamptz not null,
  window_days int not null,
  data jsonb not null
);

create or replace function refresh_anomaly_cache(p_window_days int default 14)
returns void
language plpgsql
as $$
declare
  v_from_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date - (p_window_days - 1);
  v_data jsonb;
begin
  v_data := videos_anomaly_json(v_from_date);
  insert into anomaly_cache (id, computed_at, window_days, data)
  values (1, now(), p_window_days, v_data)
  on conflict (id) do update set
    computed_at = excluded.computed_at,
    window_days = excluded.window_days,
    data = excluded.data;
end;
$$;
