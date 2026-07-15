import { NextRequest, NextResponse } from "next/server";
import { vnDaysAgo } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { fetchDistinctEvents } from "@/lib/supabaseData";

// Danh sách event (cho dropdown Campaign Lifecycle) đọc từ Supabase - không
// cần token, không gọi VC API thật (tránh bị chặn 403 khi chạy trên Vercel).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.max(1, Math.min(365, Number(daysParam) || 90)) : 90;

  try {
    const data = await fetchDistinctEvents(vnDaysAgo(days - 1));
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/events]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
