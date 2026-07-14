import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_NAME, computeAuthCookieValue } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!expectedPassword) {
    return NextResponse.json({ error: "Server chưa cấu hình DASHBOARD_PASSWORD." }, { status: 500 });
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  if (!password || password !== expectedPassword) {
    return NextResponse.json({ error: "Mật khẩu không đúng." }, { status: 401 });
  }

  const cookieValue = await computeAuthCookieValue(expectedPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
