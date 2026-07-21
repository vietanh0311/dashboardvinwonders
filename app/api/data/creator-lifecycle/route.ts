import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { computeCreatorLifecycle } from "@/lib/supabaseData";

// Cohort giữ chân creator + funnel kích hoạt (bài #1 -> #2 -> #3) - toàn bộ lịch sử, không theo
// date range đang xem. Dùng bởi app/creators/page.tsx.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeCreatorLifecycle();
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/creator-lifecycle]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
