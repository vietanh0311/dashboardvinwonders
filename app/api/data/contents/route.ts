import { NextRequest, NextResponse } from "next/server";
import type { ContentItem } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { fetchLatestSnapshotMeta, fetchLatestVideosByPublishedRange } from "@/lib/supabaseData";

// Đọc video đã sync trong Supabase theo khoảng ngày publishedAt (VN) - không
// cần token. Đây là nguồn dữ liệu mặc định của dashboard/creators/campaigns.
export const dynamic = "force-dynamic";

// Cache kết quả theo (khoảng ngày + event + syncedAt) ngay trong process:
// dữ liệu Supabase chỉ đổi khi bấm sync (~1 lần/ngày) nên cùng 1 khoảng ngày
// không cần chạy lại query nặng cho mỗi lượt xem - sync mới → syncedAt mới →
// key mới → tự tải bản tươi, không bao giờ dính dữ liệu cũ. Đây cũng là lá
// chắn chính chống lỗi "statement timeout" từ Supabase: mỗi khoảng ngày chỉ
// đánh 1 query nặng/lần sync (cho mỗi server instance) thay vì mỗi lượt xem.
// Giới hạn 4 khoảng ngày gần nhất (LRU) để không phình bộ nhớ serverless.
const CACHE_MAX_ENTRIES = 4;
const contentsCache = new Map<string, ContentItem[]>();

function cacheGet(key: string): ContentItem[] | undefined {
  const hit = contentsCache.get(key);
  if (hit) {
    // refresh vị trí LRU
    contentsCache.delete(key);
    contentsCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: ContentItem[]) {
  contentsCache.set(key, value);
  while (contentsCache.size > CACHE_MAX_ENTRIES) {
    const oldest = contentsCache.keys().next().value;
    if (oldest === undefined) break;
    contentsCache.delete(oldest);
  }
}

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const event = request.nextUrl.searchParams.get("event") ?? undefined;

  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  }

  try {
    // Query meta rất nhẹ (1 dòng) - đáng giá để mọi lượt xem sau lần đầu
    // trả kết quả từ cache ngay lập tức.
    const meta = await fetchLatestSnapshotMeta();
    const cacheKey = `${from}|${to}|${event ?? ""}|${meta?.syncedAt ?? "no-sync"}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached });
    }

    const data = await fetchLatestVideosByPublishedRange(from, to, event ? { eventId: event } : undefined);
    cacheSet(cacheKey, data);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/contents]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
