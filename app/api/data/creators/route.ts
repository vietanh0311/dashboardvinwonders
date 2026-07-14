import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { creatorRowToUserDetail, fetchAllCreatorRows } from "@/lib/supabaseData";

// Đọc "cache mỏng" creators từ Supabase - không cần token. Thiếu vài trường
// so với /users/<id> thật (ngày sinh, banned, thống kê tiền...) - dùng
// fetchUserProfiles (nút "Tải profile") để lấy đầy đủ khi cần.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await fetchAllCreatorRows();
    const data: Record<string, ReturnType<typeof creatorRowToUserDetail>> = {};
    rows.forEach((row) => {
      data[row.creator_id] = creatorRowToUserDetail(row);
    });
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/creators]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
