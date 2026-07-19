// Tự đăng nhập VC Creator Admin API để lấy token, thay cho việc dán token tay.
//
// Token VC là JWT sống chỉ vài tiếng và KHÔNG có refresh token, nên cách bền
// duy nhất là đăng nhập lại khi sắp hết hạn. Module này cache token trong RAM
// và tự login lại - phía gọi (scripts/sync.ts) không cần biết token tồn tại.
//
// LƯU Ý: endpoint /staffs/login chỉ gọi được từ IP đã whitelist hoặc khi bật
// VPN. Vì vậy chỉ sync (chạy ở máy local của Việt Anh) dùng module này -
// dashboard trên Vercel không gọi VC API nữa mà chỉ đọc Supabase.

const VC_API_BASE_URL = (process.env.VC_API_BASE_URL || "https://vcreator-admin-api.koc.com.vn").replace(/\/$/, "");

// Login lại sớm 5 phút trước khi token hết hạn, tránh trường hợp token chết
// giữa chừng một lần sync kéo dài hàng chục phút.
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export class VcAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VcAuthError";
  }
}

let cached: { token: string; expiresAt: number } | null = null;

function decodeExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
    return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function looksLikeJwt(value: string): boolean {
  return value.split(".").length === 3 && decodeExp(value) !== null;
}

// Response của /staffs/login chưa được kiểm chứng (cần credential thật để gọi),
// nên không hardcode đường dẫn field mà dò đệ quy chuỗi nào là JWT hợp lệ.
// Cách này đúng với mọi shape kiểu {data:{token}}, {data:{accessToken}}...
function findJwt(value: unknown, depth = 0): string | null {
  if (depth > 6) return null;
  if (typeof value === "string") return looksLikeJwt(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJwt(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findJwt(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return null;
}

async function login(): Promise<{ token: string; expiresAt: number }> {
  const email = process.env.VC_STAFF_EMAIL;
  const password = process.env.VC_STAFF_PASSWORD;

  if (!email || !password) {
    throw new VcAuthError(
      "Thiếu VC_STAFF_EMAIL / VC_STAFF_PASSWORD trong .env.local - không tự đăng nhập được. " +
        "Xem README mục 'Token gọi VC API'."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${VC_API_BASE_URL}/staffs/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    // Không phân biệt được "mất mạng" với "IP chưa whitelist" từ phía client,
    // nên nhắc cả hai - VPN là nguyên nhân hay gặp nhất.
    throw new VcAuthError(
      "Không kết nối được tới VC API để đăng nhập. Kiểm tra mạng, và nhớ BẬT VPN " +
        "(endpoint /staffs/login chỉ nhận IP đã whitelist)."
    );
  }

  const raw = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Giữ body = null, xử lý ở dưới.
  }

  if (!res.ok) {
    const message =
      (body as { message?: string } | null)?.message ?? (raw.slice(0, 200) || `Lỗi ${res.status}`);
    if (res.status === 401 || res.status === 403) {
      throw new VcAuthError(
        `Đăng nhập VC API bị từ chối (${res.status}): ${message}. ` +
          "Kiểm tra lại VC_STAFF_EMAIL/VC_STAFF_PASSWORD, hoặc IP chưa được whitelist (bật VPN)."
      );
    }
    throw new VcAuthError(`Đăng nhập VC API thất bại (${res.status}): ${message}`);
  }

  const token = findJwt(body);
  if (!token) {
    throw new VcAuthError(
      "Đăng nhập VC API trả về 200 nhưng không tìm thấy JWT trong response. " +
        `Các field nhận được: ${JSON.stringify(Object.keys((body as object) ?? {}))}. ` +
        "Có thể API đã đổi shape - cần cập nhật lib/vcAuth.ts."
    );
  }

  const exp = decodeExp(token);
  if (exp === null) {
    throw new VcAuthError("Token nhận được không đọc được hạn dùng (exp).");
  }

  return { token, expiresAt: exp };
}

// Trả về token còn hạn, tự đăng nhập lại khi cần. Gọi bao nhiêu lần cũng được -
// chỉ thực sự login khi chưa có token hoặc token sắp hết hạn.
export async function getVcToken(): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return cached.token;
  }
  cached = await login();
  return cached.token;
}

export function getCachedTokenExpiry(): Date | null {
  return cached ? new Date(cached.expiresAt) : null;
}
