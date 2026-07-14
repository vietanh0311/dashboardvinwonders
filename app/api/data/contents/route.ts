import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { fetchLatestVideosByPublishedRange } from "@/lib/supabaseData";

// Đọc video đã sync trong Supabase theo khoảng ngày publishedAt (VN) - không
// cần token. Đây là nguồn dữ liệu mặc định của dashboard/creators/campaigns.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const event = request.nextUrl.searchParams.get("event") ?? undefined;

  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  }

  try {
    const data = await fetchLatestVideosByPublishedRange(from, to, event ? { eventId: event } : undefined);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/contents]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
