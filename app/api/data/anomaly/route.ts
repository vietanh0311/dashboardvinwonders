import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { computeAnomalies } from "@/lib/supabaseData";

// Danh sách video/creator nghi buff view (điểm 0-100 + lý do) - tính từ lịch sử
// snapshot trong Supabase, không cần token. Dùng bởi app/trends/page.tsx (Signals).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const windowDays = daysParam ? Math.max(2, Math.min(14, Number(daysParam) || 14)) : 14;

  try {
    const data = await computeAnomalies(windowDays);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/anomaly]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
