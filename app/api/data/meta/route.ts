import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { fetchLatestSnapshotMeta } from "@/lib/supabaseData";

// Trả về lần sync gần nhất (snapshot_date + synced_at) - dùng cho badge
// "Dữ liệu cập nhật lúc" hiện ở Nav trên mọi trang, không cần token.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLatestSnapshotMeta();
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    // Log đầy đủ lỗi gốc ra server log để debug (vd lỗi mạng/PostgREST) -
    // không lộ ra response, chỉ trả message rút gọn cho client.
    console.error("[api/data/meta]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
