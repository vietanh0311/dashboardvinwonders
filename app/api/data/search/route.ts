import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errorMessage";
import { SupabaseConfigError } from "@/lib/supabase";
import { searchCreatorsAndVideos } from "@/lib/supabaseData";

// Tìm creator theo tên/hashtag/SĐT/link kênh/link video - không giới hạn theo
// khoảng ngày (khác với /api/data/contents), dùng cho ô search ở /creators.
export const dynamic = "force-dynamic";

const MIN_QUERY_LENGTH = 2;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ error: `Cần tối thiểu ${MIN_QUERY_LENGTH} ký tự để tìm kiếm` }, { status: 400 });
  }

  try {
    const data = await searchCreatorsAndVideos(q);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[api/data/search]", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
