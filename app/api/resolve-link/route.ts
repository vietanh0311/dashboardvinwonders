import { NextRequest, NextResponse } from "next/server";
import { resolveTikTokLink } from "@/lib/linkResolver";

// Resolve link rút gọn TikTok (vt.tiktok.com/vm.tiktok.com) sang URL cuối
// cùng (theo redirect) để lib/api.ts tách username từ URL đó. Chạy server-side
// vì fetch từ trình duyệt sẽ bị CORS chặn khi theo redirect sang domain khác.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  const result = await resolveTikTokLink(target);

  if (result.finalUrl === null && result.error && result.error !== "resolve failed") {
    // "invalid url" / "hostname not allowed" - lỗi input, trả 400.
    return NextResponse.json(result, { status: 400 });
  }

  // "resolve failed" (mạng lỗi, TikTok chặn...) - không throw 5xx, để client
  // coi như "chưa resolve được" và vẫn hiện UI bình thường.
  return NextResponse.json(result, { status: 200 });
}
