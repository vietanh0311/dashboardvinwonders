// Truy vấn/ghi Supabase - server-only (import getSupabaseAdmin, dùng SERVICE
// ROLE KEY). Dùng bởi app/api/sync/route.ts (ghi) và app/api/data/**/route.ts
// (đọc). Không import file này từ component "use client".

import {
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
  email_verified: boolean | null;
  phone: string | null;
  phone_verified: boolean | null;
  city: string | null;
  birth_day: string | null;
  gender: string | null;
  tiktok_username: string | null;
  contract_status: string | null;
  contract_name: string | null;
  contract_tax_number: string | null;
  account_type: string | null;
  banned: boolean | null;
  banned_reason: string | null;
  cash_total: number | null;
  cash_remaining: number | null;
  withdraw_total: number | null;
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
// ContentItem dựng từ Supabase sẽ không có ảnh preview (CreatorDrawer tự
// fallback sang ô xám khi cover rỗng).
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
    channelUsername: row.channel_username,
    statistic: {
      view: { total: row.views ?? 0 },
      like: { total: row.likes ?? 0 },
      comment: { total: row.comments ?? 0 },
      point: { total: row.points ?? 0 },
      cash: { total: row.cash ?? 0 },
    },
  };
}

// Dựng CreatorRow từ profile API live. Dùng CHUNG cho scripts/sync.ts và
// app/api/sync/route.ts - trước đây 2 chỗ tự dựng row riêng nên thêm cột mới
// phải sửa 2 nơi và rất dễ lệch nhau.
//
// fallback là 1 ContentItem bất kỳ của creator: khi API /users/<id> lỗi (tài
// khoản bị xoá...) vẫn giữ được tên/hashtag lấy từ content, thay vì mất trắng.
export function userDetailToCreatorRow(
  creatorId: string,
  profile: UserDetail | null,
  fallback?: { name?: string; hashtag?: string }
): CreatorRow {
  return {
    creator_id: creatorId,
    name: fallback?.name ?? null,
    hashtag: profile?.hashtag ?? fallback?.hashtag ?? null,
    email: profile?.email ?? null,
    email_verified: profile?.emailVerified ?? null,
    phone: profile?.phone?.full ?? null,
    phone_verified: profile?.phone?.verified ?? null,
    city: profile?.info?.cityName ?? null,
    birth_day: profile?.info?.birthDay ?? null,
    gender: profile?.info?.gender ?? null,
    tiktok_username: profile?.tiktok?.username ?? null,
    contract_status: profile?.contract?.status ?? null,
    contract_name: profile?.contract?.name ?? null,
    contract_tax_number: profile?.contract?.taxNumber ?? null,
    account_type: profile?.accountType ?? null,
    banned: profile?.banned ?? null,
    banned_reason: profile?.bannedReason ?? null,
    cash_total: profile?.statistic?.cashTotal ?? null,
    cash_remaining: profile?.statistic?.cashRemaining ?? null,
    withdraw_total: profile?.statistic?.withdrawTotal ?? null,
    last_activated_at: profile?.lastActivatedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

// Chiều ngược lại: CreatorRow (Supabase) -> UserDetail để UI dùng y như dữ liệu
// từ API live. Sau khi bảng creators có đủ cột, đây là nguồn DUY NHẤT cho
// dashboard - trình duyệt không gọi VC API nữa.
export function creatorRowToUserDetail(row: CreatorRow): UserDetail {
  const info =
    row.city || row.birth_day || row.gender
      ? {
          cityName: row.city ?? undefined,
          birthDay: row.birth_day ?? undefined,
          gender: row.gender ?? undefined,
        }
      : undefined;

  const contract =
    row.contract_status || row.contract_name || row.contract_tax_number
      ? {
          status: row.contract_status ?? undefined,
          name: row.contract_name ?? undefined,
          taxNumber: row.contract_tax_number ?? undefined,
        }
      : undefined;

  // Chỉ dựng statistic khi có ít nhất 1 giá trị: nếu không, UI sẽ hiển thị
  // "0đ" cho creator chưa refresh profile, trông như số thật mà lại là số bịa.
  const statistic =
    row.cash_total !== null || row.cash_remaining !== null || row.withdraw_total !== null
      ? {
          cashTotal: row.cash_total ?? undefined,
          cashRemaining: row.cash_remaining ?? undefined,
          withdrawTotal: row.withdraw_total ?? undefined,
        }
      : undefined;

  return {
    _id: row.creator_id,
    email: row.email ?? undefined,
    emailVerified: row.email_verified ?? undefined,
    phone: row.phone ? { full: row.phone, verified: row.phone_verified ?? undefined } : undefined,
    tiktok: row.tiktok_username ? { username: row.tiktok_username } : undefined,
    info,
    contract,
    hashtag: row.hashtag ?? undefined,
    accountType: row.account_type ?? undefined,
    banned: row.banned ?? undefined,
    bannedReason: row.banned_reason ?? undefined,
    statistic,
    lastActivatedAt: row.last_activated_at ?? undefined,
  };
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

// Postgres báo "canceling statement due to statement timeout" (code 57014)
// khi query vượt statement_timeout của role authenticator (mặc định Supabase
// đặt 8s). Thường chỉ xảy ra lúc instance đang bận đột xuất (sync buổi sáng
// chạy UPDATE lớn, nhiều người mở cùng lúc...) - thử lại 1 lần gần như luôn
// thành công vì lần chạy đầu đã kéo dữ liệu vào page cache của Postgres.
function isStatementTimeout(error: { code?: string; message?: string }): boolean {
  return error.code === "57014" || (error.message ?? "").includes("statement timeout");
}

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
  const run = () =>
    supabase.rpc("videos_latest_in_range_json", {
      from_at: fromAt,
      to_at: toAt,
      p_event_id: options.eventId ?? null,
    });

  let { data, error } = await run();
  if (error && isStatementTimeout(error)) {
    ({ data, error } = await run());
  }
  if (error) throw error;

  return ((data ?? []) as VideoRow[]).map(videoRowToContentItem);
}

export type CreatorIdsInRangeFilters = {
  source?: string;
  eventName?: string;
  tagName?: string;
  workplaceUnit?: string;
};

// Danh sách creator_id duy nhất đã đăng video trong khoảng ngày - dùng cho khối
// so sánh "creator mới/quay lại" ở /creators (kỳ 30 ngày trước kỳ đang xem).
// Nhẹ hơn nhiều so với fetchLatestVideosByPublishedRange: SQL function
// (videos_creator_ids_in_range_json, xem supabase-schema.sql) SELECT DISTINCT
// creator_id ngay trong DB, trả về vài trăm dòng thay vì hàng chục nghìn dòng
// video đầy đủ - kỳ so sánh chỉ cần đúng 1 trường này, không cần title/tags/
// thống kê của từng video.
export async function fetchCreatorIdsInRange(
  fromDate: string,
  toDate: string,
  filters: CreatorIdsInRangeFilters = {}
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const fromAt = vnDayStartToUtcIso(fromDate);
  const toAt = vnDayEndToUtcIso(toDate);

  const run = () =>
    supabase.rpc("videos_creator_ids_in_range_json", {
      from_at: fromAt,
      to_at: toAt,
      p_source: filters.source ?? null,
      p_event_name: filters.eventName ?? null,
      p_tag_name: filters.tagName ?? null,
      p_workplace_unit: filters.workplaceUnit ?? null,
    });

  let { data, error } = await run();
  if (error && isStatementTimeout(error)) {
    ({ data, error } = await run());
  }
  if (error) throw error;

  return (data ?? []) as string[];
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

// Danh sách event cho dropdown (Campaign Lifecycle, Top creator theo
// campaign) - SELECT DISTINCT chạy thẳng trong SQL function
// (videos_distinct_events_json, xem supabase-schema.sql) thay vì kéo mọi dòng
// video có event_id trong cửa sổ (hàng chục nghìn dòng, PostgREST qua
// supabase-js không hỗ trợ SELECT DISTINCT) về Node rồi dedupe ở JS - cách cũ
// hay dính statement timeout ở cửa sổ 90 ngày (xem fetchAllRows/fetchAllCreatorRows
// cho pattern phân trang vẫn còn dùng ở nơi khác).
export async function fetchDistinctEvents(sinceDate: string): Promise<EventOption[]> {
  const supabase = getSupabaseAdmin();
  const fromAt = vnDayStartToUtcIso(sinceDate);

  const run = () => supabase.rpc("videos_distinct_events_json", { from_at: fromAt });
  let { data, error } = await run();
  if (error && isStatementTimeout(error)) {
    ({ data, error } = await run());
  }
  if (error) throw error;

  return (data ?? []) as EventOption[];
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

// Mỗi lần gọi videos_retention_cleanup chỉ xoá tối đa chừng này dòng để không
// dính statement timeout của PostgREST - lặp đến khi DB báo hết dòng cần xoá.
const RETENTION_DELETE_BATCH = 20000;

// Dọn lịch sử snapshot cũ trong bảng videos (gọi cuối mỗi lần sync): giữ
// snapshot theo NGÀY trong 14 ngày gần nhất, xa hơn chỉ giữ 1 snapshot/tuần
// cho mỗi video; dòng is_latest=true không bao giờ bị xoá. Chính sách nằm
// trong SQL function videos_retention_cleanup (xem supabase-schema.sql).
// Trả về tổng số dòng đã xoá.
export async function cleanupOldSnapshots(): Promise<number> {
  const supabase = getSupabaseAdmin();
  let total = 0;

  while (true) {
    const { data, error } = await supabase.rpc("videos_retention_cleanup", {
      keep_daily_days: 14,
      max_delete: RETENTION_DELETE_BATCH,
    });
    if (error) throw error;
    const deleted = Number(data ?? 0);
    total += deleted;
    if (deleted < RETENTION_DELETE_BATCH) break;
  }

  return total;
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

// Toàn bộ tổng hợp (velocity, week-over-week, daily totals) chạy trong SQL
// function videos_trends_json (xem supabase-schema.sql) - app chỉ nhận về jsonb
// đã gọn (top 20 velocity + 2 dòng tuần + 1 dòng/ngày) thay vì kéo mọi dòng có
// snapshot trong cửa sổ (74k+ dòng, tăng dần theo lần sync) về Node rồi mới tính.
export async function computeTrends(windowDays = 14): Promise<TrendsResult> {
  const supabase = getSupabaseAdmin();
  const fromDate = vnDaysAgo(windowDays - 1);

  const run = () => supabase.rpc("videos_trends_json", { from_date: fromDate });
  let { data, error } = await run();
  if (error && isStatementTimeout(error)) {
    ({ data, error } = await run());
  }
  if (error) throw error;

  const result = (data ?? {}) as {
    velocity?: VelocityItem[];
    thisWeek?: PeriodMetrics;
    lastWeek?: PeriodMetrics;
    dailyTotals?: { date: string; views: number; videos: number }[];
  };

  const emptyPeriod = (from: string, to: string): PeriodMetrics => ({
    from,
    to,
    videos: 0,
    views: 0,
    likes: 0,
    comments: 0,
    creators: 0,
    avgViewsPerVideo: 0,
  });

  return {
    windowDays,
    velocity: result.velocity ?? [],
    weekOverWeek: {
      thisWeek: result.thisWeek ?? emptyPeriod(fromDate, fromDate),
      lastWeek: result.lastWeek ?? emptyPeriod(fromDate, fromDate),
    },
    dailyTotals: result.dailyTotals ?? [],
  };
}

// ---------------------------------------------------------------------------
// /trends (Signals): phát hiện video/creator nghi buff view - xem
// supabase-migration-anomaly.sql cho toàn bộ logic tính điểm (chạy trong SQL,
// app chỉ nhận về danh sách đã lọc + chấm điểm).
// ---------------------------------------------------------------------------

export type AnomalyReason =
  | "velocity_spike"
  | "late_spike"
  | "engagement_mismatch"
  | "negative_views"
  | "creator_cluster";

export type AnomalyVideoItem = {
  contentId: string;
  title: string;
  link: string;
  source: string;
  creatorId: string | null;
  creatorName: string;
  eventName: string | null;
  snapshotDate: string;
  views: number;
  deltaViews: number;
  deltaHours: number;
  score: number;
  reasons: AnomalyReason[];
};

export type AnomalyCreatorItem = {
  creatorId: string;
  creatorName: string;
  snapshotDate: string;
  flaggedVideoCount: number;
  maxScore: number;
};

export type AnomalyResult = {
  windowDays: number;
  videos: AnomalyVideoItem[];
  creators: AnomalyCreatorItem[];
};

// Đọc kết quả videos_anomaly_json() đã TÍNH TRƯỚC (bảng anomaly_cache, ghi bởi
// refresh_anomaly_cache() ngay sau mỗi lần sync - xem scripts/sync.ts) thay vì
// gọi RPC tính real-time mỗi lần load trang. Lý do: videos_anomaly_json() dù đã
// tối ưu (materialized CTE + baseline mean/stddev) vẫn phải quét ~100% dòng
// snapshot trong cửa sổ (đúng bản chất bài toán "so mọi video với baseline") -
// đo được ~25-30s trên instance hiện tại, vượt xa statement_timeout 8s của
// PostgREST. Gọi thẳng RPC ở đây sẽ lặp lại đúng lỗi timeout từng gặp ở
// /trends. windowDays mặc định 14 - đúng bằng cửa sổ giữ snapshot NGÀY của
// videos_retention_cleanup (xa hơn co về 1 snapshot/tuần nên baseline theo
// tuổi video không còn đáng tin).
export async function computeAnomalies(windowDays = 14): Promise<AnomalyResult> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("anomaly_cache")
    .select("window_days, data")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;

  // Chưa từng refresh (mới deploy/chưa chạy sync lần nào có bước refresh) -
  // trả rỗng thay vì lỗi, để AnomalyTable hiển thị thông báo "chưa đủ dữ liệu"
  // sẵn có thay vì banner lỗi đỏ.
  if (!data) {
    return { windowDays, videos: [], creators: [] };
  }

  const result = (data.data ?? {}) as {
    videos?: AnomalyVideoItem[];
    creators?: AnomalyCreatorItem[];
  };

  return {
    windowDays: data.window_days ?? windowDays,
    videos: result.videos ?? [],
    creators: result.creators ?? [],
  };
}

// ---------------------------------------------------------------------------
// /creators: cohort giữ chân + funnel kích hoạt (bài #1 -> #2 -> #3)
// ---------------------------------------------------------------------------

export type CreatorRetentionCohort = {
  cohortMonth: string;
  cohortSize: number;
  retention: { monthOffset: number; activeCreators: number; retentionPct: number }[];
};

export type CreatorActivationFunnel = {
  totalCreators: number;
  reachedPost2: number;
  reachedPost3: number;
  medianDaysToPost2: number | null;
  medianDaysToPost3: number | null;
};

export type CreatorLifecycleResult = {
  cohorts: CreatorRetentionCohort[];
  funnel: CreatorActivationFunnel;
};

const EMPTY_FUNNEL: CreatorActivationFunnel = {
  totalCreators: 0,
  reachedPost2: 0,
  reachedPost3: 0,
  medianDaysToPost2: null,
  medianDaysToPost3: null,
};

// Toàn bộ tính toán (cohort + funnel) chạy trong SQL function creator_lifecycle_json (xem
// supabase-migration-creator-lifecycle.sql) - cần TOÀN BỘ lịch sử published_at của mọi creator
// (không giới hạn theo date range), kéo về Node sẽ phải tải mọi dòng is_latest=true của bảng
// videos thay vì 1 object jsonb đã tổng hợp gọn.
export async function computeCreatorLifecycle(): Promise<CreatorLifecycleResult> {
  const supabase = getSupabaseAdmin();

  const run = () => supabase.rpc("creator_lifecycle_json");
  let { data, error } = await run();
  if (error && isStatementTimeout(error)) {
    ({ data, error } = await run());
  }
  if (error) throw error;

  const result = (data ?? {}) as { cohorts?: CreatorRetentionCohort[]; funnel?: CreatorActivationFunnel };
  return {
    cohorts: result.cohorts ?? [],
    funnel: result.funnel ?? EMPTY_FUNNEL,
  };
}
