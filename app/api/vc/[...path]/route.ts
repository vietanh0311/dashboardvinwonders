import { NextRequest, NextResponse } from "next/server";

// Proxy nội bộ cho VC Creator Admin API thật.
// Base URL có thể override qua env VC_API_BASE_URL, mặc định là API production.
const VC_API_BASE_URL = (process.env.VC_API_BASE_URL || "https://vcreator-admin-api.koc.com.vn").replace(
  /\/$/,
  ""
);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: { path: string[] } }) {
  const token = req.headers.get("x-vc-token");

  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 401 });
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
