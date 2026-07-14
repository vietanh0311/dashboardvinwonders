// Helper cho cơ chế bảo vệ dashboard bằng 1 mật khẩu chung (DASHBOARD_PASSWORD).
// Dùng Web Crypto API (crypto.subtle) vì phải chạy được cả ở middleware
// (Edge runtime) lẫn route handler (Node runtime) - cả hai đều hỗ trợ sẵn.

export const AUTH_COOKIE_NAME = "dash-auth";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 ngày (giây)

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Giá trị cookie không lưu mật khẩu trực tiếp, mà lưu hash của nó (kèm salt
// cố định) - tránh lộ mật khẩu gốc nếu ai đó xem được cookie, đồng thời vẫn
// có thể verify lại bằng cách hash DASHBOARD_PASSWORD và so sánh chuỗi.
export async function computeAuthCookieValue(password: string): Promise<string> {
  return sha256Hex(`vcreators-dashboard:${password}`);
}

export async function isValidAuthCookie(
  cookieValue: string | undefined | null,
  expectedPassword: string
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await computeAuthCookieValue(expectedPassword);
  return cookieValue === expected;
}
