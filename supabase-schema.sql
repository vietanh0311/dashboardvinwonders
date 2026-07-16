-- vcreators-dashboard - schema Supabase (chạy trong SQL Editor của project).
--
-- 3 bảng:
--   snapshots  - 1 dòng / lần chạy sync trong ngày (snapshot_date duy nhất, đè synced_at nếu
--                chạy lại nhiều lần cùng ngày).
--   videos     - lịch sử số liệu video theo từng ngày sync (snapshot_date), khóa chính
--                (content_id, snapshot_date) -> mỗi video có nhiều dòng theo thời gian, dùng để
--                tính view velocity / so sánh tuần ở trang /trends.
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

alter table snapshots enable row level security;
alter table videos enable row level security;
alter table creators enable row level security;

-- Không tạo policy nào cho anon/authenticated: chỉ SERVICE ROLE KEY (dùng ở
-- server, biến env SUPABASE_SERVICE_KEY) mới đọc/ghi được 3 bảng này.
