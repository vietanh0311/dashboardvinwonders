// Truy vấn/ghi Supabase - server-only (import getSupabaseAdmin, dùng SERVICE
// ROLE KEY). Dùng bởi app/api/sync/route.ts (ghi) và app/api/data/**/route.ts
// (đọc). Không import file này từ component "use client".

import {
  vnDayEndToUtcIso,
  vnDayStartToUtcIso,
  vnDaysAgo,
  vnToday,
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
};

export type CreatorRow = {
  creator_id: string;
  name: string | null;
  hashtag: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  tiktok_username: string | null;
  contract_status: string | null;
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
      name: row.creator_name ?? "—",
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
    phone: row.phone ? { full: row.phone } : undefined,
    tiktok: row.tiktok_username ? { username: row.tiktok_username } : undefined,
    info: row.city ? { cityName: row.city } : undefined,
    contract: row.contract_status ? { status: row.contract_status } : undefined,
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

  let query = supabase
    .from("videos")
    .select("*")
    .gte("published_at", fromAt)
    .lte("published_at", toAt)
    .order("snapshot_date", { ascending: true });

  if (options.eventId) {
    query = query.eq("event_id", options.eventId);
  }

  const { data, error } = await query;

  if (error) throw error;
  const rows = (data ?? []) as VideoRow[];
  return dedupeLatestPerContent(rows).map(videoRowToContentItem);
}

export async function fetchAllCreatorRows(): Promise<CreatorRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("creators").select("*");
  if (error) throw error;
  return (data ?? []) as CreatorRow[];
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

export async function upsertVideoRows(rows: VideoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  const chunks = chunkArray(rows, 300);
  for (const chunk of chunks) {
    const { error } = await supabase.from("videos").upsert(chunk, { onConflict: "content_id,snapshot_date" });
    if (error) throw error;
  }
}

export async function upsertCreatorRows(rows: CreatorRow[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  const chunks = chunkArray(rows, 300);
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

  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .gte("snapshot_date", fromDate)
    .order("snapshot_date", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as VideoRow[];

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
      creatorName: last.creator_name ?? "—",
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

  const thisWeekFrom = vnDaysAgo(6);
  const thisWeekTo = vnToday();
  const lastWeekFrom = vnDaysAgo(13);
  const lastWeekTo = vnDaysAgo(7);

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
