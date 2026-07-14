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
  primary key (content_id, snapshot_date)
);

-- Truy vấn "video published trong khoảng ngày X" (dashboard chính, /creators, /campaigns).
create index if not exists videos_published_at_idx on videos (published_at);
-- Truy vấn theo creator (bảng xếp hạng creator, drawer chi tiết).
create index if not exists videos_creator_id_idx on videos (creator_id);
-- Truy vấn theo campaign/event (bảng campaign).
create index if not exists videos_event_id_idx on videos (event_id);
-- Lấy lịch sử theo content_id để tính view velocity (/trends).
create index if not exists videos_content_id_snapshot_idx on videos (content_id, snapshot_date);
-- Lấy toàn bộ dữ liệu 1 ngày sync (dùng khi dedupe "snapshot mới nhất mỗi video").
create index if not exists videos_snapshot_date_idx on videos (snapshot_date);

create table if not exists creators (
  creator_id text primary key,
  name text,
  hashtag text,
  email text,
  phone text,
  city text,
  tiktok_username text,
  contract_status text,
  account_type text,
  last_activated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table snapshots enable row level security;
alter table videos enable row level security;
alter table creators enable row level security;

-- Không tạo policy nào cho anon/authenticated: chỉ SERVICE ROLE KEY (dùng ở
-- server, biến env SUPABASE_SERVICE_KEY) mới đọc/ghi được 3 bảng này.
