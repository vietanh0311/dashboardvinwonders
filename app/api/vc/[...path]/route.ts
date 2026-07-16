import { NextRequest, NextResponse } from "next/server";

// Proxy nội bộ cho VC Creator Admin API thật.
// Base URL có thể override qua env VC_API_BASE_URL, mặc định là API production.
const VC_API_BASE_URL = (process.env.VC_API_BASE_URL || "https://vcreator-admin-api.koc.com.vn").replace(
  /\/$/,
  ""
);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: { path: string[] } }) {
  // Ưu tiên token client gửi lên (localStorage, qua TokenSettings cũ); nếu
  // không có thì dùng token cấu hình server-side - từ khi UI nhập token bị ẩn
  // (commit 45153cc), client không còn cách nào tự cung cấp token nữa.
  const token = req.headers.get("x-vc-token") || process.env.VC_API_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "Server chưa cấu hình VC_API_TOKEN (và request không kèm token). Liên hệ quản trị viên." },
      { status: 401 }
    );
  }

  const pathSegments = context.params.path ?? [];
  const targetUrl = `${VC_API_BASE_URL}/${pathSegments.join("/")}${req.nextUrl.search}`;

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") ?? "application/json";

    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": contentType },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Không thể kết nối tới VC API backend.", detail: `${error}` },
      { status: 502 }
    );
  }
}
