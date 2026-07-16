// Truy vấn/ghi Supabase - server-only (import getSupabaseAdmin, dùng SERVICE
// ROLE KEY). Dùng bởi app/api/sync/route.ts (ghi) và app/api/data/**/route.ts
// (đọc). Không import file này từ component "use client".

import {
  addDaysToVnDate,
  runWithConcurrency,
  vnDayEndToUtcIso,
  vnDayStartToUtcIso,
  vnDaysAgo,
  type ContentItem,
  type ContentSource,
  type UserDetail,
} from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types khớp cấu trúc bảng trong supabase-schema.sql
// ---------------------------------------------------------------------------

export type VideoRow = {
  content_id: string;
  snapshot_date: string; // yyyy-MM-dd
  title: string | null;
  link: string | null;
  source: string | null;
  channel_username: string | null;
  published_at: string | null;
  event_id: string | null;
  event_name: string | null;
  creator_id: string | null;
  creator_name: string | null;
  workplace_unit: string | null;
  tags: { _id: string; name: string }[];
  views: number;
  likes: number;
  comments: number;
  points: number;
  cash: number;
  status: string | null;
  is_latest: boolean;
};

export type CreatorRow = {
  creator_id: string;
  name: string | null;
  hashtag: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean | null;
  city: string | null;
  tiktok_username: string | null;
  contract_status: string | null;
  contract_name: string | null;
  account_type: string | null;
  last_activated_at: string | null;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Mapping ContentItem (app) <-> VideoRow (DB)
// ---------------------------------------------------------------------------

export function contentItemToVideoRow(
  item: ContentItem,
  snapshotDate: string,
  channelUsername: string | null
): VideoRow {
  return {
    content_id: item._id,
    snapshot_date: snapshotDate,
    title: item.title ?? null,
    link: item.link ?? null,
    source: item.source ?? null,
    channel_username: channelUsername,
    published_at: item.publishedAt || item.createdAt || null,
    event_id: item.event?._id ?? null,
    event_name: item.event?.name ?? null,
    creator_id: item.createdBy?._id ?? null,
    creator_name: item.createdBy?.name ?? null,
    workplace_unit: item.createdBy?.workplaceUnitName ?? null,
    tags: (item.warningTags ?? []).map((t) => ({ _id: t._id, name: t.name })),
    views: item.statistic?.view?.total ?? 0,
    likes: item.statistic?.like?.total ?? 0,
    comments: item.statistic?.comment?.total ?? 0,
    points: item.statistic?.point?.total ?? 0,
    cash: item.statistic?.cash?.total ?? 0,
    status: item.status ?? null,
    is_latest: true,
  };
}

// Lưu ý: bảng videos KHÔNG lưu cover (ảnh thumbnail) để giữ DB nhẹ, nên
// ContentItem dựng từ Supabase sẽ không có ảnh preview (ContentTable/CreatorDrawer
// tự fallback sang ô xám khi cover rỗng).
export function videoRowToContentItem(row: VideoRow): ContentItem {
  return {
    _id: row.content_id,
    title: row.title ?? "",
    link: row.link ?? "",
    cover: "",
    desc: "",
    status: row.status ?? "",
    source: (row.source ?? "tiktok") as ContentSource,
    publishedAt: row.published_at ?? "",
    createdAt: row.published_at ?? "",
    event: row.event_id ? { _id: row.event_id, name: row.event_name ?? "" } : null,
    partner: null,
    createdBy: {
      _id: row.creator_id ?? "",
      name: row.creator_name ?? "-",
      workplaceUnitName: row.workplace_unit ?? undefined,
    },
    warningTags: row.tags ?? [],
    statistic: {
      view: { total: row.views ?? 0 },
      like: { total: row.likes ?? 0 },
      comment: { total: row.comments ?? 0 },
      point: { total: row.points ?? 0 },
      cash: { total: row.cash ?? 0 },
    },
  };
}

export function creatorRowToUserDetail(row: CreatorRow): UserDetail {
  return {
    _id: row.creator_id,
    email: row.email ?? undefined,
    phone: row.phone ? { full: row.phone, verified: row.phone_verified ?? undefined } : undefined,
    tiktok: row.tiktok_username ? { username: row.tiktok_username } : undefined,
    info: row.city ? { cityName: row.city } : undefined,
    contract:
      row.contract_status || row.contract_name
        ? { status: row.contract_status ?? undefined, name: row.contract_name ?? undefined }
        : undefined,
    hashtag: row.hashtag ?? undefined,
    accountType: row.account_type ?? undefined,
    lastActivatedAt: row.last_activated_at ?? undefined,
  };
}

// Với 1 content_id có nhiều dòng (nhiều snapshot_date), chỉ giữ lại dòng có
// snapshot_date lớn nhất (số liệu mới nhất) - dùng cho các trang đọc dữ liệu
// "hiện tại" (dashboard/creators/campaigns ở chế độ Supabase).
export function dedupeLatestPerContent(rows: VideoRow[]): VideoRow[] {
  const sorted = [...rows].sort((a, b) =>
    a.snapshot_date < b.snapshot_date ? -1 : a.snapshot_date > b.snapshot_date ? 1 : 0
  );
  const map = new Map<string, VideoRow>();
  sorted.forEach((r) => map.set(r.content_id, r));
  return Array.from(map.values());
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// PostgREST giới hạn mặc định 1000 dòng/response - query nào có thể vượt mốc
// này (bảng videos/creators không giới hạn ngày) phải phân trang bằng .range()
// và gộp lại, nếu không dữ liệu sẽ bị cắt cụt ở dòng thứ 1000.
const SUPABASE_PAGE_SIZE = 1000;

// buildQuery nên select("*", { count: "exact" }) để trang đầu trả về luôn tổng
// số dòng khớp filter - cho phép bắn song song toàn bộ các trang còn lại thay
// vì đợi tuần tự (trước đây: N trang = N round-trip nối tiếp tới Supabase, mỗi
// round-trip ~400-500ms - 1 khoảng 30 ngày ra ~14 trang thì mất 5-6s chỉ để
// tải dữ liệu). Nếu buildQuery không trả count (vd không truyền { count:
// "exact" }), fallback về phân trang tuần tự như cũ.
async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>
): Promise<T[]> {
  const first = await buildQuery(0, SUPABASE_PAGE_SIZE - 1);
  if (first.error) throw first.error;
  const firstChunk = first.data ?? [];
  const rows: T[] = [...firstChunk];

  if (firstChunk.length < SUPABASE_PAGE_SIZE) return rows;

  if (typeof first.count !== "number") {
    let page = 1;
    while (true) {
      const from = page * SUPABASE_PAGE_SIZE;
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await buildQuery(from, to);
      if (error) throw error;
      const chunk = data ?? [];
      rows.push(...chunk);
      if (chunk.length < SUPABASE_PAGE_SIZE) break;
      page += 1;
    }
    return rows;
  }

  const totalPages = Math.ceil(first.count / SUPABASE_PAGE_SIZE);
  const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 1);

  // Giới hạn 8 request đồng thời: bắn cả trăm trang cùng lúc (vd /trends kéo
  // toàn bộ lịch sử snapshot) làm nghẽn CPU instance Supabase - từng đo được
  // mỗi query từ ~1s phình lên 5-6s, thậm chí dính statement timeout.
  const restChunks: T[][] = new Array(remainingPages.length);
  await runWithConcurrency(remainingPages, 8, async (page) => {
    const from = page * SUPABASE_PAGE_SIZE;
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    restChunks[page - 1] = data ?? [];
  });
  restChunks.forEach((chunk) => rows.push(...chunk));

  return rows;
}

// ---------------------------------------------------------------------------
// Đọc dữ liệu (dùng bởi app/api/data/**)
// ---------------------------------------------------------------------------

export async function fetchLatestVideosByPublishedRange(
  fromDate: string,
  toDate: string,
  options: { eventId?: string } = {}
): Promise<ContentItem[]> {
  const supabase = getSupabaseAdmin();
  const fromAt = vnDayStartToUtcIso(fromDate);
  const toAt = vnDayEndToUtcIso(toDate);

  // Toàn bộ lọc + dedupe chạy trong 1 SQL function (videos_latest_in_range_json,
  // xem supabase-schema.sql): lọc is_latest=true (partial index, xem
  // markLatestSnapshot()) kèm DISTINCT ON content_id làm lưới an toàn cho dữ
  // liệu sync trước khi có is_latest hoặc lúc markLatestSnapshot() chạy dở.
  // Trả về jsonb nên không dính giới hạn 1000 dòng/response của PostgREST -
  // 1 round-trip duy nhất lấy trọn kết quả thay vì phân trang nhiều trang.
  const { data, error } = await supabase.rpc("videos_latest_in_range_json", {
    from_at: fromAt,
    to_at: toAt,
    p_event_id: options.eventId ?? null,
  });
  if (error) throw error;

  return ((data ?? []) as VideoRow[]).map(videoRowToContentItem);
}

export async function fetchAllCreatorRows(): Promise<CreatorRow[]> {
  const supabase = getSupabaseAdmin();
  // order theo khóa chính để thứ tự ổn định giữa các trang tải song song -
  // không có ORDER BY, Postgres không đảm bảo thứ tự nên phân trang có thể
  // lặp/sót dòng.
  return fetchAllRows<CreatorRow>((from, to) =>
    supabase.from("creators").select("*", { count: "exact" }).order("creator_id").range(from, to)
  );
}

export type EventOption = { _id: string; name: string };

// Danh sách event cho dropdown (vd Campaign Lifecycle) - chỉ select 2 cột
// event_id/event_name (nhẹ hơn nhiều so với select("*")) rồi dedupe ở JS, vì
// PostgREST không hỗ trợ SELECT DISTINCT qua supabase-js. Thay cho việc gọi
// thẳng /events của VC API thật (bị chặn 403 khi chạy trên Vercel).
export async function fetchDistinctEvents(sinceDate: string): Promise<EventOption[]> {
  const supabase = getSupabaseAdmin();
  const fromAt = vnDayStartToUtcIso(sinceDate);

  const rows = await fetchAllRows<{ event_id: string | null; event_name: string | null }>((from, to) =>
    supabase
      .from("videos")
      .select("event_id, event_name", { count: "exact" })
      .eq("is_latest", true)
      .not("event_id", "is", null)
      .gte("published_at", fromAt)
      // Thứ tự ổn định cho phân trang song song (xem fetchAllRows).
      .order("content_id")
      .range(from, to)
  );

  const map = new Map<string, string>();
  rows.forEach((r) => {
    if (r.event_id && !map.has(r.event_id)) map.set(r.event_id, r.event_name ?? r.event_id);
  });
  return Array.from(map.entries()).map(([_id, name]) => ({ _id, name }));
}

// ---------------------------------------------------------------------------
// Search creator theo tên/hashtag/SĐT (bảng creators) + link kênh/link video
// (bảng videos) - không giới hạn theo khoảng ngày, dùng cho tính năng "tra
// cứu creator" ở trang /creators. Chạy nhiều query ILIKE riêng theo cột (thay
// vì gộp .or() 1 chuỗi) để tránh phải tự escape dấu phẩy/ngoặc mà PostgREST
// dùng làm ký tự phân tách trong cú pháp .or().
// ---------------------------------------------------------------------------

export type CreatorSearchMatch = {
  creatorId: string;
  name: string | null;
  hashtag: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  tiktokUsername: string | null;
  matchedFields: string[];
  matchedVideos: { link: string; source: string | null; channelUsername: string | null }[];
};

// Escape ký tự đại diện của ILIKE ('%', '_') để search 1 chuỗi đúng nghĩa đen -
// nếu không, user gõ "%" sẽ vô tình khớp mọi dòng.
function escapeIlikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const SEARCH_MATCH_LIMIT = 30;

export async function searchCreatorsAndVideos(query: string): Promise<CreatorSearchMatch[]> {
  const supabase = getSupabaseAdmin();
  const pattern = `%${escapeIlikePattern(query.trim())}%`;

  const [byName, byHashtag, byPhone, byLink, byChannel] = await Promise.all([
    supabase.from("creators").select("*").ilike("name", pattern).limit(SEARCH_MATCH_LIMIT),
    supabase.from("creators").select("*").ilike("hashtag", pattern).limit(SEARCH_MATCH_LIMIT),
    supabase.from("creators").select("*").ilike("phone", pattern).limit(SEARCH_MATCH_LIMIT),
    supabase
      .from("videos")
      .select("creator_id, creator_name, link, source, channel_username")
      .eq("is_latest", true)
      .ilike("link", pattern)
      .limit(SEARCH_MATCH_LIMIT),
    supabase
      .from("videos")
      .select("creator_id, creator_name, link, source, channel_username")
      .eq("is_latest", true)
      .ilike("channel_username", pattern)
      .limit(SEARCH_MATCH_LIMIT),
  ]);

  for (const res of [byName, byHashtag, byPhone, byLink, byChannel]) {
    if (res.error) throw res.error;
  }

  const results = new Map<string, CreatorSearchMatch>();

  function ensureEntry(creatorId: string, base: Partial<CreatorSearchMatch>): CreatorSearchMatch {
    const existing = results.get(creatorId);
    if (existing) return existing;
    const entry: CreatorSearchMatch = {
      creatorId,
      name: base.name ?? null,
      hashtag: base.hashtag ?? null,
      phone: base.phone ?? null,
      email: base.email ?? null,
      city: base.city ?? null,
      tiktokUsername: base.tiktokUsername ?? null,
      matchedFields: [],
      matchedVideos: [],
    };
    results.set(creatorId, entry);
    return entry;
  }

  function addFieldMatch(row: CreatorRow, field: string) {
    const entry = ensureEntry(row.creator_id, {
      name: row.name,
      hashtag: row.hashtag,
      phone: row.phone,
      email: row.email,
      city: row.city,
      tiktokUsername: row.tiktok_username,
    });
    if (!entry.matchedFields.includes(field)) entry.matchedFields.push(field);
  }

  (byName.data ?? []).forEach((row) => addFieldMatch(row as CreatorRow, "name"));
  (byHashtag.data ?? []).forEach((row) => addFieldMatch(row as CreatorRow, "hashtag"));
  (byPhone.data ?? []).forEach((row) => addFieldMatch(row as CreatorRow, "phone"));

  type VideoMatchRow = {
    creator_id: string | null;
    creator_name: string | null;
    link: string | null;
    source: string | null;
    channel_username: string | null;
  };

  function addVideoMatch(row: VideoMatchRow, field: string) {
    if (!row.creator_id) return;
    const entry = ensureEntry(row.creator_id, { name: row.creator_name });
    if (!entry.matchedFields.includes(field)) entry.matchedFields.push(field);
    if (entry.matchedVideos.length < 5 && row.link) {
      entry.matchedVideos.push({ link: row.link, source: row.source, channelUsername: row.channel_username });
    }
  }

  (byLink.data ?? []).forEach((row) => addVideoMatch(row as VideoMatchRow, "video_link"));
  (byChannel.data ?? []).forEach((row) => addVideoMatch(row as VideoMatchRow, "channel_link"));

  return Array.from(results.values());
}

export async function fetchLatestSnapshotMeta(): Promise<{ snapshotDate: string; syncedAt: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("snapshots")
    .select("snapshot_date, synced_at")
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { snapshotDate: data.snapshot_date as string, syncedAt: data.synced_at as string };
}

// ---------------------------------------------------------------------------
// Ghi dữ liệu (dùng bởi app/api/sync/route.ts)
// ---------------------------------------------------------------------------

// Kênh của 1 video không đổi theo thời gian - tra cứu channel_username đã
// lưu ở bất kỳ snapshot trước đó để tránh phải resolveTikTokLink lại cho
// video "cũ" đã từng resolve.
export async function fetchExistingChannelMap(contentIds: string[]): Promise<Map<string, string | null>> {
  const supabase = getSupabaseAdmin();
  const result = new Map<string, string | null>();
  const chunks = chunkArray(Array.from(new Set(contentIds)), 400);

  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from("videos").select("content_id, channel_username").in("content_id", chunk);
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const r = row as { content_id: string; channel_username: string | null };
      if (!result.has(r.content_id)) result.set(r.content_id, r.channel_username);
    });
  }

  return result;
}

export async function fetchExistingCreatorIds(creatorIds: string[]): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const result = new Set<string>();
  const chunks = chunkArray(Array.from(new Set(creatorIds)), 400);

  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from("creators").select("creator_id").in("creator_id", chunk);
    if (error) throw error;
    (data ?? []).forEach((row) => result.add((row as { creator_id: string }).creator_id));
  }

  return result;
}

// fetchContentsRangeServer phân trang bằng offset trong lúc video mới vẫn có
// thể được tạo ra giữa chừng, nên cùng 1 content_id đôi khi rơi vào 2 trang
// liên tiếp. Nếu để lọt vào cùng 1 lệnh upsert, Postgres báo lỗi "ON CONFLICT
// DO UPDATE command cannot affect row a second time" vì 2 dòng trùng khoá
// xung đột (content_id, snapshot_date) - phải khử trùng trước khi upsert.
function dedupeByKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const map = new Map<string, T>();
  rows.forEach((row) => map.set(keyOf(row), row));
  return Array.from(map.values());
}

export async function upsertVideoRows(rows: VideoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const deduped = dedupeByKey(rows, (r) => `${r.content_id}|${r.snapshot_date}`);
  const supabase = getSupabaseAdmin();
  const chunks = chunkArray(deduped, 300);
  for (const chunk of chunks) {
    const { error } = await supabase.from("videos").upsert(chunk, { onConflict: "content_id,snapshot_date" });
    if (error) throw error;
  }
}

// Sau khi upsert snapshot của 1 lần sync (snapshotDate), đánh dấu is_latest=false
// cho các dòng snapshot CŨ hơn của cùng content_id đó - để fetchLatestVideosByPublishedRange
// chỉ cần lọc is_latest=true là ra đúng 1 dòng/video, không phải tải cả lịch sử
// rồi dedupe ở JS. Gọi ngay sau upsertVideoRows() trong mỗi lần sync.
export async function markLatestSnapshot(contentIds: string[], snapshotDate: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const chunks = chunkArray(Array.from(new Set(contentIds)), 400);

  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const { error } = await supabase
      .from("videos")
      .update({ is_latest: false })
      .in("content_id", chunk)
      .neq("snapshot_date", snapshotDate)
      .eq("is_latest", true);
    if (error) throw error;
  }
}

export async function upsertCreatorRows(rows: CreatorRow[]): Promise<void> {
  if (rows.length === 0) return;
  const deduped = dedupeByKey(rows, (r) => r.creator_id);
  const supabase = getSupabaseAdmin();
  const chunks = chunkArray(deduped, 300);
  for (const chunk of chunks) {
    const { error } = await supabase.from("creators").upsert(chunk, { onConflict: "creator_id" });
    if (error) throw error;
  }
}

export async function upsertSnapshotMeta(snapshotDate: string): Promise<{ syncedAt: string }> {
  const supabase = getSupabaseAdmin();
  const syncedAt = new Date().toISOString();
  const { error } = await supabase
    .from("snapshots")
    .upsert({ snapshot_date: snapshotDate, synced_at: syncedAt }, { onConflict: "snapshot_date" });
  if (error) throw error;
  return { syncedAt };
}

// ---------------------------------------------------------------------------
// /trends: view velocity (48h gần nhất) + so sánh tuần này/tuần trước
// ---------------------------------------------------------------------------

export type VelocityItem = {
  contentId: string;
  title: string;
  link: string;
  source: string;
  creatorName: string;
  views: number;
  prevViews: number;
  deltaViews: number;
  deltaHours: number;
  viewsPerHour: number;
};

export type PeriodMetrics = {
  from: string;
  to: string;
  videos: number;
  views: number;
  likes: number;
  comments: number;
  creators: number;
  avgViewsPerVideo: number;
};

export type WeekOverWeek = { thisWeek: PeriodMetrics; lastWeek: PeriodMetrics };

export type TrendsResult = {
  windowDays: number;
  velocity: VelocityItem[];
  weekOverWeek: WeekOverWeek;
  dailyTotals: { date: string; views: number; videos: number }[];
};

export async function computeTrends(windowDays = 14): Promise<TrendsResult> {
  const supabase = getSupabaseAdmin();
  const fromDate = vnDaysAgo(windowDays - 1);

  const rows = await fetchAllRows<VideoRow>((from, to) =>
    supabase
      .from("videos")
      .select("*", { count: "exact" })
      .gte("snapshot_date", fromDate)
      // content_id làm tiebreaker: snapshot_date trùng nhau rất nhiều, order
      // không ổn định làm phân trang song song lặp/sót dòng. Đi kèm index
      // (snapshot_date, content_id) để mỗi trang không phải sort lại toàn bộ.
      .order("snapshot_date", { ascending: true })
      .order("content_id", { ascending: true })
      .range(from, to)
  );

  // --- velocity: delta views giữa 2 snapshot gần nhất của mỗi content_id ---
  const byContent = new Map<string, VideoRow[]>();
  rows.forEach((r) => {
    const arr = byContent.get(r.content_id) ?? [];
    arr.push(r);
    byContent.set(r.content_id, arr);
  });

  const velocity: VelocityItem[] = [];
  byContent.forEach((snaps, contentId) => {
    if (snaps.length < 2) return;
    const sorted = [...snaps].sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const deltaViews = (last.views ?? 0) - (prev.views ?? 0);
    if (deltaViews <= 0) return;

    const deltaHours = Math.max(
      1,
      (new Date(`${last.snapshot_date}T00:00:00Z`).getTime() -
        new Date(`${prev.snapshot_date}T00:00:00Z`).getTime()) /
        (60 * 60 * 1000)
    );

    velocity.push({
      contentId,
      title: last.title ?? "",
      link: last.link ?? "",
      source: last.source ?? "",
      creatorName: last.creator_name ?? "-",
      views: last.views ?? 0,
      prevViews: prev.views ?? 0,
      deltaViews,
      deltaHours,
      viewsPerHour: deltaViews / deltaHours,
    });
  });
  velocity.sort((a, b) => b.deltaViews - a.deltaViews);

  // --- week-over-week: dùng snapshot mới nhất mỗi content_id, nhóm theo published_at ---
  const latestRows = dedupeLatestPerContent(rows);

  // Dashboard chỉ sync 1 lần/sáng nên dữ liệu luôn trễ 1 ngày so với vnToday() thật - nếu neo
  // "tuần này" vào vnToday(), ngày cuối cùng của khung sẽ luôn rỗng, khiến "tuần này" luôn thấp
  // hơn "tuần trước" một cách giả tạo. Neo vào snapshot_date mới nhất thực tế có trong `rows`.
  const anchorDate = rows.reduce((max, r) => (r.snapshot_date > max ? r.snapshot_date : max), fromDate);
  const thisWeekFrom = addDaysToVnDate(anchorDate, -6);
  const thisWeekTo = anchorDate;
  const lastWeekFrom = addDaysToVnDate(anchorDate, -13);
  const lastWeekTo = addDaysToVnDate(anchorDate, -7);

  function metricsFor(from: string, to: string): PeriodMetrics {
    const fromAt = vnDayStartToUtcIso(from);
    const toAt = vnDayEndToUtcIso(to);
    const inRange = latestRows.filter(
      (r) => !!r.published_at && r.published_at >= fromAt && r.published_at <= toAt
    );
    const views = inRange.reduce((s, r) => s + (r.views ?? 0), 0);
    const likes = inRange.reduce((s, r) => s + (r.likes ?? 0), 0);
    const comments = inRange.reduce((s, r) => s + (r.comments ?? 0), 0);
    const creators = new Set(inRange.map((r) => r.creator_id).filter((id): id is string => !!id)).size;
    return {
      from,
      to,
      videos: inRange.length,
      views,
      likes,
      comments,
      creators,
      avgViewsPerVideo: inRange.length > 0 ? views / inRange.length : 0,
    };
  }

  const weekOverWeek: WeekOverWeek = {
    thisWeek: metricsFor(thisWeekFrom, thisWeekTo),
    lastWeek: metricsFor(lastWeekFrom, lastWeekTo),
  };

  // --- tổng views/videos theo từng snapshot_date - chỉ mang tính tham khảo xu hướng ---
  const byDate = new Map<string, { views: number; videos: number }>();
  rows.forEach((r) => {
    const entry = byDate.get(r.snapshot_date) ?? { views: 0, videos: 0 };
    entry.views += r.views ?? 0;
    entry.videos += 1;
    byDate.set(r.snapshot_date, entry);
  });
  const dailyTotals = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    windowDays,
    velocity: velocity.slice(0, 20),
    weekOverWeek,
    dailyTotals,
  };
}
