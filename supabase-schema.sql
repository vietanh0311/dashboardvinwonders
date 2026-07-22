-- vcreators-dashboard - schema Supabase (chạy trong SQL Editor của project).
--
-- 3 bảng:
--   snapshots  - 1 dòng / lần chạy sync trong ngày (snapshot_date duy nhất, đè synced_at nếu
--                chạy lại nhiều lần cùng ngày).
--   videos     - lịch sử số liệu video theo từng ngày sync (snapshot_date), khóa chính
--                (content_id, snapshot_date) -> mỗi video có nhiều dòng theo thời gian, dùng để
--                tính view velocity / so sánh tuần ở trang /trends. Lịch sử KHÔNG giữ mãi:
--                videos_retention_cleanup (gọi cuối mỗi lần sync) giữ snapshot theo ngày trong
--                14 ngày gần nhất, xa hơn chỉ giữ 1 snapshot/tuần cho mỗi video.
--   creators   - thông tin creator dạng "cache mỏng" (không đầy đủ như /users/<id> thật, chỉ đủ
--                hiển thị nhanh trên bảng mà không cần token) - được cập nhật khi phát hiện
--                creator mới trong lúc sync.
--
-- Toàn bộ được ghi/đọc từ server (Next.js route handlers) bằng SERVICE ROLE KEY, không expose ra
-- client. RLS được bật nhưng KHÔNG có policy nào cho anon/authenticated -> service role (bypass
-- RLS mặc định) là cách duy nhất truy cập được các bảng này.

create table if not exists snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null unique,
  synced_at timestamptz not null default now()
);

create table if not exists videos (
  content_id text not null,
  snapshot_date date not null,
  title text,
  link text,
  source text,
  channel_username text,
  published_at timestamptz,
  event_id text,
  event_name text,
  creator_id text,
  creator_name text,
  workplace_unit text,
  tags jsonb not null default '[]'::jsonb,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  points integer not null default 0,
  cash numeric not null default 0,
  status text,
  -- true = dòng snapshot mới nhất của content_id này (duy nhất 1 dòng true/video,
  -- do markLatestSnapshot() trong lib/supabaseData.ts duy trì sau mỗi lần sync).
  -- Cho phép các trang đọc dữ liệu "hiện tại" lọc thẳng is_latest=true thay vì
  -- phải tải toàn bộ lịch sử snapshot rồi dedupe ở JS (chậm dần khi khoảng ngày
  -- filter càng dài vì video càng tích nhiều snapshot).
  is_latest boolean not null default true,
  primary key (content_id, snapshot_date)
);

-- Truy vấn "video published trong khoảng ngày X" (dashboard chính, /creators, /campaigns).
create index if not exists videos_published_at_idx on videos (published_at);
-- Lọc "chỉ snapshot mới nhất" kết hợp với published_at ở trên - partial index vì
-- is_latest=true chỉ chiếm ~1/N số dòng (N = số ngày video đã được sync).
create index if not exists videos_is_latest_published_idx on videos (published_at) where is_latest;
-- Truy vấn theo creator (bảng xếp hạng creator, drawer chi tiết).
create index if not exists videos_creator_id_idx on videos (creator_id);
-- Truy vấn theo campaign/event (bảng campaign).
create index if not exists videos_event_id_idx on videos (event_id);
-- Lấy lịch sử theo content_id để tính view velocity (/trends).
create index if not exists videos_content_id_snapshot_idx on videos (content_id, snapshot_date);
-- Lấy toàn bộ dữ liệu 1 ngày sync (dùng khi dedupe "snapshot mới nhất mỗi video").
create index if not exists videos_snapshot_date_idx on videos (snapshot_date);
-- Phục vụ /trends: phân trang ORDER BY (snapshot_date, content_id) đi thẳng
-- theo index, không phải sort lại toàn bộ dòng ở mỗi trang (dễ dính statement
-- timeout khi bảng lớn dần theo số lần sync).
create index if not exists videos_snapshot_content_idx on videos (snapshot_date, content_id);

create table if not exists creators (
  creator_id text primary key,
  name text,
  hashtag text,
  email text,
  phone text,
  -- Trạng thái xác minh SĐT - chỉ có ở API live /users/<id>, cần chạy
  -- `npm run sync -- <token> [days] --refresh-creators` để tải lại cho
  -- creator đã có sẵn trong DB (mặc định sync chỉ tải creator mới).
  phone_verified boolean,
  city text,
  tiktok_username text,
  contract_status text,
  contract_name text,
  account_type text,
  last_activated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Dedupe ngay tại DB: với mỗi content_id chỉ trả về dòng snapshot mới nhất
-- trong các video published trong [from_at, to_at]. Lọc is_latest=true (đi
-- partial index ở trên) là chính; DISTINCT ON làm lưới an toàn cho dữ liệu
-- sync từ trước khi có is_latest hoặc đúng lúc markLatestSnapshot() chạy dở
-- (khi đó 1 video có thể tạm có >1 dòng is_latest=true).
create or replace function videos_latest_in_range(
  from_at timestamptz,
  to_at timestamptz,
  p_event_id text default null
)
returns setof videos
language sql
stable
as $$
  select distinct on (content_id) *
  from videos
  where is_latest
    and published_at >= from_at
    and published_at <= to_at
    and (p_event_id is null or event_id = p_event_id)
  order by content_id, snapshot_date desc;
$$;

-- Wrapper trả jsonb thay vì setof: không dính giới hạn 1000 dòng/response của
-- PostgREST nên app lấy trọn kết quả trong 1 request (thay vì phân trang mỗi
-- trang re-chạy DISTINCT ON). Đây là function mà /api/data/contents gọi.
create or replace function videos_latest_in_range_json(
  from_at timestamptz,
  to_at timestamptz,
  p_event_id text default null
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(v), '[]'::jsonb)
  from videos_latest_in_range(from_at, to_at, p_event_id) v;
$$;

-- Trả về DANH SÁCH creator_id duy nhất đã đăng video trong khoảng ngày
-- (published_at) - dùng cho khối so sánh "creator mới/quay lại" + "% quay lại"
-- theo tier ở /creators (kỳ so sánh cố định 30 ngày trước kỳ đang xem, xem
-- computeNewVsReturning/computeTierBreakdown trong lib/api.ts). Trước đây
-- trang gọi thẳng videos_latest_in_range_json cho CẢ kỳ so sánh rồi chỉ lấy
-- creator_id ở phía client - kéo về hàng chục nghìn dòng video đầy đủ (title,
-- tags, 5 nhóm thống kê...) chỉ để dùng đúng 1 trường, khiến kỳ so sánh luôn
-- mất 3-5s dù kỳ đang xem đã tải xong từ lâu. Function riêng này SELECT
-- DISTINCT creator_id ngay trong DB, trả về vài trăm dòng (số creator hoạt
-- động trong kỳ) thay vì hàng chục nghìn dòng video.
--
-- Nhận thêm 4 tham số filter khớp 4 dropdown lọc content ở /creators (nguồn/sự
-- kiện/tag/nhóm cơ sở) để kỳ so sánh vẫn lọc nhất quán với kỳ đang xem khi
-- người dùng bật filter, thay vì luôn tính trên toàn bộ dữ liệu chưa lọc.
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

-- Wrapper trả jsonb (mảng string) - cùng lý do với videos_latest_in_range_json:
-- 1 round-trip duy nhất, không dính giới hạn 1000 dòng/response của PostgREST.
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

-- Danh sách event/campaign DUY NHẤT trong khoảng ngày - dùng cho dropdown chọn
-- campaign ở CampaignLifecycleChart + CampaignTopCreatorsTable (/campaigns).
-- SELECT DISTINCT ON chạy thẳng trong DB (đi index bên dưới) thay cho cách cũ
-- kéo mọi dòng video có event_id trong cửa sổ (hàng chục nghìn dòng ở cửa sổ
-- 90 ngày, PostgREST qua supabase-js không hỗ trợ SELECT DISTINCT) về Node rồi
-- dedupe ở JS - hay dính statement timeout khi bảng videos tích nhiều dòng.
--
-- LƯU Ý: index này từng thiếu "include (event_name)" - khiến Postgres vẫn phải
-- fetch heap cho ~35k dòng is_latest+event_id (chỉ có event_id/published_at
-- trong index, thiếu event_name) - đo được ~5s, sát ngưỡng timeout 8s của
-- Supabase. Thêm event_name vào include để thành Index Only Scan thật, đo lại
-- còn ~0.25s. Đây chính là nguyên nhân dropdown "Chọn campaign" ở /campaigns
-- (Lifecycle chart + Top creator theo campaign) không chọn được gì - hàm dưới
-- CHƯA TỪNG được deploy lên Supabase thật (chỉ có trong file này, chưa chạy).
create index if not exists videos_event_id_published_idx
  on videos (event_id, published_at) include (event_name) where is_latest and event_id is not null;

create or replace function videos_distinct_events_json(from_at timestamptz)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('_id', event_id, 'name', name) order by name), '[]'::jsonb)
  from (
    select distinct on (event_id) event_id, coalesce(event_name, event_id) as name
    from videos
    where is_latest and event_id is not null and published_at >= from_at
    order by event_id, published_at desc
  ) d;
$$;

-- Retention cho lịch sử snapshot: bảng videos chèn ~1 dòng/video/lần sync (cửa
-- sổ 90 ngày ~ 36k dòng/lần) nên sẽ phình ~1M dòng/tháng nếu sync hằng ngày.
-- Giữ snapshot theo NGÀY trong keep_daily_days gần nhất (đủ cho velocity/so
-- sánh tuần ở /trends); xa hơn chỉ giữ 1 snapshot/TUẦN (dòng có snapshot_date
-- lớn nhất trong mỗi ISO week) cho mỗi video. Dòng is_latest=true không bao
-- giờ bị xoá (dashboard/creators/campaigns đọc dữ liệu "hiện tại" từ đó, kể
-- cả khi video đã rời cửa sổ sync). Xoá tối đa max_delete dòng/lần gọi để
-- không dính statement timeout của PostgREST - cleanupOldSnapshots() trong
-- lib/supabaseData.ts (chạy cuối mỗi lần sync) gọi lặp đến khi hết dòng cần xoá.
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

-- Covering index cho CTE `daily` trong videos_trends_json bên dưới (tổng
-- views/videos theo snapshot_date) - tránh fetch heap cho ~35k dòng/ngày chỉ để
-- đọc thêm cột views. Đo được: seq scan không index ~7.2s -> index-only scan
-- với index này ~3s (cold).
create index if not exists videos_snapshot_date_views_idx on videos (snapshot_date) include (views);

-- Toàn bộ tính toán của /trends chạy trong DB, trả jsonb đã tổng hợp (vài
-- trăm dòng) thay vì app kéo mọi dòng có snapshot trong cửa sổ (74k+ dòng,
-- tăng dần theo lần sync) về Node. Gồm 3 phần, giữ nguyên logic của
-- computeTrends cũ (lib/supabaseData.ts):
--   velocity    - delta views giữa 2 snapshot gần nhất của mỗi content_id, chỉ
--                 lấy delta > 0, top 20.
--   thisWeek/lastWeek - metrics theo published_at trên dòng is_latest=true (đi
--                 partial index videos_is_latest_published_idx). Neo "tuần này"
--                 vào snapshot_date mới nhất thực tế (không phải hôm nay) vì
--                 sync 1 lần/sáng -> dữ liệu luôn trễ 1 ngày, neo vào hôm nay
--                 sẽ làm "tuần này" thấp hơn "tuần trước" một cách giả tạo.
--                 Ranh giới ngày quy đổi theo múi giờ VN như vnDayStartToUtcIso.
--   dailyTotals - tổng views + số dòng theo từng snapshot_date trong cửa sổ.
--
-- LƯU Ý HIỆU NĂNG (bug timeout "canceling statement due to statement timeout"
-- ở Signals - View velocity): bản velocity CŨ dùng window function LEAD quét
-- TOÀN BỘ ~252k dòng snapshot 14 ngày (~100% bảng videos ở quy mô hiện tại) chỉ
-- để lấy top-20 - đo được 15.6s. Bản dưới đây join trực tiếp ĐÚNG 2 mốc
-- snapshot_date gần nhất (không cần window qua cả cửa sổ 14 ngày), và thu hẹp
-- cột trước khi join+sort (chỉ content_id/views), chỉ lấy lại title/link/...
-- CHO 20 DÒNG THẮNG sau cùng - đo được 0.39s (từ 15.6s). `daily` CTE bên dưới
-- vẫn cần quét ~100% dòng trong cửa sổ (không tránh được, đúng bản chất "tổng
-- views/ngày") - dùng covering index videos_snapshot_date_views_idx để tránh
-- fetch heap, còn ~3s cold (từ 7.2s).
create or replace function videos_trends_json(from_date date)
returns jsonb
language sql
stable
as $$
  with dates as materialized (
    select array_agg(d order by d desc) as ds
    from (select distinct snapshot_date as d from videos where snapshot_date >= from_date order by d desc limit 2) x
  ),
  deltas as materialized (
    select l.content_id, l.views, p.views as prev_views, dates.ds[1] as snapshot_date, dates.ds[2] as prev_date
    from videos l
    join videos p on p.content_id = l.content_id and p.snapshot_date = (select ds[2] from dates)
    cross join dates
    where l.snapshot_date = dates.ds[1]
  ),
  top_velocity as materialized (
    select *, views - prev_views as delta_views
    from deltas
    where prev_views is not null and views - prev_views > 0
    order by views - prev_views desc
    limit 20
  ),
  velocity as (
    -- Join lại lấy cột hiển thị CHỈ cho 20 dòng đã thắng - point lookup rẻ qua
    -- videos_snapshot_content_idx (snapshot_date, content_id) hiện có.
    select t.content_id, v.title, v.link, v.source, v.creator_name,
           t.views, t.prev_views, t.prev_date, t.snapshot_date, t.delta_views,
           greatest(1, (t.snapshot_date - t.prev_date) * 24) as delta_hours
    from top_velocity t
    join videos v on v.content_id = t.content_id and v.snapshot_date = t.snapshot_date
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

-- creator_lifecycle_json: cohort giữ chân creator (theo tháng đăng bài đầu tiên) + funnel kích
-- hoạt (thời gian tới bài đăng thứ 2/3) - toàn bộ tính trong DB, trả về jsonb gọn (vài chục dòng
-- cohort + 1 object funnel) thay vì kéo lịch sử published_at của mọi creator về Node. Dùng dòng
-- is_latest=true làm "toàn bộ lịch sử video từng sync" (không bị videos_retention_cleanup xoá).
-- Xem giải thích đầy đủ ở supabase-migration-creator-lifecycle.sql, gồm cả lưu ý KHÔNG có mốc
-- "ngày đăng ký" trong hệ thống nên funnel đo từ bài #1 (proxy tốt nhất hiện có), không phải từ
-- lúc creator gia nhập.
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

alter table snapshots enable row level security;
alter table videos enable row level security;
alter table creators enable row level security;

-- Không tạo policy nào cho anon/authenticated: chỉ SERVICE ROLE KEY (dùng ở
-- server, biến env SUPABASE_SERVICE_KEY) mới đọc/ghi được 3 bảng này.

-- TÙY CHỌN (chạy tay nếu vẫn thỉnh thoảng gặp "canceling statement due to
-- statement timeout"): Supabase mặc định giới hạn mọi query qua PostgREST ở
-- 8s (role authenticator). Query jsonb cho khoảng ngày dài (60-90 ngày) lúc
-- instance bận có thể chạm ngưỡng này. App đã có cache theo lần sync + tự
-- retry nên hiếm gặp; nếu muốn nới hẳn, chạy 2 lệnh sau trong SQL Editor:
--   alter role authenticator set statement_timeout = '20s';
--   notify pgrst, 'reload config';
