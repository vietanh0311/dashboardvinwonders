import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isValidAuthCookie } from "@/lib/auth";

// Chặn toàn bộ trang + API (trừ /login, /api/login, static assets) cho tới
// khi có cookie dash-auth hợp lệ. Nếu chưa cấu hình DASHBOARD_PASSWORD
// (vd đang chạy local mà quên set env) thì bỏ qua luôn, không tự khoá.
export async function middleware(req: NextRequest) {
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const valid = await isValidAuthCookie(cookieValue, expectedPassword);

  if (valid) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
