import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { computeTrends } from "@/lib/supabaseData";

// View velocity (delta view giữa 2 snapshot gần nhất/video) + so sánh tuần
// này vs tuần trước - chỉ tính được nhờ lịch sử snapshot trong Supabase,
// không cần token. Dùng bởi app/trends/page.tsx.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  const windowDays = daysParam ? Math.max(2, Math.min(60, Number(daysParam) || 14)) : 14;

  try {
    const data = await computeTrends(windowDays);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/trends]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
