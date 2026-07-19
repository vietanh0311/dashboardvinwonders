// Data layer cho VCreators Dashboard.
// Mọi request đi qua proxy nội bộ `/api/vc/*` (xem app/api/vc/[...path]/route.ts),
// route này forward header x-vc-token -> Authorization: Bearer <token> tới
// VC Creator Admin API thật (https://vcreator-admin-api.koc.com.vn).

import {
  CAMPAIGN_RULES,
  ENGAGEMENT_CHECK_MIN_VIEWS,
  THREADS_DISCUSSION_MIN_COMMENT_RATIO,
  THREADS_MIN_VIEWS,
  VIDEO_COMMENT_RATIO_TIERS,
  VIDEO_ENGAGEMENT_MIN_RATE,
  matchCampaignRule,
} from "./campaignRules";

export const VINWONDERS_PARTNER_ID = "666ab5ff0f483318c0128230";

export type DateRangeValue = {
  from: string; // yyyy-MM-dd (lịch VN)
  to: string; // yyyy-MM-dd (lịch VN)
};

// ---------------------------------------------------------------------------
// Types khớp với cấu trúc dữ liệu thật của VC Creator Admin API
// ---------------------------------------------------------------------------

export type ContentSource = "tiktok" | "facebook_reels" | "instagram_reels" | "threads" | "youtube_shorts";

export type StatisticBucket = {
  total: number;
  [key: string]: number;
};

export type ContentItem = {
  _id: string;
  title: string;
  link: string;
  cover: string;
  desc: string;
  status: string;
  source: ContentSource;
  publishedAt: string;
  createdAt: string;
  event: { _id: string; name: string } | null;
  partner: { _id: string; name: string } | null;
  createdBy: {
    _id: string;
    name: string;
    workplaceBrandName?: string;
    workplaceUnitName?: string;
    hashtag?: string;
  };
  warningTags: { _id: string; name: string }[];
  // Username kênh đã resolve sẵn phía server (sync lưu vào videos.channel_username).
  // Chỉ có ở item đọc từ Supabase - item từ API live không có, phải tự resolve.
  // Nhờ trường này mà trình duyệt không cần gọi /api/resolve-link nữa.
  channelUsername?: string | null;
  statistic: {
    view: StatisticBucket;
    like: StatisticBucket;
    comment: StatisticBucket;
    point: StatisticBucket;
    cash: StatisticBucket;
  };
};

export type EventItem = {
  _id: string;
  name: string;
};

export type TagItem = {
  _id: string;
  name: string;
  type?: string;
  color?: string;
};

export type UserPhone = {
  countryCode?: string;
  number?: string;
  full?: string;
  verified?: boolean;
};

export type UserTiktok = {
  id?: string;
  name?: string;
  username?: string;
  photo?: string;
};

export type UserDetail = {
  _id: string;
  email?: string;
  emailVerified?: boolean;
  phone?: UserPhone;
  tiktok?: UserTiktok;
  info?: {
    email?: string;
    cityCode?: string;
    cityName?: string;
    gender?: string;
    birthDay?: string;
  };
  contract?: {
    status?: string;
    name?: string;
    taxNumber?: string;
  };
  hashtag?: string;
  accountType?: string;
  isVerified?: boolean;
  banned?: boolean;
  bannedReason?: string;
  lastActivatedAt?: string;
  statistic?: {
    cashTotal?: number;
    cashRemaining?: number;
    withdrawTotal?: number;
    [key: string]: number | undefined;
  };
};

type ContentsResponse = {
  code?: number;
  data: {
    data: ContentItem[];
    total: number;
  };
};

type EventsResponse = {
  data: {
    data: EventItem[];
  };
};

type TagsResponse = {
  data: {
    tag: TagItem[];
    total: number;
  };
};

type PartnersResponse = {
  data: {
    data: { _id: string; name: string }[];
  };
};

type UserDetailResponse = {
  data: {
    data: UserDetail;
  };
};

// ---------------------------------------------------------------------------
// Token lưu phía client (localStorage) - dùng cho TokenSettings + vcFetch
// ---------------------------------------------------------------------------

const TOKEN_STORAGE_KEY = "vc-token";

export function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function setStoredToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function clearStoredToken() {
  setStoredToken("");
}

// ---------------------------------------------------------------------------
// Decode JWT (chỉ đọc payload để hiển thị hạn dùng, không xác thực chữ ký)
// ---------------------------------------------------------------------------

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  if (typeof window === "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.trim().split(".");
    if (parts.length < 2) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

export function getTokenExpiry(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") return null;
  return new Date(exp * 1000);
}

// ---------------------------------------------------------------------------
// vcFetch - gọi proxy nội bộ /api/vc/* kèm header x-vc-token
// ---------------------------------------------------------------------------

function buildQuery(params?: Record<string, string | number | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export class VcApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "VcApiError";
    this.status = status;
  }
}

export async function vcFetch<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  // Proxy ưu tiên x-vc-token hơn VC_API_TOKEN của server, nên một token cũ còn
  // sót trong localStorage sẽ đè lên token server còn hạn và gây 401 vĩnh viễn.
  // Token đã hết hạn thì không gửi nữa - để server tự dùng token của nó.
  const stored = getStoredToken();
  const expiry = stored ? getTokenExpiry(stored) : null;
  const token = expiry && expiry.getTime() <= Date.now() ? "" : stored;

  let res: Response;
  try {
    res = await fetch(`/api/vc/${path}${buildQuery(params)}`, {
      headers: token ? { "x-vc-token": token } : undefined,
      cache: "no-store",
    });
  } catch {
    // fetch() ném lỗi khi mất mạng / bị chặn CORS / server không phản hồi -
    // không phải VcApiError theo status nhưng vẫn phải có message rõ ràng.
    throw new VcApiError(0, "Không kết nối được tới server (lỗi mạng). Kiểm tra kết nối rồi thử lại.");
  }

  if (!res.ok) {
    let message = res.statusText || `Lỗi ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error ?? message;
    } catch {
      // Body lỗi không phải JSON hợp lệ - giữ message mặc định, không throw ở đây.
    }
    throw new VcApiError(res.status, message);
  }

  try {
    return (await res.json()) as T;
  } catch {
    // Response 2xx nhưng body không phải JSON hợp lệ (vd server trả HTML lỗi) -
    // vẫn phải là 1 lỗi có message rõ, không để SyntaxError thô rơi ra UI.
    throw new VcApiError(res.status, "Phản hồi từ server không đúng định dạng JSON.");
  }
}

// ---------------------------------------------------------------------------
// unwrap - hàm DUY NHẤT để tách items/total từ response VC API. Không bao giờ
// truy cập res.data.data / res.data.tag / res.data.total trực tiếp ở nơi khác -
// luôn đi qua đây để tránh crash khi response thiếu field hoặc sai kiểu.
// ---------------------------------------------------------------------------

export function unwrap<T = unknown>(res: unknown): { items: T[]; total: number } {
  const r = res as { data?: { data?: unknown; tag?: unknown; total?: unknown } } | null | undefined;
  const rawItems = r?.data?.data ?? r?.data?.tag ?? [];
  const items = Array.isArray(rawItems) ? (rawItems as T[]) : [];
  const rawTotal = r?.data?.total;
  const total = typeof rawTotal === "number" && Number.isFinite(rawTotal) ? rawTotal : 0;
  return { items, total };
}

// Biến thể cho response chỉ trả về 1 object (vd GET /users/<id>), không phải
// danh sách - vẫn kiểm tra chặt để không trả về mảng/kiểu sai làm crash chỗ gọi.
export function unwrapOne<T = unknown>(res: unknown): T | null {
  const r = res as { data?: { data?: unknown } } | null | undefined;
  const value = r?.data?.data;
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Chuyển ngày lịch VN (yyyy-MM-dd) sang mốc ISO UTC cho fromAt/toAt.
// Dùng offset +07:00 tường minh để không phụ thuộc timezone máy chạy code.
// ---------------------------------------------------------------------------

const VN_OFFSET = "+07:00";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vnDayStartToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000${VN_OFFSET}`).toISOString();
}

export function vnDayEndToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999${VN_OFFSET}`).toISOString();
}

export function toVnDateKey(isoString?: string): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  return vn.toISOString().slice(0, 10);
}

// Ngày "hôm nay" / "N ngày trước" theo lịch VN, không phụ thuộc timezone máy
// đang chạy code (client có thể ở múi giờ khác) - dùng cho preset DateRangePicker
// và cho phép so khớp nhất quán với byDay (cũng tính theo lịch VN).
export function vnToday(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function vnDaysAgo(days: number): string {
  return new Date(Date.now() + VN_OFFSET_MS - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Cộng/trừ N ngày vào một ngày lịch VN (yyyy-MM-dd), trả về yyyy-MM-dd.
export function addDaysToVnDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Mã tuần ISO-8601 (vd "2026-W28") tính theo ngày lịch VN của thời điểm ISO
// truyền vào. Dùng để nhóm dữ liệu theo tuần (cadence, creator mới/quay lại).
export function toVnWeekKey(isoString?: string): string | null {
  const dateKey = toVnDateKey(isoString);
  if (!dateKey) return null;
  const target = new Date(`${dateKey}T00:00:00Z`);
  const dayNr = (target.getUTCDay() + 6) % 7; // Thứ 2 = 0 ... Chủ nhật = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // dời về thứ Năm cùng tuần
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

// Số tuần lịch (ISO) mà khoảng [fromDate, toDate] (yyyy-MM-dd, lịch VN) đi qua.
// Dùng làm mẫu số cho "cadence" (video/tuần) khi phân tier creator.
export function countVnWeeksInRange(fromDate: string, toDate: string): number {
  const weeks = new Set<string>();
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 1;

  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const key = toVnWeekKey(cursor.toISOString());
    if (key) weeks.add(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return Math.max(weeks.size, 1);
}

// ---------------------------------------------------------------------------
// Fetch danh sách content (video) theo khoảng ngày, tự phân trang limit=500
// ---------------------------------------------------------------------------

export type FetchContentsOptions = {
  event?: string;
  tag?: string;
  keyword?: string;
  partner?: string;
};

export async function fetchContentsRange(
  fromDate: string,
  toDate: string,
  options: FetchContentsOptions = {}
): Promise<ContentItem[]> {
  const fromAt = vnDayStartToUtcIso(fromDate);
  const toAt = vnDayEndToUtcIso(toDate);
  const partner = options.partner ?? VINWONDERS_PARTNER_ID;
  const limit = 500;

  const items: ContentItem[] = [];
  let page = 0;
  let total = Infinity;

  while (page * limit < total) {
    const res = await vcFetch<ContentsResponse>("contents", {
      page,
      limit,
      keyword: options.keyword,
      partner,
      event: options.event,
      tag: options.tag,
      fromAt,
      toAt,
    });

    const { items: chunk, total: totalFromRes } = unwrap<ContentItem>(res);
    // total=0 có thể là "thật sự 0 kết quả" hoặc "API không trả field total" -
    // không phân biệt được nên fallback về chunk.length để vòng lặp vẫn dừng
    // đúng thay vì treo (giữ nguyên hành vi cũ trước khi có unwrap).
    total = totalFromRes > 0 ? totalFromRes : chunk.length;
    items.push(...chunk);

    if (chunk.length === 0) break; // an toàn, tránh vòng lặp vô hạn nếu total sai lệch
    page += 1;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Filter client-side trên danh sách content đã tải (nguồn/sự kiện/tag/nhóm cơ
// sở) - áp dụng cho cả 2 data source (Supabase/Realtime) mà không cần thêm
// request nào, vì options luôn được tách trực tiếp từ dữ liệu đã có trong tay.
// ---------------------------------------------------------------------------

export const SOURCE_LABEL: Record<ContentSource, string> = {
  tiktok: "TikTok",
  facebook_reels: "FB Reels",
  instagram_reels: "IG Reels",
  threads: "Threads",
  youtube_shorts: "YT Shorts",
};

export type ContentFilters = {
  source?: ContentSource;
  eventName?: string;
  tagName?: string;
  workplaceUnit?: string;
};

export function filterContentItems(items: ContentItem[], filters: ContentFilters): ContentItem[] {
  if (!filters.source && !filters.eventName && !filters.tagName && !filters.workplaceUnit) return items;

  return items.filter((item) => {
    if (filters.source && item.source !== filters.source) return false;
    if (filters.eventName && item.event?.name !== filters.eventName) return false;
    if (filters.tagName && !(item.warningTags ?? []).some((t) => t.name === filters.tagName)) return false;
    if (filters.workplaceUnit && item.createdBy?.workplaceUnitName !== filters.workplaceUnit) return false;
    return true;
  });
}

export type ContentFilterOptions = {
  sources: ContentSource[];
  events: string[];
  tags: string[];
  units: string[];
};

// Tách option cho 4 dropdown filter từ chính danh sách content đã tải (không
// gọi thêm request) - option luôn khớp với dữ liệu thật đang hiển thị.
export function extractFilterOptions(items: ContentItem[]): ContentFilterOptions {
  const sources = new Set<ContentSource>();
  const events = new Set<string>();
  const tags = new Set<string>();
  const units = new Set<string>();

  items.forEach((item) => {
    if (item.source) sources.add(item.source);
    if (item.event?.name) events.add(item.event.name);
    (item.warningTags ?? []).forEach((t) => {
      if (t?.name) tags.add(t.name);
    });
    if (item.createdBy?.workplaceUnitName) units.add(item.createdBy.workplaceUnitName);
  });

  return {
    sources: Array.from(sources).sort(),
    events: Array.from(events).sort(),
    tags: Array.from(tags).sort(),
    units: Array.from(units).sort(),
  };
}

// ---------------------------------------------------------------------------
// Danh sách event / tag / partner cho dropdown filter
// ---------------------------------------------------------------------------

export async function fetchEvents(keyword = ""): Promise<EventItem[]> {
  const res = await vcFetch<EventsResponse>("events", { keyword, limit: 100 });
  return unwrap<EventItem>(res).items;
}

export async function fetchTags(options: { keyword?: string; partner?: string } = {}): Promise<TagItem[]> {
  const res = await vcFetch<TagsResponse>("tags", {
    keyword: options.keyword ?? "",
    limit: 100,
    partner: options.partner ?? VINWONDERS_PARTNER_ID,
  });
  // unwrap tự fallback sang res.data.tag nếu res.data.data không có - đúng
  // shape thật của endpoint /tags (nested ở "tag" chứ không phải "data").
  return unwrap<TagItem>(res).items;
}

export async function fetchPartners(keyword = ""): Promise<{ _id: string; name: string }[]> {
  const res = await vcFetch<PartnersResponse>("partners", { keyword, limit: 100, status: "active" });
  return unwrap<{ _id: string; name: string }>(res).items;
}

export async function fetchUserDetail(userId: string): Promise<UserDetail | null> {
  const res = await vcFetch<UserDetailResponse>(`users/${userId}`);
  return unwrapOne<UserDetail>(res);
}

// ---------------------------------------------------------------------------
// Chạy tối đa `limit` promise song song trên danh sách items (worker pool đơn
// giản). Dùng chung cho fetchUserProfiles (gọi /users/<id>) và resolveShortLinks
// (gọi /api/resolve-link) để tránh bắn hàng trăm request cùng lúc.
// ---------------------------------------------------------------------------

export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const runners: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    runners.push(runNext());
  }
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// fetchUserProfiles - gọi GET /users/<id> song song (tối đa 5 request cùng lúc),
// cache kết quả vào localStorage "vc-user-cache" (7 ngày) để tránh gọi lại
// hàng trăm request profile mỗi lần mở trang /creators.
// ---------------------------------------------------------------------------

const USER_CACHE_KEY = "vc-user-cache";
const USER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type UserCacheEntry = { data: UserDetail; fetchedAt: number };
type UserCacheStore = Record<string, UserCacheEntry>;

// Mirror trong bộ nhớ của USER_CACHE_KEY - tránh JSON.parse lại toàn bộ cache
// từ localStorage mỗi lần gọi readUserCache() (cache chỉ đổi qua writeUserCache
// trong cùng tab nên mirror luôn nhất quán với storage).
let userCacheMirror: UserCacheStore | null = null;

function readUserCache(): UserCacheStore {
  if (userCacheMirror) return userCacheMirror;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    userCacheMirror = raw ? (JSON.parse(raw) as UserCacheStore) : {};
  } catch {
    userCacheMirror = {};
  }
  return userCacheMirror;
}

function writeUserCache(store: UserCacheStore) {
  userCacheMirror = store;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage đầy/bị chặn - bỏ qua, lần sau sẽ gọi lại API cho id đó
  }
}

export type FetchUserProfilesOptions = {
  concurrency?: number;
  onEach?: (done: number, total: number) => void;
};

export async function fetchUserProfiles(
  userIds: string[],
  options: FetchUserProfilesOptions = {}
): Promise<Map<string, UserDetail>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const cache = readUserCache();
  const now = Date.now();
  const result = new Map<string, UserDetail>();
  const toFetch: string[] = [];

  uniqueIds.forEach((id) => {
    const entry = cache[id];
    if (entry && now - entry.fetchedAt < USER_CACHE_TTL_MS) {
      result.set(id, entry.data);
    } else {
      toFetch.push(id);
    }
  });

  const total = uniqueIds.length;
  let done = uniqueIds.length - toFetch.length;
  options.onEach?.(done, total);

  // 401/403 nghĩa là token thiếu/hết hạn/không đủ quyền - lỗi này áp dụng cho
  // MỌI request nên phải dừng cả pool và báo lên UI, thay vì nuốt im lặng từng
  // request rồi kết thúc "thành công" với 0 profile (trước đây nút Tải profile
  // fail toàn bộ mà không hiện gì).
  let authError: VcApiError | null = null;

  await runWithConcurrency(toFetch, options.concurrency ?? 5, async (id) => {
    if (authError) return; // đã xác định lỗi token - bỏ qua các id còn lại
    try {
      const profile = await fetchUserDetail(id);
      if (profile) {
        result.set(id, profile);
        cache[id] = { data: profile, fetchedAt: Date.now() };
      }
    } catch (err) {
      if (err instanceof VcApiError && (err.status === 401 || err.status === 403)) {
        authError = authError ?? err;
        return;
      }
      // Bỏ qua user lỗi (vd đã bị xoá / API trả lỗi lẻ tẻ) - không chặn các
      // request khác trong pool.
    } finally {
      done += 1;
      options.onEach?.(done, total);
    }
  });

  writeUserCache(cache);
  if (authError) throw authError;
  return result;
}

// ---------------------------------------------------------------------------
// Tách "kênh" (platform + username) từ link video, và gộp với kênh TikTok đã
// liên kết trong profile (users/<id>.tiktok.username) để phát hiện creator
// đăng ngoài kênh chính.
// ---------------------------------------------------------------------------

export type ChannelPlatform = "tiktok" | "threads" | "facebook" | "instagram" | "youtube" | "unknown";

export const CHANNEL_PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  tiktok: "TikTok",
  threads: "Threads",
  facebook: "FB",
  instagram: "IG",
  youtube: "YT",
  unknown: "?",
};

export type ExtractedChannel = {
  platform: ChannelPlatform;
  username: string | null;
  url: string;
  needsResolve: boolean; // true = link rút gọn, cần gọi /api/resolve-link để biết username
};

function platformFromHostname(hostname: string): ChannelPlatform {
  if (hostname.indexOf("tiktok.com") !== -1) return "tiktok";
  if (hostname.indexOf("threads.") !== -1) return "threads";
  if (hostname.indexOf("facebook.com") !== -1 || hostname.indexOf("fb.watch") !== -1) return "facebook";
  if (hostname.indexOf("instagram.com") !== -1) return "instagram";
  if (hostname.indexOf("youtube.com") !== -1 || hostname.indexOf("youtu.be") !== -1) return "youtube";
  return "unknown";
}

function sourceToPlatform(source?: ContentSource): ChannelPlatform {
  if (source === "tiktok") return "tiktok";
  if (source === "threads") return "threads";
  if (source === "facebook_reels") return "facebook";
  if (source === "instagram_reels") return "instagram";
  if (source === "youtube_shorts") return "youtube";
  return "unknown";
}

const USERNAME_IN_PATH_PATTERN = /@([^/?#]+)/;

// Tách username trực tiếp từ URL, không gọi mạng. Trả về needsResolve=true
// cho link rút gọn TikTok (vt.tiktok.com/vm.tiktok.com) vì username không lộ
// ra ở URL gốc - phải resolve qua /api/resolve-link (xem resolveShortLinks).
export function extractChannelSync(link: string, sourceHint?: ContentSource): ExtractedChannel {
  const fallbackPlatform = sourceToPlatform(sourceHint);

  if (!link) {
    return { platform: fallbackPlatform, username: null, url: link, needsResolve: false };
  }

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { platform: fallbackPlatform, username: null, url: link, needsResolve: false };
  }

  const hostname = url.hostname.toLowerCase();
  const detected = platformFromHostname(hostname);
  const platform = detected !== "unknown" ? detected : fallbackPlatform;

  // Link rút gọn TikTok - không có username trong URL, cần resolve server-side.
  if (platform === "tiktok" && (hostname === "vt.tiktok.com" || hostname === "vm.tiktok.com")) {
    return { platform, username: null, url: link, needsResolve: true };
  }

  // threads.com/@username/... và www.tiktok.com/@username/... - tách trực tiếp.
  if (platform === "tiktok" || platform === "threads") {
    const match = url.pathname.match(USERNAME_IN_PATH_PATTERN);
    if (match) {
      const username = match[1];
      const base = platform === "tiktok" ? "https://www.tiktok.com" : "https://www.threads.com";
      return { platform, username, url: `${base}/@${username}`, needsResolve: false };
    }
  }

  // instagram.com/@username/... (best-effort, nhiều link reel không lộ username)
  if (platform === "instagram") {
    const match = url.pathname.match(USERNAME_IN_PATH_PATTERN);
    if (match) {
      return { platform, username: match[1], url: `https://www.instagram.com/${match[1]}`, needsResolve: false };
    }
  }

  // youtube.com/@handle/shorts/... (best-effort)
  if (platform === "youtube") {
    const match = url.pathname.match(USERNAME_IN_PATH_PATTERN);
    if (match) {
      return { platform, username: match[1], url: `https://www.youtube.com/@${match[1]}`, needsResolve: false };
    }
  }

  // facebook.com/share/r/xxx và các trường hợp không tách được username -
  // hiển thị nhãn nền tảng ("FB"/"IG"...) kèm link gốc.
  return { platform, username: null, url: link, needsResolve: false };
}

// ---------------------------------------------------------------------------
// resolveShortLinks - resolve link rút gọn TikTok qua /api/resolve-link (route
// server-side, fetch redirect:"follow"), tách username từ URL cuối cùng. Cache
// vĩnh viễn theo content._id trong localStorage "vc-link-cache" (link của 1
// video không đổi kênh). Chạy tuần tự theo lô 3-5 request song song để tránh
// bị TikTok chặn khi bắn quá nhiều request cùng lúc.
// ---------------------------------------------------------------------------

const LINK_CACHE_KEY = "vc-link-cache";

type LinkCacheEntry = { username: string | null; finalUrl: string; resolvedAt: number };
type LinkCacheStore = Record<string, LinkCacheEntry>; // key = content._id

// Mirror trong bộ nhớ của LINK_CACHE_KEY. getResolvedChannel() gọi readLinkCache()
// 1 lần/video (có thể hàng nghìn lần/render ở trang /creators) - nếu không có
// mirror, mỗi lần gọi sẽ JSON.parse lại toàn bộ cache (cache "vĩnh viễn", chỉ
// tăng theo thời gian) từ localStorage, rất tốn khi cache đã lớn.
let linkCacheMirror: LinkCacheStore | null = null;

function readLinkCache(): LinkCacheStore {
  if (linkCacheMirror) return linkCacheMirror;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LINK_CACHE_KEY);
    linkCacheMirror = raw ? (JSON.parse(raw) as LinkCacheStore) : {};
  } catch {
    linkCacheMirror = {};
  }
  return linkCacheMirror;
}

function writeLinkCache(store: LinkCacheStore) {
  linkCacheMirror = store;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LINK_CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage đầy/bị chặn - bỏ qua, lần sau sẽ resolve lại
  }
}

export type ResolveShortLinksOptions = {
  concurrency?: number;
  onEach?: (done: number, total: number) => void;
};

export async function resolveShortLinks(
  items: ContentItem[],
  options: ResolveShortLinksOptions = {}
): Promise<void> {
  const cache = readLinkCache();
  const targets = items.filter((item) => !cache[item._id] && extractChannelSync(item.link, item.source).needsResolve);

  const total = targets.length;
  options.onEach?.(0, total);
  if (total === 0) return;

  let done = 0;
  await runWithConcurrency(targets, options.concurrency ?? 4, async (item) => {
    try {
      const res = await fetch(`/api/resolve-link?url=${encodeURIComponent(item.link)}`);
      const body = (await res.json()) as { finalUrl?: string | null };
      const finalUrl = body?.finalUrl ?? null;
      let username: string | null = null;
      if (finalUrl) {
        username = extractChannelSync(finalUrl, item.source).username;
      }
      cache[item._id] = { username, finalUrl: finalUrl ?? item.link, resolvedAt: Date.now() };
    } catch {
      // Resolve lỗi (mạng chặn, TikTok chặn...) - bỏ qua, video này sẽ hiện
      // "chưa xác định kênh" và có thể thử lại ở lần bấm "Tải profile" sau.
    } finally {
      done += 1;
      options.onEach?.(done, total);
    }
  });

  writeLinkCache(cache);
}

// Lấy kênh đã tách cho 1 video, ưu tiên dùng kết quả resolve đã cache (nếu là
// link rút gọn đã được resolveShortLinks xử lý trước đó).
export function getResolvedChannel(item: ContentItem): ExtractedChannel {
  const sync = extractChannelSync(item.link, item.source);
  if (!sync.needsResolve) return sync;

  // Ưu tiên username sync đã resolve sẵn ở server: có sẵn cho MỌI người xem
  // dashboard, không phụ thuộc localStorage của từng trình duyệt.
  if (item.channelUsername) {
    return {
      platform: sync.platform,
      username: item.channelUsername,
      url: `https://www.tiktok.com/@${item.channelUsername}`,
      needsResolve: false,
    };
  }

  const cache = readLinkCache();
  const cached = cache[item._id];
  if (!cached) return sync; // chưa resolve - UI hiện "chưa xác định kênh"

  return {
    platform: sync.platform,
    username: cached.username,
    url: cached.username ? `https://www.tiktok.com/@${cached.username}` : cached.finalUrl,
    needsResolve: false,
  };
}

// ---------------------------------------------------------------------------
// Tổng hợp kênh của 1 creator: kênh đã liên kết (profile.tiktok.username) gộp
// với các kênh hay đăng thực tế (tách từ link video) - phát hiện creator dùng
// kênh phụ ngoài kênh đã đăng ký.
// ---------------------------------------------------------------------------

export type CreatorChannel = {
  platform: ChannelPlatform;
  username: string | null;
  url: string;
  videos: number;
  // false = chưa tách được username kênh từ link (link rút gọn chưa resolve,
  // hoặc link video không lộ username - vd facebook.com/share/r/xxx) - "url"
  // khi đó chỉ là link của 1 video mẫu, KHÔNG phải link trang kênh, nên UI
  // không được hiển thị/click như một kênh thật.
  identified: boolean;
};

export type CreatorChannelsSummary = {
  linkedChannel: CreatorChannel | null;
  postedChannels: CreatorChannel[];
  offChannelWarning: boolean;
};

export function computeCreatorChannelsSummary(
  creatorItems: ContentItem[],
  profile: UserDetail | null | undefined
): CreatorChannelsSummary {
  const linkedUsername = profile?.tiktok?.username ?? null;

  // Gộp theo platform+username. Khi chưa tách được username (needsResolve
  // hoặc link không lộ username), gộp chung 1 dòng "chưa xác định" cho mỗi
  // platform thay vì 1 dòng/link video - trước đây key rơi về ch.url (khác
  // nhau ở mỗi video) khiến mỗi video hiện thành 1 "kênh" riêng, và link đó
  // trỏ thẳng vào video chứ không phải trang kênh.
  const channelMap = new Map<string, CreatorChannel>();
  creatorItems.forEach((item) => {
    const ch = getResolvedChannel(item);
    const identified = !!ch.username;
    const key = identified ? `${ch.platform}:${ch.username!.toLowerCase()}` : `${ch.platform}:__unidentified__`;
    const entry =
      channelMap.get(key) ?? { platform: ch.platform, username: ch.username, url: ch.url, videos: 0, identified };
    entry.videos += 1;
    channelMap.set(key, entry);
  });

  const postedChannels = Array.from(channelMap.values()).sort((a, b) => b.videos - a.videos);

  const linkedChannel: CreatorChannel | null = linkedUsername
    ? {
        platform: "tiktok",
        username: linkedUsername,
        url: `https://www.tiktok.com/@${linkedUsername}`,
        videos:
          channelMap.get(`tiktok:${linkedUsername.toLowerCase()}`)?.videos ?? 0,
        identified: true,
      }
    : null;

  const offChannelWarning =
    !!linkedChannel &&
    postedChannels.some(
      (c) => c.platform === "tiktok" && !!c.username && c.username.toLowerCase() !== linkedUsername!.toLowerCase()
    );

  return { linkedChannel, postedChannels, offChannelWarning };
}

// Số ngày kể từ 1 mốc ISO tới hiện tại (dùng cho cờ lọc "không hoạt động >30 ngày").
export function daysSince(isoString?: string): number | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// computeMetrics - tổng hợp số liệu từ danh sách content
// ---------------------------------------------------------------------------

export type DayMetric = {
  date: string; // yyyy-MM-dd theo giờ VN
  videos: number;
  views: number;
};

export type NamedMetric = {
  name: string;
  videos: number;
  views: number;
  creators: number;
};

export type ContentMetrics = {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  uniqueCreators: number;
  bySource: Partial<Record<ContentSource, number>>;
  byDay: DayMetric[];
  byEvent: NamedMetric[];
  byTag: NamedMetric[];
};

export function computeMetrics(items: ContentItem[]): ContentMetrics {
  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;

  const creators = new Set<string>();
  const bySource: Partial<Record<ContentSource, number>> = {};
  const byDayMap = new Map<string, { videos: number; views: number }>();
  const byEventMap = new Map<string, { videos: number; views: number; creators: Set<string> }>();
  const byTagMap = new Map<string, { videos: number; views: number; creators: Set<string> }>();

  for (const item of items) {
    const views = item.statistic?.view?.total ?? 0;
    const likes = item.statistic?.like?.total ?? 0;
    const comments = item.statistic?.comment?.total ?? 0;

    totalViews += views;
    totalLikes += likes;
    totalComments += comments;

    const creatorId = item.createdBy?._id;
    if (creatorId) creators.add(creatorId);

    if (item.source) {
      bySource[item.source] = (bySource[item.source] ?? 0) + 1;
    }

    const dayKey = toVnDateKey(item.publishedAt || item.createdAt);
    if (dayKey) {
      const day = byDayMap.get(dayKey) ?? { videos: 0, views: 0 };
      day.videos += 1;
      day.views += views;
      byDayMap.set(dayKey, day);
    }

    const eventName = item.event?.name;
    if (eventName) {
      const ev = byEventMap.get(eventName) ?? { videos: 0, views: 0, creators: new Set<string>() };
      ev.videos += 1;
      ev.views += views;
      if (creatorId) ev.creators.add(creatorId);
      byEventMap.set(eventName, ev);
    }

    for (const tag of item.warningTags ?? []) {
      if (!tag?.name) continue;
      const t = byTagMap.get(tag.name) ?? { videos: 0, views: 0, creators: new Set<string>() };
      t.videos += 1;
      t.views += views;
      if (creatorId) t.creators.add(creatorId);
      byTagMap.set(tag.name, t);
    }
  }

  return {
    totalVideos: items.length,
    totalViews,
    totalLikes,
    totalComments,
    uniqueCreators: creators.size,
    bySource,
    byDay: Array.from(byDayMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    byEvent: Array.from(byEventMap.entries())
      .map(([name, v]) => ({ name, videos: v.videos, views: v.views, creators: v.creators.size }))
      .sort((a, b) => b.videos - a.videos),
    byTag: Array.from(byTagMap.entries())
      .map(([name, v]) => ({ name, videos: v.videos, views: v.views, creators: v.creators.size }))
      .sort((a, b) => b.videos - a.videos),
  };
}

// ---------------------------------------------------------------------------
// computeCreatorStats - tổng hợp số liệu theo creator (createdBy._id), dùng
// cho trang /creators.
// ---------------------------------------------------------------------------

export type CreatorStat = {
  creatorId: string;
  name: string;
  workplaceUnitName?: string;
  workplaceBrandName?: string;
  videos: number;
  totalViews: number;
  avgViewsPerVideo: number;
  totalLikes: number;
  totalComments: number;
  engagementRate: number; // (likes + comments) / views
  totalCash: number;
  cpv: number; // cash / views
  maxSingleVideoViews: number;
  firstPublishedAt: string;
  lastPublishedAt: string;
  weeksActive: number; // số tuần (ISO) có ít nhất 1 video
};

export function computeCreatorStats(items: ContentItem[]): CreatorStat[] {
  type Accumulator = {
    name: string;
    workplaceUnitName?: string;
    workplaceBrandName?: string;
    videos: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalCash: number;
    maxSingleVideoViews: number;
    firstPublishedAt: string;
    lastPublishedAt: string;
    weeks: Set<string>;
  };

  const map = new Map<string, Accumulator>();

  for (const item of items) {
    const creatorId = item.createdBy?._id;
    if (!creatorId) continue;

    const views = item.statistic?.view?.total ?? 0;
    const likes = item.statistic?.like?.total ?? 0;
    const comments = item.statistic?.comment?.total ?? 0;
    const cash = item.statistic?.cash?.total ?? 0;
    const publishedAt = item.publishedAt || item.createdAt;

    const entry: Accumulator = map.get(creatorId) ?? {
      name: item.createdBy?.name ?? "-",
      workplaceUnitName: item.createdBy?.workplaceUnitName,
      workplaceBrandName: item.createdBy?.workplaceBrandName,
      videos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalCash: 0,
      maxSingleVideoViews: 0,
      firstPublishedAt: publishedAt,
      lastPublishedAt: publishedAt,
      weeks: new Set<string>(),
    };

    entry.videos += 1;
    entry.totalViews += views;
    entry.totalLikes += likes;
    entry.totalComments += comments;
    entry.totalCash += cash;
    entry.maxSingleVideoViews = Math.max(entry.maxSingleVideoViews, views);
    if (publishedAt && publishedAt < entry.firstPublishedAt) entry.firstPublishedAt = publishedAt;
    if (publishedAt && publishedAt > entry.lastPublishedAt) entry.lastPublishedAt = publishedAt;

    const weekKey = toVnWeekKey(publishedAt);
    if (weekKey) entry.weeks.add(weekKey);

    map.set(creatorId, entry);
  }

  return Array.from(map.entries()).map(([creatorId, v]) => {
    const avgViewsPerVideo = v.videos > 0 ? v.totalViews / v.videos : 0;
    const engagementRate = v.totalViews > 0 ? (v.totalLikes + v.totalComments) / v.totalViews : 0;
    const cpv = v.totalViews > 0 ? v.totalCash / v.totalViews : 0;
    return {
      creatorId,
      name: v.name,
      workplaceUnitName: v.workplaceUnitName,
      workplaceBrandName: v.workplaceBrandName,
      videos: v.videos,
      totalViews: v.totalViews,
      avgViewsPerVideo,
      totalLikes: v.totalLikes,
      totalComments: v.totalComments,
      engagementRate,
      totalCash: v.totalCash,
      cpv,
      maxSingleVideoViews: v.maxSingleVideoViews,
      firstPublishedAt: v.firstPublishedAt,
      lastPublishedAt: v.lastPublishedAt,
      weeksActive: v.weeks.size,
    };
  });
}

// ---------------------------------------------------------------------------
// Phân tier creator theo percentile avg views/video trong kỳ đang xem.
// ---------------------------------------------------------------------------

export type CreatorTier = "star" | "one_hit" | "stable" | "needs_activation" | "unclassified";

export const CREATOR_TIER_LABEL: Record<CreatorTier, string> = {
  star: "Ngôi sao",
  one_hit: "Một video ăn may",
  stable: "Ổn định",
  needs_activation: "Cần kích hoạt",
  unclassified: "Chưa phân loại",
};

export type CreatorWithTier = CreatorStat & { tier: CreatorTier };

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedAsc[lower];
  const weight = idx - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

export function classifyCreatorTiers(
  creators: CreatorStat[],
  items: ContentItem[],
  weeksInRange: number
): CreatorWithTier[] {
  if (creators.length === 0) return [];

  const avgViewsSorted = creators.map((c) => c.avgViewsPerVideo).sort((a, b) => a - b);
  const p90AvgViews = percentile(avgViewsSorted, 90);
  const medianAvgViews = percentile(avgViewsSorted, 50);

  const videoViewsSorted = items.map((it) => it.statistic?.view?.total ?? 0).sort((a, b) => a - b);
  const medianVideoViews = percentile(videoViewsSorted, 50);

  return creators.map((c) => {
    const isStar = c.avgViewsPerVideo >= p90AvgViews && c.videos >= 3;

    const restAvg = c.videos > 1 ? (c.totalViews - c.maxSingleVideoViews) / (c.videos - 1) : 0;
    const isOneHit =
      medianVideoViews > 0 &&
      c.maxSingleVideoViews > medianVideoViews * 5 &&
      (c.videos === 1 || restAvg < medianVideoViews);

    const cadence = weeksInRange > 0 ? c.videos / weeksInRange : 0;
    const isStable = cadence >= 1 && c.avgViewsPerVideo >= medianAvgViews && c.avgViewsPerVideo < p90AvgViews;

    const needsActivation = c.avgViewsPerVideo < medianAvgViews;

    let tier: CreatorTier = "unclassified";
    if (isStar) tier = "star";
    else if (isOneHit) tier = "one_hit";
    else if (isStable) tier = "stable";
    else if (needsActivation) tier = "needs_activation";

    return { ...c, tier };
  });
}

// ---------------------------------------------------------------------------
// Pareto: % creators tích lũy tạo ra % views tích lũy (sắp theo views giảm dần)
// ---------------------------------------------------------------------------

export type ParetoPoint = {
  creatorPct: number;
  viewPct: number;
};

export type ParetoResult = {
  points: ParetoPoint[];
  creatorsFor80PctViews: number;
  creatorsFor80PctViewsPct: number;
};

export function computeParetoAnalysis(creators: CreatorStat[]): ParetoResult {
  const n = creators.length;
  const total = creators.reduce((sum, c) => sum + c.totalViews, 0);
  const sorted = [...creators].sort((a, b) => b.totalViews - a.totalViews);

  const points: ParetoPoint[] = [{ creatorPct: 0, viewPct: 0 }];
  let cumulative = 0;
  let creatorsFor80 = n;
  let reached80 = false;

  sorted.forEach((c, idx) => {
    cumulative += c.totalViews;
    const viewPct = total > 0 ? (cumulative / total) * 100 : 0;
    const creatorPct = ((idx + 1) / n) * 100;
    points.push({ creatorPct, viewPct });
    if (!reached80 && viewPct >= 80) {
      creatorsFor80 = idx + 1;
      reached80 = true;
    }
  });

  return {
    points,
    creatorsFor80PctViews: creatorsFor80,
    creatorsFor80PctViewsPct: n > 0 ? (creatorsFor80 / n) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Creator mới vs quay lại theo tuần. "Mới" = lần đầu xuất hiện trong kỳ đang
// xem VÀ không xuất hiện trong previousWindowItems (thường là 30 ngày trước
// range.from) - xem thêm fetchContentsRange cho khoảng trước đó.
// ---------------------------------------------------------------------------

export type WeeklyCreatorTrend = {
  week: string;
  newCreators: number;
  returningCreators: number;
};

export function computeNewVsReturning(
  currentItems: ContentItem[],
  previousWindowItems: ContentItem[]
): WeeklyCreatorTrend[] {
  const seen = new Set<string>();
  previousWindowItems.forEach((it) => {
    if (it.createdBy?._id) seen.add(it.createdBy._id);
  });

  const byWeek = new Map<string, ContentItem[]>();
  const sortedItems = [...currentItems].sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));

  sortedItems.forEach((it) => {
    const week = toVnWeekKey(it.publishedAt || it.createdAt);
    if (!week) return;
    const arr = byWeek.get(week) ?? [];
    arr.push(it);
    byWeek.set(week, arr);
  });

  const weeks = Array.from(byWeek.keys()).sort();
  const results: WeeklyCreatorTrend[] = [];

  weeks.forEach((week) => {
    const itemsInWeek = byWeek.get(week) ?? [];
    let newCount = 0;
    let returningCount = 0;
    const creatorsThisWeek = new Set<string>();

    itemsInWeek.forEach((it) => {
      const id = it.createdBy?._id;
      if (!id || creatorsThisWeek.has(id)) return;
      creatorsThisWeek.add(id);
      if (seen.has(id)) {
        returningCount += 1;
      } else {
        newCount += 1;
      }
    });

    creatorsThisWeek.forEach((id) => seen.add(id));
    results.push({ week, newCreators: newCount, returningCreators: returningCount });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Phân bổ creator theo tier: bao nhiêu creator/% views mỗi tier, và trong đó
// bao nhiêu % đã hoạt động ở kỳ 30 ngày trước (previousWindowItems) - đo mức
// độ giữ chân theo từng nhóm thay vì chỉ 1 số tổng như NewReturningChart.
// ---------------------------------------------------------------------------

export type TierBreakdownRow = {
  tier: CreatorTier;
  label: string;
  creators: number;
  creatorsPct: number;
  totalViews: number;
  viewsPct: number;
  avgViewsPerVideo: number;
  returningCreators: number;
  retentionPct: number;
};

const TIER_ORDER: CreatorTier[] = ["star", "stable", "one_hit", "needs_activation", "unclassified"];

export function computeTierBreakdown(
  creators: CreatorWithTier[],
  previousWindowItems: ContentItem[]
): TierBreakdownRow[] {
  const seenBefore = new Set<string>();
  previousWindowItems.forEach((it) => {
    if (it.createdBy?._id) seenBefore.add(it.createdBy._id);
  });

  const totalCreators = creators.length;
  const totalViews = creators.reduce((sum, c) => sum + c.totalViews, 0);

  return TIER_ORDER.map((tier) => {
    const inTier = creators.filter((c) => c.tier === tier);
    const tierViews = inTier.reduce((sum, c) => sum + c.totalViews, 0);
    const tierVideos = inTier.reduce((sum, c) => sum + c.videos, 0);
    const returningCreators = inTier.filter((c) => seenBefore.has(c.creatorId)).length;

    return {
      tier,
      label: CREATOR_TIER_LABEL[tier],
      creators: inTier.length,
      creatorsPct: totalCreators > 0 ? (inTier.length / totalCreators) * 100 : 0,
      totalViews: tierViews,
      viewsPct: totalViews > 0 ? (tierViews / totalViews) * 100 : 0,
      avgViewsPerVideo: tierVideos > 0 ? tierViews / tierVideos : 0,
      returningCreators,
      retentionPct: inTier.length > 0 ? (returningCreators / inTier.length) * 100 : 0,
    };
  }).filter((row) => row.creators > 0);
}

// ---------------------------------------------------------------------------
// So sánh hiệu quả giữa các nhóm cơ sở (workplaceUnitName): views TB/video,
// CPV (chi phí/view) - phát hiện cơ sở nào đang làm tốt/kém hơn hẳn.
// ---------------------------------------------------------------------------

export type UnitComparisonRow = {
  unitName: string;
  creators: number;
  videos: number;
  totalViews: number;
  avgViewsPerVideo: number;
  totalCash: number;
  cpv: number;
};

export function computeUnitComparison(creators: CreatorStat[]): UnitComparisonRow[] {
  const byUnit = new Map<
    string,
    { creators: number; videos: number; totalViews: number; totalCash: number }
  >();

  creators.forEach((c) => {
    const key = c.workplaceUnitName || "Không rõ";
    const entry = byUnit.get(key) ?? { creators: 0, videos: 0, totalViews: 0, totalCash: 0 };
    entry.creators += 1;
    entry.videos += c.videos;
    entry.totalViews += c.totalViews;
    entry.totalCash += c.totalCash;
    byUnit.set(key, entry);
  });

  return Array.from(byUnit.entries())
    .map(([unitName, v]) => ({
      unitName,
      creators: v.creators,
      videos: v.videos,
      totalViews: v.totalViews,
      avgViewsPerVideo: v.videos > 0 ? v.totalViews / v.videos : 0,
      totalCash: v.totalCash,
      cpv: v.totalViews > 0 ? v.totalCash / v.totalViews : 0,
    }))
    .sort((a, b) => b.totalViews - a.totalViews);
}

// ---------------------------------------------------------------------------
// Xếp hạng creator theo CPV (chi phí/view) - ai đang chi hiệu quả nhất/kém
// nhất. Chỉ xét creator có cash & đủ views để tránh nhiễu do mẫu quá nhỏ.
// ---------------------------------------------------------------------------

const CPV_RANKING_MIN_VIEWS = 500;

export type CpvRanking = {
  mostEfficient: CreatorWithTier[];
  leastEfficient: CreatorWithTier[];
};

export function computeCpvRanking(creators: CreatorWithTier[], limit = 5): CpvRanking {
  const eligible = creators.filter((c) => c.totalCash > 0 && c.totalViews >= CPV_RANKING_MIN_VIEWS);
  const sorted = [...eligible].sort((a, b) => a.cpv - b.cpv);

  return {
    mostEfficient: sorted.slice(0, limit),
    leastEfficient: sorted.slice(-limit).reverse(),
  };
}

// ---------------------------------------------------------------------------
// Insight tự động (rule-based) cho trang /creators.
// ---------------------------------------------------------------------------

export function generateCreatorInsights(
  creators: CreatorWithTier[],
  pareto: ParetoResult,
  weeklyTrend: WeeklyCreatorTrend[],
  rangeTo: string
): string[] {
  const insights: string[] = [];
  const totalViews = creators.reduce((sum, c) => sum + c.totalViews, 0);

  // 1. Rủi ro phụ thuộc: top 10% creator (theo views) chiếm > 70% views.
  if (creators.length > 0 && totalViews > 0) {
    const sortedByViews = [...creators].sort((a, b) => b.totalViews - a.totalViews);
    const top10Count = Math.max(1, Math.round(creators.length * 0.1));
    const top10Views = sortedByViews.slice(0, top10Count).reduce((sum, c) => sum + c.totalViews, 0);
    const top10Pct = (top10Views / totalViews) * 100;
    if (top10Pct > 70) {
      insights.push(
        `${formatPercent(top10Pct)} views đến từ ${formatNumber(top10Count)} creator (top 10%) - rủi ro phụ thuộc.`
      );
    }
  }

  // 2. Creator tier Ngôi sao không đăng video 7 ngày qua (tính tới cuối kỳ đang xem).
  const cutoff = addDaysToVnDate(rangeTo, -7);
  const inactiveStars = creators.filter((c) => {
    if (c.tier !== "star") return false;
    const lastDay = toVnDateKey(c.lastPublishedAt);
    return lastDay !== null && lastDay < cutoff;
  });
  if (inactiveStars.length > 0) {
    insights.push(
      `${formatNumber(inactiveStars.length)} creator tier Ngôi sao không đăng video trong 7 ngày qua - cần re-engage.`
    );
  }

  // 3. Nhóm cơ sở (workplaceUnitName) có avg views/video cao nhất.
  const byUnit = new Map<string, { totalViews: number; videos: number }>();
  creators.forEach((c) => {
    const key = c.workplaceUnitName || "Không rõ";
    const entry = byUnit.get(key) ?? { totalViews: 0, videos: 0 };
    entry.totalViews += c.totalViews;
    entry.videos += c.videos;
    byUnit.set(key, entry);
  });
  let bestUnit: { name: string; avg: number } | null = null;
  byUnit.forEach((v, name) => {
    if (v.videos === 0) return;
    const avg = v.totalViews / v.videos;
    if (!bestUnit || avg > bestUnit.avg) bestUnit = { name, avg };
  });
  if (bestUnit && byUnit.size > 1) {
    const b = bestUnit as { name: string; avg: number };
    insights.push(
      `Nhóm cơ sở "${b.name}" có views trung bình/video cao nhất (${formatNumber(b.avg)}) - cân nhắc nhân rộng.`
    );
  }

  // 4. Pareto: bao nhiêu % creator tạo ra 80% views.
  if (creators.length > 0) {
    insights.push(
      `${formatNumber(pareto.creatorsFor80PctViews)} creator (${formatPercent(
        pareto.creatorsFor80PctViewsPct
      )}) tạo ra 80% tổng views trong kỳ.`
    );
  }

  // 5. Xu hướng creator mới/quay lại tuần gần nhất.
  const lastWeek = weeklyTrend[weeklyTrend.length - 1];
  if (lastWeek) {
    insights.push(
      `Tuần gần nhất (${lastWeek.week}) có ${formatNumber(lastWeek.newCreators)} creator mới và ${formatNumber(
        lastWeek.returningCreators
      )} creator quay lại.`
    );
  }

  return insights.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Phân phối views của video (histogram, median/mean, flop/viral) - /campaigns
// ---------------------------------------------------------------------------

const FLOP_VIEWS_THRESHOLD = 200;
const VIRAL_MEDIAN_MULTIPLIER = 10;

const VIEW_HISTOGRAM_EDGES = [0, 100, 500, 1000, 5000, 10000, 50000, 100000, Infinity];

function formatShortNumber(n: number): string {
  if (n === Infinity) return "∞";
  if (n >= 1000) return `${n / 1000}k`;
  return `${n}`;
}

export type ViewHistogramBucket = {
  bucket: string;
  count: number;
};

export type ViewDistribution = {
  median: number;
  mean: number;
  flopCount: number;
  flopPct: number;
  viralCount: number;
  viralPct: number;
  histogram: ViewHistogramBucket[];
};

export function computeViewDistribution(items: ContentItem[]): ViewDistribution {
  const views = items.map((it) => it.statistic?.view?.total ?? 0);
  const n = views.length;

  if (n === 0) {
    return { median: 0, mean: 0, flopCount: 0, flopPct: 0, viralCount: 0, viralPct: 0, histogram: [] };
  }

  const sorted = [...views].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const mean = views.reduce((sum, v) => sum + v, 0) / n;

  const flopCount = views.filter((v) => v < FLOP_VIEWS_THRESHOLD).length;
  const viralThreshold = median * VIRAL_MEDIAN_MULTIPLIER;
  const viralCount = median > 0 ? views.filter((v) => v > viralThreshold).length : 0;

  const buckets = VIEW_HISTOGRAM_EDGES.slice(0, -1).map((edge, i) => {
    const next = VIEW_HISTOGRAM_EDGES[i + 1];
    const label = next === Infinity ? `>${formatShortNumber(edge)}` : `${formatShortNumber(edge)}-${formatShortNumber(next)}`;
    return { min: edge, max: next, bucket: label, count: 0 };
  });
  views.forEach((v) => {
    const b = buckets.find((bucket) => v >= bucket.min && v < bucket.max);
    if (b) b.count += 1;
  });

  return {
    median,
    mean,
    flopCount,
    flopPct: (flopCount / n) * 100,
    viralCount,
    viralPct: (viralCount / n) * 100,
    histogram: buckets.map(({ bucket, count }) => ({ bucket, count })),
  };
}

// ---------------------------------------------------------------------------
// Heatmap giờ đăng (0-23h, giờ VN) x thứ trong tuần (Thứ 2 - Chủ nhật)
// ---------------------------------------------------------------------------

export const WEEKDAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

// Số video tối thiểu trong 1 ô (ngày x giờ) để được tính vào "khung giờ vàng" - dưới ngưỡng
// này, 1 video ăn may/viral đơn lẻ cũng đủ khiến ô đó trông như tốt nhất dù không có ý nghĩa
// thống kê. Dùng chung cho cả heatmap gộp và heatmap tách theo nền tảng.
export const HEATMAP_MIN_SAMPLE = 3;

export type HeatmapCell = {
  dayOfWeek: number; // 0 = Thứ 2 ... 6 = Chủ nhật
  hour: number; // 0-23 (giờ VN)
  videos: number;
  totalViews: number;
  avgViews: number;
  // Số video theo từng nền tảng rơi vào đúng ô này - chỉ có ý nghĩa ở heatmap gộp (nhiều nền
  // tảng); dùng để chú thích ô "khung giờ vàng" gộp thực ra đang bị kéo bởi nền tảng nào (xem
  // dominantHeatmapSource()).
  bySource?: Partial<Record<ContentSource, number>>;
};

export function computePublishHeatmap(items: ContentItem[]): HeatmapCell[] {
  const cells = new Map<string, { videos: number; totalViews: number; bySource: Map<ContentSource, number> }>();

  items.forEach((item) => {
    const iso = item.publishedAt || item.createdAt;
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const vn = new Date(d.getTime() + VN_OFFSET_MS);
    const jsDay = vn.getUTCDay(); // 0 = Chủ nhật ... 6 = Thứ 7 (giờ VN, đã dịch offset)
    const dayOfWeek = (jsDay + 6) % 7; // đổi sang 0 = Thứ 2 ... 6 = Chủ nhật
    const hour = vn.getUTCHours();
    const views = item.statistic?.view?.total ?? 0;

    const key = `${dayOfWeek}-${hour}`;
    const entry = cells.get(key) ?? { videos: 0, totalViews: 0, bySource: new Map<ContentSource, number>() };
    entry.videos += 1;
    entry.totalViews += views;
    if (item.source) entry.bySource.set(item.source, (entry.bySource.get(item.source) ?? 0) + 1);
    cells.set(key, entry);
  });

  const result: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const entry = cells.get(`${day}-${hour}`);
      result.push({
        dayOfWeek: day,
        hour,
        videos: entry?.videos ?? 0,
        totalViews: entry?.totalViews ?? 0,
        avgViews: entry && entry.videos > 0 ? entry.totalViews / entry.videos : 0,
        bySource:
          entry && entry.bySource.size > 0
            ? (Object.fromEntries(entry.bySource) as Partial<Record<ContentSource, number>>)
            : undefined,
      });
    }
  }
  return result;
}

// Chọn ô "khung giờ vàng" tốt nhất trong 1 lưới heatmap - bỏ qua ô có quá ít video (xem
// HEATMAP_MIN_SAMPLE) để tránh gợi ý sai chỉ vì 1 video ăn may.
export function pickBestHeatmapCell(cells: HeatmapCell[], minSample: number = HEATMAP_MIN_SAMPLE): HeatmapCell | null {
  // avgViews > 0 loại luôn trường hợp 1 nền tảng chưa có view nào ghi nhận (vd sự cố sync) -
  // nếu không, ô đầu tiên đủ mẫu sẽ "thắng" một cách tuỳ tiện dù mọi ô đều hoà 0, trông như 1
  // khung giờ vàng thật trong khi thực chất không có tín hiệu gì.
  const meaningful = cells.filter((c) => c.videos >= minSample && c.avgViews > 0);
  if (meaningful.length === 0) return null;
  return [...meaningful].sort((a, b) => b.avgViews - a.avgViews)[0];
}

// Nền tảng chiếm đa số (>50% video) trong 1 ô heatmap gộp - dùng để chú thích "khung giờ vàng"
// gộp thực ra chủ yếu đến từ nền tảng nào, tránh hiểu nhầm đây là khung giờ chung cho mọi nền
// tảng. Trả về null nếu video rải đều, không có nền tảng nào chiếm đa số.
export function dominantHeatmapSource(cell: HeatmapCell | null | undefined): ContentSource | null {
  if (!cell?.bySource || cell.videos === 0) return null;
  const entries = Object.entries(cell.bySource) as [ContentSource, number][];
  if (entries.length === 0) return null;
  const [topSource, topCount] = entries.sort((a, b) => b[1] - a[1])[0];
  return topCount / cell.videos > 0.5 ? topSource : null;
}

export type SourceHeatmap = {
  source: ContentSource;
  totalVideos: number;
  cells: HeatmapCell[];
  best: HeatmapCell | null;
};

// Heatmap gộp (computePublishHeatmap) dồn mọi nền tảng vào chung 1 lưới nên "khung giờ vàng"
// dễ bị lệch theo nền tảng chiếm nhiều video nhất (thường TikTok) - mỗi nền tảng có tệp người
// xem/thuật toán phân phối nội dung khác nhau nên khung giờ tốt thực sự khác nhau, không chỉ do
// nhiễu thống kê. Hàm này tách riêng heatmap cho từng nền tảng để PublishHeatmap đưa ra khuyến
// nghị đúng cho từng nhóm creator theo nền tảng họ đăng (kết hợp với campaign đang lọc ở
// ContentFilters, vì items truyền vào đây đã được filterContentItems() lọc theo eventName).
export function computePublishHeatmapBySource(items: ContentItem[]): SourceHeatmap[] {
  const bySource = new Map<ContentSource, ContentItem[]>();
  items.forEach((item) => {
    if (!item.source) return;
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  });

  return Array.from(bySource.entries())
    .map(([source, list]) => {
      const cells = computePublishHeatmap(list);
      return { source, totalVideos: list.length, cells, best: pickBestHeatmapCell(cells) };
    })
    .sort((a, b) => b.totalVideos - a.totalVideos);
}

// ---------------------------------------------------------------------------
// So sánh nền tảng (source): % video, % views, avg views, engagement rate.
// ---------------------------------------------------------------------------

export type SourceComparison = {
  source: ContentSource;
  videos: number;
  videoPct: number;
  totalViews: number;
  viewPct: number;
  avgViewsPerVideo: number;
  engagementRate: number;
  wastefulEffort: boolean; // % video cao nhưng % views thấp hẳn - đang lãng phí sức đăng
};

export function computeSourceComparison(items: ContentItem[]): SourceComparison[] {
  const totalVideos = items.length;
  const totalViews = items.reduce((sum, it) => sum + (it.statistic?.view?.total ?? 0), 0);

  const map = new Map<ContentSource, { videos: number; views: number; likes: number; comments: number }>();
  items.forEach((it) => {
    if (!it.source) return;
    const entry = map.get(it.source) ?? { videos: 0, views: 0, likes: 0, comments: 0 };
    entry.videos += 1;
    entry.views += it.statistic?.view?.total ?? 0;
    entry.likes += it.statistic?.like?.total ?? 0;
    entry.comments += it.statistic?.comment?.total ?? 0;
    map.set(it.source, entry);
  });

  return Array.from(map.entries())
    .map(([source, v]) => {
      const videoPct = totalVideos > 0 ? (v.videos / totalVideos) * 100 : 0;
      const viewPct = totalViews > 0 ? (v.views / totalViews) * 100 : 0;
      return {
        source,
        videos: v.videos,
        videoPct,
        totalViews: v.views,
        viewPct,
        avgViewsPerVideo: v.videos > 0 ? v.views / v.videos : 0,
        engagementRate: v.views > 0 ? (v.likes + v.comments) / v.views : 0,
        // % video chiếm phần đáng kể (>=15%) nhưng % views thấp hơn hẳn (>10 điểm %)
        wastefulEffort: videoPct >= 15 && videoPct - viewPct > 10,
      };
    })
    .sort((a, b) => b.totalViews - a.totalViews);
}

// ---------------------------------------------------------------------------
// Bảng campaign (group theo event._id): CPV, views/creator, % rejected.
// ---------------------------------------------------------------------------

export type CampaignStat = {
  eventId: string;
  eventName: string;
  videos: number;
  totalViews: number;
  uniqueCreators: number;
  totalCash: number;
  totalPoint: number;
  cpv: number; // cash / views - càng thấp càng hiệu quả
  viewsPerCreator: number;
  rejectedPct: number;
  firstPublishedAt: string;
  lastPublishedAt: string;
};

// Heuristic nhận diện video bị từ chối qua field `status` - API chỉ nêu ví dụ
// waiting_approved/approved nên đoán các biến thể "reject/denied" thường gặp.
// Nếu backend dùng giá trị khác, chỉnh lại regex này.
function isRejectedStatus(status: string): boolean {
  return /reject|denied|từ chối/i.test(status ?? "");
}

export function computeCampaignStats(items: ContentItem[]): CampaignStat[] {
  type Accumulator = {
    name: string;
    videos: number;
    rejectedVideos: number;
    totalViews: number;
    totalCash: number;
    totalPoint: number;
    creators: Set<string>;
    firstPublishedAt: string;
    lastPublishedAt: string;
  };

  const map = new Map<string, Accumulator>();

  items.forEach((item) => {
    const eventId = item.event?._id;
    if (!eventId) return;

    const views = item.statistic?.view?.total ?? 0;
    const cash = item.statistic?.cash?.total ?? 0;
    const point = item.statistic?.point?.total ?? 0;
    const publishedAt = item.publishedAt || item.createdAt;

    const entry: Accumulator = map.get(eventId) ?? {
      name: item.event?.name ?? "-",
      videos: 0,
      rejectedVideos: 0,
      totalViews: 0,
      totalCash: 0,
      totalPoint: 0,
      creators: new Set<string>(),
      firstPublishedAt: publishedAt,
      lastPublishedAt: publishedAt,
    };

    entry.videos += 1;
    if (isRejectedStatus(item.status)) entry.rejectedVideos += 1;
    entry.totalViews += views;
    entry.totalCash += cash;
    entry.totalPoint += point;
    if (item.createdBy?._id) entry.creators.add(item.createdBy._id);
    if (publishedAt && publishedAt < entry.firstPublishedAt) entry.firstPublishedAt = publishedAt;
    if (publishedAt && publishedAt > entry.lastPublishedAt) entry.lastPublishedAt = publishedAt;

    map.set(eventId, entry);
  });

  return Array.from(map.entries())
    .map(([eventId, v]) => ({
      eventId,
      eventName: v.name,
      videos: v.videos,
      totalViews: v.totalViews,
      uniqueCreators: v.creators.size,
      totalCash: v.totalCash,
      totalPoint: v.totalPoint,
      cpv: v.totalViews > 0 ? v.totalCash / v.totalViews : 0,
      viewsPerCreator: v.creators.size > 0 ? v.totalViews / v.creators.size : 0,
      rejectedPct: v.videos > 0 ? (v.rejectedVideos / v.videos) * 100 : 0,
      firstPublishedAt: v.firstPublishedAt,
      lastPublishedAt: v.lastPublishedAt,
    }))
    .sort((a, b) => a.cpv - b.cpv); // CPV thấp = hiệu quả nhất lên đầu
}

// ---------------------------------------------------------------------------
// Lifecycle 1 campaign: views/videos theo ngày kể từ video đầu tiên, và phát
// hiện "nguội" (7 ngày gần nhất đều dưới 50% đỉnh).
// ---------------------------------------------------------------------------

export type CampaignLifecyclePoint = {
  date: string;
  videos: number;
  views: number;
};

export function computeCampaignLifecycle(items: ContentItem[]): CampaignLifecyclePoint[] {
  const byDay = new Map<string, { videos: number; views: number }>();

  items.forEach((item) => {
    const dayKey = toVnDateKey(item.publishedAt || item.createdAt);
    if (!dayKey) return;
    const views = item.statistic?.view?.total ?? 0;
    const entry = byDay.get(dayKey) ?? { videos: 0, views: 0 };
    entry.videos += 1;
    entry.views += views;
    byDay.set(dayKey, entry);
  });

  return Array.from(byDay.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type CampaignMomentum = {
  peakViews: number;
  peakDate: string;
  latestViews: number;
  latestDate: string;
  declineFromPeakPct: number;
  isDeclining: boolean; // 7 điểm dữ liệu gần nhất đều < 50% đỉnh
};

export function computeCampaignMomentum(lifecycle: CampaignLifecyclePoint[]): CampaignMomentum | null {
  if (lifecycle.length === 0) return null;

  let peak = lifecycle[0];
  lifecycle.forEach((p) => {
    if (p.views > peak.views) peak = p;
  });

  const last7 = lifecycle.slice(-7);
  const isDeclining = last7.length >= 7 && peak.views > 0 && last7.every((p) => p.views < peak.views * 0.5);

  const latest = lifecycle[lifecycle.length - 1];

  return {
    peakViews: peak.views,
    peakDate: peak.date,
    latestViews: latest.views,
    latestDate: latest.date,
    declineFromPeakPct: peak.views > 0 ? ((peak.views - latest.views) / peak.views) * 100 : 0,
    isDeclining,
  };
}

// ---------------------------------------------------------------------------
// Phân tích tag (warningTags): số video, avg views, cảnh báo tăng đột biến
// tuần gần nhất trong dữ liệu so với trung bình các tuần trước đó.
// ---------------------------------------------------------------------------

export type TagAnalysis = {
  name: string;
  videos: number;
  avgViews: number;
  thisWeekVideos: number;
  priorAvgWeeklyVideos: number;
  isAnomalous: boolean;
};

// Tag do AI tự động gắn khi duyệt video (không phải hành vi creator/campaign) -
// không phản ánh hành vi creator/campaign nên loại hẳn khỏi tag analysis, không
// chỉ khỏi cảnh báo "tag tăng đột biến".
const AI_AUTO_TAGS = new Set([
  "Suggest Auto Approved",
  "Suggest Auto Rejected",
  "Suggest Approved",
  "Suggest Rejected",
]);

export function computeTagAnalysis(items: ContentItem[]): TagAnalysis[] {
  const tagWeekly = new Map<string, Map<string, number>>();
  const tagTotals = new Map<string, { videos: number; totalViews: number }>();
  const allWeeks = new Set<string>();

  items.forEach((item) => {
    const week = toVnWeekKey(item.publishedAt || item.createdAt);
    if (week) allWeeks.add(week);
    const views = item.statistic?.view?.total ?? 0;

    (item.warningTags ?? []).forEach((tag) => {
      if (!tag?.name || AI_AUTO_TAGS.has(tag.name)) return;

      const totals = tagTotals.get(tag.name) ?? { videos: 0, totalViews: 0 };
      totals.videos += 1;
      totals.totalViews += views;
      tagTotals.set(tag.name, totals);

      if (week) {
        const weekMap = tagWeekly.get(tag.name) ?? new Map<string, number>();
        weekMap.set(week, (weekMap.get(week) ?? 0) + 1);
        tagWeekly.set(tag.name, weekMap);
      }
    });
  });

  const sortedWeeks = Array.from(allWeeks).sort();
  const latestWeek = sortedWeeks[sortedWeeks.length - 1];
  const priorWeeks = sortedWeeks.slice(0, -1);

  return Array.from(tagTotals.entries())
    .map(([name, v]) => {
      const weekMap = tagWeekly.get(name) ?? new Map<string, number>();
      const thisWeekVideos = latestWeek ? weekMap.get(latestWeek) ?? 0 : 0;
      const priorCounts = priorWeeks.map((w) => weekMap.get(w) ?? 0);
      const priorAvgWeeklyVideos =
        priorCounts.length > 0 ? priorCounts.reduce((sum, c) => sum + c, 0) / priorCounts.length : 0;

      // Cần tối thiểu vài video để tránh báo động giả (vd 1 -> 2 video).
      const isAnomalous = priorWeeks.length > 0 && thisWeekVideos >= 3 && thisWeekVideos > priorAvgWeeklyVideos * 2;

      return {
        name,
        videos: v.videos,
        avgViews: v.videos > 0 ? v.totalViews / v.videos : 0,
        thisWeekVideos,
        priorAvgWeeklyVideos,
        isAnomalous,
      };
    })
    .sort((a, b) => b.videos - a.videos);
}

// ---------------------------------------------------------------------------
// Compliance với thể lệ chương trình thật (xem lib/campaignRules.ts): tương tác/comment tối
// thiểu, cap views/video theo từng campaign, và countdown thời gian chương trình.
// ---------------------------------------------------------------------------

export type EngagementCompliance = {
  checkedCount: number;
  atRiskCount: number;
  atRiskPct: number;
  sampleTitles: string[];
};

// Video nguồn Threads có luật riêng (xem lib/campaignRules.ts) và không đủ dữ liệu để phân biệt
// bài "thảo luận" hay không, nên chỉ áp check tương tác/comment chung cho video (không phải
// Threads) - tránh flag oan bài Threads hợp lệ.
export function computeEngagementCompliance(items: ContentItem[]): EngagementCompliance {
  const candidates = items.filter(
    (it) => it.source !== "threads" && (it.statistic?.view?.total ?? 0) >= ENGAGEMENT_CHECK_MIN_VIEWS
  );

  const atRisk = candidates.filter((it) => {
    const views = it.statistic?.view?.total ?? 0;
    const likes = it.statistic?.like?.total ?? 0;
    const comments = it.statistic?.comment?.total ?? 0;
    const engagementRate = (likes + comments) / views;
    if (engagementRate < VIDEO_ENGAGEMENT_MIN_RATE) return true;

    const tier = VIDEO_COMMENT_RATIO_TIERS.find((t) => views >= t.minViews && views < t.maxViews);
    if (tier && comments / views < tier.minRatio) return true;

    return false;
  });

  return {
    checkedCount: candidates.length,
    atRiskCount: atRisk.length,
    atRiskPct: candidates.length > 0 ? (atRisk.length / candidates.length) * 100 : 0,
    sampleTitles: [...atRisk]
      .sort((a, b) => (b.statistic?.view?.total ?? 0) - (a.statistic?.view?.total ?? 0))
      .slice(0, 3)
      .map((it) => it.title || it.link),
  };
}

export type CampaignCapRisk = {
  eventName: string;
  label: string;
  viewCapPerVideo: number;
  videosOverCap: number;
  totalVideos: number;
  viewsBeyondCap: number;
};

// Chỉ áp dụng cho campaign trả thưởng theo view (unit "view") có viewCapPerVideo - campaign
// dạng "post" (Threads) trả theo bài, không có khái niệm cap/view nên bỏ qua.
//
// QUAN TRỌNG: cap này chỉ có ý nghĩa khi BTC đối soát/trả thưởng cho creator - không được dùng
// để cắt/điều chỉnh views hay bất kỳ số liệu nào khác hiển thị trên dashboard (KPI, CPV,
// computeCampaignStats, view distribution...). Hàm này CHỈ tạo insight tham khảo riêng, views
// thật vẫn phải hiển thị đúng số liệu gốc ở mọi nơi khác.
export function computeCampaignCapRisks(items: ContentItem[]): CampaignCapRisk[] {
  const byEvent = new Map<string, ContentItem[]>();
  items.forEach((it) => {
    const name = it.event?.name;
    if (!name) return;
    const arr = byEvent.get(name) ?? [];
    arr.push(it);
    byEvent.set(name, arr);
  });

  const results: CampaignCapRisk[] = [];
  byEvent.forEach((groupItems, eventName) => {
    const rule = matchCampaignRule(eventName);
    if (!rule || rule.unit !== "view" || !rule.viewCapPerVideo) return;

    const cap = rule.viewCapPerVideo;
    let videosOverCap = 0;
    let viewsBeyondCap = 0;
    groupItems.forEach((it) => {
      const views = it.statistic?.view?.total ?? 0;
      if (views > cap) {
        videosOverCap += 1;
        viewsBeyondCap += views - cap;
      }
    });

    results.push({
      eventName,
      label: rule.label,
      viewCapPerVideo: cap,
      videosOverCap,
      totalVideos: groupItems.length,
      viewsBeyondCap,
    });
  });

  return results.sort((a, b) => b.videosOverCap - a.videosOverCap);
}

export type CampaignTimeline = {
  eventName: string;
  label: string;
  endDate: string;
  daysRemaining: number; // âm nếu đã kết thúc (số ngày kể từ khi kết thúc)
  isEnded: boolean;
  // Vẫn có video published sau endDate đã cấu hình - BTC thường gia hạn/sửa thể lệ giữa chừng
  // (đã thấy thực tế ở 1 thể lệ: "Bổ sung mới điều khoản nội dung 26/5") nên endDate cứng trong
  // CAMPAIGN_RULES có thể đã lỗi thời. Khi true, không nên khẳng định "đã kết thúc" - cần đối
  // chiếu lại thể lệ mới nhất trước khi tin số ngày countdown.
  possiblyExtended: boolean;
};

function dateKeyToUtcMs(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return Date.UTC(year, month - 1, day); // Date.UTC dùng month 0-based, chuỗi ngày là 1-based
}

function diffDaysUtc(fromDateStr: string, toDateStr: string): number {
  return Math.round((dateKeyToUtcMs(toDateStr) - dateKeyToUtcMs(fromDateStr)) / (24 * 60 * 60 * 1000));
}

// referenceDate nên là ngày sync gần nhất (xem fetchLastSync) chứ không phải vnToday() thật -
// dashboard chỉ có dữ liệu tới ngày đó nên countdown phải tính từ mốc dữ liệu, không phải lịch.
export function computeCampaignTimelines(items: ContentItem[], referenceDate: string): CampaignTimeline[] {
  const byEvent = new Map<string, ContentItem[]>();
  items.forEach((it) => {
    const name = it.event?.name;
    if (!name) return;
    const arr = byEvent.get(name) ?? [];
    arr.push(it);
    byEvent.set(name, arr);
  });

  const seenRuleIds = new Set<string>();
  const results: CampaignTimeline[] = [];

  byEvent.forEach((groupItems, eventName) => {
    const rule = matchCampaignRule(eventName);
    if (!rule || seenRuleIds.has(rule.id)) return;
    seenRuleIds.add(rule.id);

    const daysRemaining = diffDaysUtc(referenceDate, rule.endDate);
    const possiblyExtended = groupItems.some((it) => {
      const publishedDay = toVnDateKey(it.publishedAt || it.createdAt);
      return !!publishedDay && publishedDay > rule.endDate;
    });

    results.push({
      eventName,
      label: rule.label,
      endDate: rule.endDate,
      daysRemaining,
      isEnded: daysRemaining < 0,
      possiblyExtended,
    });
  });

  return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function formatDateVi(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Insight tự động (rule-based) cho trang /campaigns.
// ---------------------------------------------------------------------------

export function generateCampaignInsights(
  campaigns: CampaignStat[],
  heatmap: HeatmapCell[],
  viewDist: ViewDistribution,
  tagAnalysis: TagAnalysis[],
  items: ContentItem[],
  referenceDate: string
): string[] {
  const insights: string[] = [];

  // 0a. Video vượt cap đối soát/video theo thể lệ chương trình - phần vượt không được tính
  // thưởng thêm, đáng để creator/BTC biết sớm thay vì tiếp tục đẩy view vô ích.
  const capRisks = computeCampaignCapRisks(items).filter((c) => c.videosOverCap > 0);
  if (capRisks.length > 0) {
    const top = capRisks[0];
    insights.push(
      `${formatNumber(top.videosOverCap)} video trong campaign "${top.label}" đã vượt cap đối soát ${formatNumber(
        top.viewCapPerVideo
      )} views/video - ${formatNumber(top.viewsBeyondCap)} views vượt sẽ không được tính thưởng thêm.`
    );
  }

  // 0b. Countdown campaign sắp/đã kết thúc - giúp giải thích momentum giảm tự nhiên thay vì
  // tưởng là bất thường.
  const timelines = computeCampaignTimelines(items, referenceDate);
  const endingSoon = timelines.filter((t) => !t.isEnded).sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  if (endingSoon && endingSoon.daysRemaining <= 7) {
    insights.push(
      `Campaign "${endingSoon.label}" còn ${formatNumber(endingSoon.daysRemaining)} ngày nữa kết thúc (hết hạn ${formatDateVi(
        endingSoon.endDate
      )}) - nhắc creator đẩy nốt nội dung.`
    );
  }
  const recentlyEnded = timelines.filter((t) => t.isEnded).sort((a, b) => b.daysRemaining - a.daysRemaining)[0];
  if (recentlyEnded && recentlyEnded.daysRemaining >= -14) {
    if (recentlyEnded.possiblyExtended) {
      // Vẫn có video published sau endDate cấu hình - thể lệ nhiều khả năng đã được BTC gia hạn/
      // sửa đổi, không nên khẳng định chắc "đã kết thúc" (xem ghi chú ở CampaignTimeline).
      insights.push(
        `Campaign "${recentlyEnded.label}" đã qua ngày kết thúc theo cấu hình (${formatDateVi(
          recentlyEnded.endDate
        )}) nhưng vẫn có video mới - có thể chương trình đã gia hạn, cần đối chiếu lại thể lệ mới nhất và cập nhật lib/campaignRules.ts.`
      );
    } else {
      insights.push(
        `Campaign "${recentlyEnded.label}" đã kết thúc ${formatNumber(
          Math.abs(recentlyEnded.daysRemaining)
        )} ngày trước (${formatDateVi(recentlyEnded.endDate)}) - views/video đứng yên là bình thường, không phải dấu hiệu bất thường.`
      );
    }
  }

  // 0c. Video không đạt chuẩn tương tác/comment tối thiểu theo thể lệ - nguy cơ bị từ chối.
  const compliance = computeEngagementCompliance(items);
  if (compliance.atRiskCount >= 3 && compliance.atRiskPct >= 10) {
    insights.push(
      `${formatNumber(compliance.atRiskCount)} video (${formatPercent(
        compliance.atRiskPct
      )}) không đạt chuẩn tương tác tối thiểu (>0.5% hoặc tỉ lệ comment/view theo thể lệ) - có nguy cơ bị BTC từ chối/không tính thưởng.`
    );
  }

  // 1. Chênh lệch CPV giữa 2 campaign xa nhau nhất.
  const withCash = campaigns.filter((c) => c.totalCash > 0 && c.totalViews > 0);
  if (withCash.length >= 2) {
    const sorted = [...withCash].sort((a, b) => b.cpv - a.cpv);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if (best.cpv > 0 && worst.cpv > best.cpv * 1.5) {
      const ratio = worst.cpv / best.cpv;
      insights.push(
        `CPV campaign "${worst.eventName}" = ${formatCurrency(worst.cpv)}, gấp ${ratio.toFixed(
          1
        )} lần campaign "${best.eventName}" (${formatCurrency(best.cpv)}) - xem lại cơ cấu thưởng.`
      );
    }
  }

  // 2. Khung giờ đăng tốt nhất (đủ mẫu, xem HEATMAP_MIN_SAMPLE) so với avg views toàn hệ (= mean).
  const best = pickBestHeatmapCell(heatmap);
  if (best && viewDist.mean > 0) {
    const ratio = best.avgViews / viewDist.mean;
    if (ratio >= 1.5) {
      const dominant = dominantHeatmapSource(best);
      const dominantNote = dominant ? ` (chủ yếu ${SOURCE_LABEL[dominant] ?? dominant})` : "";
      insights.push(
        `Khung giờ ${best.hour}h ${WEEKDAY_LABELS[best.dayOfWeek]}${dominantNote} cho avg views cao gấp ${ratio.toFixed(
          1
        )} lần trung bình - hướng dẫn creators đăng vào giờ này.`
      );
    }
  }

  // 3. % video flop.
  if (viewDist.flopPct > 0) {
    insights.push(
      `${formatPercent(viewDist.flopPct)} video dưới 200 views (flop) - cần training content cho nhóm creators tier thấp.`
    );
  }

  // 4. Tag tăng đột biến tuần này.
  const anomalousTags = tagAnalysis.filter((t) => t.isAnomalous);
  if (anomalousTags.length > 0) {
    const names = anomalousTags.map((t) => `"${t.name}"`).join(", ");
    insights.push(`Tag ${names} tăng đột biến số video gắn tuần này - cần kiểm tra nguyên nhân.`);
  }

  // 5. Phân phối views lệch nhiều (mean >> median) - phụ thuộc video viral.
  if (viewDist.median > 0 && viewDist.mean > viewDist.median * 2) {
    insights.push(
      `Views trung bình (${formatNumber(viewDist.mean)}) cao hơn nhiều so với trung vị (${formatNumber(
        viewDist.median
      )}) - kết quả đang phụ thuộc vào một số video viral.`
    );
  }

  return insights.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Insight tự động (rule-based) cho dashboard chính (trang /).
// ---------------------------------------------------------------------------

export function generateDashboardInsights(
  metrics: ContentMetrics,
  sourceComparison: SourceComparison[],
  tagAnalysis: TagAnalysis[],
  items: ContentItem[]
): string[] {
  const insights: string[] = [];

  // 0a. Video không đạt chuẩn tương tác/comment tối thiểu theo thể lệ - nguy cơ bị từ chối.
  const compliance = computeEngagementCompliance(items);
  if (compliance.atRiskCount >= 3 && compliance.atRiskPct >= 10) {
    insights.push(
      `${formatNumber(compliance.atRiskCount)} video (${formatPercent(
        compliance.atRiskPct
      )}) không đạt chuẩn tương tác tối thiểu (>0.5% hoặc tỉ lệ comment/view theo thể lệ) - có nguy cơ bị BTC từ chối/không tính thưởng.`
    );
  }

  // 2. Nền tảng "lãng phí sức đăng": % video cao nhưng % views thấp hẳn.
  const wasteful = sourceComparison.filter((s) => s.wastefulEffort).sort((a, b) => b.videoPct - a.videoPct)[0];
  if (wasteful) {
    insights.push(
      `${SOURCE_LABEL[wasteful.source] ?? wasteful.source} chiếm ${formatPercent(
        wasteful.videoPct
      )} video nhưng chỉ ${formatPercent(wasteful.viewPct)} views - cân nhắc giảm ưu tiên nền tảng này.`
    );
  }

  // 3. Event/sự kiện chiếm tỉ trọng quá lớn trong kỳ - rủi ro phụ thuộc 1 campaign.
  const topEvent = metrics.byEvent[0];
  if (topEvent && metrics.totalVideos > 0) {
    const pct = (topEvent.videos / metrics.totalVideos) * 100;
    if (pct > 50) {
      insights.push(
        `Sự kiện "${topEvent.name}" chiếm ${formatPercent(pct)} tổng video trong kỳ - rủi ro phụ thuộc vào 1 campaign.`
      );
    }
  }

  // 4. Tag tăng đột biến tuần này.
  const anomalousTags = tagAnalysis.filter((t) => t.isAnomalous);
  if (anomalousTags.length > 0) {
    const names = anomalousTags
      .slice(0, 3)
      .map((t) => `"${t.name}"`)
      .join(", ");
    insights.push(`Tag ${names} tăng đột biến số video gắn tuần này - cần kiểm tra nguyên nhân.`);
  }

  // 5. Trung bình video/creator thấp - phần lớn creator chỉ đăng 1 lần rồi không quay lại.
  if (metrics.uniqueCreators > 0) {
    const avgVideosPerCreator = metrics.totalVideos / metrics.uniqueCreators;
    if (avgVideosPerCreator <= 1.5) {
      insights.push(
        `Trung bình mỗi creator chỉ đăng ${avgVideosPerCreator.toFixed(
          1
        )} video trong kỳ - phần lớn đăng 1 lần rồi không quay lại, cân nhắc chương trình giữ chân creator.`
      );
    }
  }

  return insights.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Nguồn dữ liệu: "supabase" (đọc lịch sử đã sync, nhanh, không cần token) hay
// "realtime" (gọi thẳng VC API thật qua /api/vc/*, cần token). Lưu lựa chọn
// vào localStorage để đồng nhất giữa các trang.
// ---------------------------------------------------------------------------

const DATA_SOURCE_STORAGE_KEY = "vc-data-source";

export type DataSource = "supabase" | "realtime";

export function getStoredDataSource(): DataSource {
  if (typeof window === "undefined") return "supabase";
  return window.localStorage.getItem(DATA_SOURCE_STORAGE_KEY) === "realtime" ? "realtime" : "supabase";
}

export function setStoredDataSource(source: DataSource) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DATA_SOURCE_STORAGE_KEY, source);
}

async function jsonFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch {
    throw new VcApiError(0, "Không kết nối được tới server (lỗi mạng). Kiểm tra kết nối rồi thử lại.");
  }

  if (!res.ok) {
    let message = res.statusText || `Lỗi ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error ?? message;
    } catch {
      // Body lỗi không phải JSON hợp lệ - giữ message mặc định.
    }
    throw new VcApiError(res.status, message);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new VcApiError(res.status, "Phản hồi từ server không đúng định dạng JSON.");
  }
}

// Đọc content đã sync sẵn trong Supabase qua route nội bộ /api/data/contents -
// không cần token, dùng làm nguồn mặc định cho dashboard/creators/campaigns.
export async function fetchContentsFromSupabase(
  fromDate: string,
  toDate: string,
  options: { event?: string } = {}
): Promise<ContentItem[]> {
  const search = new URLSearchParams({ from: fromDate, to: toDate });
  if (options.event) search.set("event", options.event);
  const res = await jsonFetch<{ data: ContentItem[] }>(`/api/data/contents?${search.toString()}`);
  return res?.data ?? [];
}

// Đọc danh sách event đã sync trong Supabase qua route nội bộ /api/data/events
// - không cần token, dùng làm nguồn mặc định cho dropdown Campaign Lifecycle.
export async function fetchEventsFromSupabase(days = 90): Promise<EventItem[]> {
  const res = await jsonFetch<{ data: EventItem[] }>(`/api/data/events?days=${days}`);
  return res?.data ?? [];
}

// Gộp 2 nguồn theo cờ realtime - dùng ở app/campaigns/page.tsx cho dropdown
// event. Chế độ mặc định (Supabase) không bao giờ gọi thẳng VC API thật nên
// không bị chặn 403 khi chạy trên Vercel.
export async function fetchEventsSmart(realtime: boolean, days = 90): Promise<EventItem[]> {
  if (realtime) return fetchEvents();
  return fetchEventsFromSupabase(days);
}

// Gộp 2 nguồn theo cờ realtime - dùng ở app/page.tsx, /creators, /campaigns.
export async function fetchContentsSmart(
  fromDate: string,
  toDate: string,
  realtime: boolean,
  options: FetchContentsOptions = {}
): Promise<ContentItem[]> {
  if (realtime) return fetchContentsRange(fromDate, toDate, options);
  return fetchContentsFromSupabase(fromDate, toDate, { event: options.event });
}

// Đọc "cache mỏng" creators từ Supabase (email/phone/city/kênh liên kết/hợp
// đồng...) - nhanh, không cần token, nhưng thiếu các trường chỉ có ở
// /users/<id> thật (ngày sinh, banned, thống kê tiền...) - xem thêm
// fetchUserProfiles cho dữ liệu đầy đủ.
export async function fetchCreatorProfilesFromSupabase(): Promise<Map<string, UserDetail>> {
  const res = await jsonFetch<{ data: Record<string, UserDetail> }>("/api/data/creators");
  const map = new Map<string, UserDetail>();
  Object.entries(res?.data ?? {}).forEach(([id, profile]) => map.set(id, profile));
  return map;
}

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

// Search creator theo tên/hashtag/SĐT/link kênh/link video, không giới hạn
// theo khoảng ngày đang xem trên dashboard - xem app/api/data/search/route.ts.
export async function fetchCreatorSearch(query: string): Promise<CreatorSearchMatch[]> {
  const res = await jsonFetch<{ data: CreatorSearchMatch[] }>(`/api/data/search?q=${encodeURIComponent(query)}`);
  return res?.data ?? [];
}

export type LastSyncInfo = { snapshotDate: string; syncedAt: string };

export async function fetchLastSync(): Promise<LastSyncInfo | null> {
  const res = await jsonFetch<{ data: LastSyncInfo | null }>("/api/data/meta");
  return res?.data ?? null;
}

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

export type TrendsResult = {
  windowDays: number;
  velocity: VelocityItem[];
  weekOverWeek: { thisWeek: PeriodMetrics; lastWeek: PeriodMetrics };
  dailyTotals: { date: string; views: number; videos: number }[];
};

const EMPTY_PERIOD_METRICS: PeriodMetrics = {
  from: "",
  to: "",
  videos: 0,
  views: 0,
  likes: 0,
  comments: 0,
  creators: 0,
  avgViewsPerVideo: 0,
};

// Fallback đầy đủ shape - đảm bảo consumer (app/trends) luôn truy cập được
// data.weekOverWeek.thisWeek.* an toàn mà không cần optional chaining lồng nhau.
const EMPTY_TRENDS_RESULT: TrendsResult = {
  windowDays: 0,
  velocity: [],
  weekOverWeek: { thisWeek: EMPTY_PERIOD_METRICS, lastWeek: EMPTY_PERIOD_METRICS },
  dailyTotals: [],
};

export async function fetchTrends(windowDays = 14): Promise<TrendsResult> {
  const res = await jsonFetch<{ data?: Partial<TrendsResult> | null }>(`/api/data/trends?days=${windowDays}`);
  const data = res?.data;
  if (!data) return EMPTY_TRENDS_RESULT;

  return {
    windowDays: typeof data.windowDays === "number" ? data.windowDays : 0,
    velocity: Array.isArray(data.velocity) ? data.velocity : [],
    weekOverWeek: {
      thisWeek: data.weekOverWeek?.thisWeek ?? EMPTY_PERIOD_METRICS,
      lastWeek: data.weekOverWeek?.lastWeek ?? EMPTY_PERIOD_METRICS,
    },
    dailyTotals: Array.isArray(data.dailyTotals) ? data.dailyTotals : [],
  };
}

// ---------------------------------------------------------------------------
// Helpers định dạng dùng chung cho các component
// ---------------------------------------------------------------------------

export function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
