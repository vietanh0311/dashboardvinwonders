import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { createLruCache } from "@/lib/routeCache";
import { SupabaseConfigError } from "@/lib/supabase";
import { fetchCreatorIdsInRange, fetchLatestSnapshotMeta } from "@/lib/supabaseData";

// Đọc danh sách creator_id (không phải video đầy đủ) đã đăng trong khoảng
// ngày - dùng cho khối so sánh "creator mới/quay lại" ở /creators, xem
// videos_creator_ids_in_range_json trong supabase-schema.sql. Nhẹ hơn nhiều so
// với /api/data/contents (vài trăm id thay vì hàng chục nghìn video đầy đủ).
export const dynamic = "force-dynamic";

const creatorIdsCache = createLruCache<string[]>(4);

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  }

  const source = request.nextUrl.searchParams.get("source") ?? undefined;
  const eventName = request.nextUrl.searchParams.get("event") ?? undefined;
  const tagName = request.nextUrl.searchParams.get("tag") ?? undefined;
  const workplaceUnit = request.nextUrl.searchParams.get("unit") ?? undefined;

  try {
    const meta = await fetchLatestSnapshotMeta();
    const cacheKey = `${from}|${to}|${source ?? ""}|${eventName ?? ""}|${tagName ?? ""}|${workplaceUnit ?? ""}|${meta?.syncedAt ?? "no-sync"}`;

    const cached = creatorIdsCache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached });
    }

    const data = await fetchCreatorIdsInRange(from, to, { source, eventName, tagName, workplaceUnit });
    creatorIdsCache.set(cacheKey, data);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/creator-ids]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
