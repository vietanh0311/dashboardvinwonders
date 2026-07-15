// Gọi thẳng VC Creator Admin API thật từ server, dùng token truyền tay (không
// đọc localStorage - route /api/sync chạy trên server, nhận token qua header
// x-vc-token của request POST). Dùng cho app/api/sync/route.ts.

import {
  VINWONDERS_PARTNER_ID,
  unwrap,
  unwrapOne,
  vnDayEndToUtcIso,
  vnDayStartToUtcIso,
  type ContentItem,
  type UserDetail,
} from "@/lib/api";

const VC_API_BASE_URL = (process.env.VC_API_BASE_URL || "https://vcreator-admin-api.koc.com.vn").replace(/\/$/, "");

export class VcServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VcServerError";
    this.status = status;
  }
}

function buildQuery(params?: Record<string, string | number | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 502/503/504 là lỗi gateway/hạ tầng phía VC API (Cloudflare trước origin) -
// thường tự khỏi sau 1-2 lần thử lại, đặc biệt khi sync kéo dài hàng chục
// request liên tiếp (90 ngày ~ 70+ trang content, hoặc tải profile hàng nghìn
// creator). Không retry lỗi mạng/timeout của chính request (throw ngay) vì có
// thể do token/kết nối sai, không phải lỗi thoáng qua.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

async function vcServerFetch<T = unknown>(
  path: string,
  token: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${VC_API_BASE_URL}/${path}${buildQuery(params)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      throw new VcServerError(0, "Không kết nối được tới VC API (lỗi mạng).");
    }

    if (!res.ok) {
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        const delayMs = 500 * 2 ** attempt; // 500ms, 1s, 2s
        console.error(`[vcServer] ${res.status} ${path} - thử lại sau ${delayMs}ms (lần ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      let message = res.statusText || `Lỗi ${res.status}`;
      try {
        const body = await res.json();
        message = body?.error ?? message;
      } catch {
        // Body lỗi không phải JSON hợp lệ - giữ message mặc định.
      }
      throw new VcServerError(res.status, message);
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new VcServerError(res.status, "Phản hồi từ VC API không đúng định dạng JSON.");
    }
  }
}

// Giống fetchContentsRange trong lib/api.ts nhưng nhận token trực tiếp thay
// vì đọc từ localStorage (không tồn tại trên server).
export async function fetchContentsRangeServer(
  token: string,
  fromDate: string,
  toDate: string
): Promise<ContentItem[]> {
  const fromAt = vnDayStartToUtcIso(fromDate);
  const toAt = vnDayEndToUtcIso(toDate);
  const limit = 500;

  const items: ContentItem[] = [];
  let page = 0;
  let total = Infinity;

  while (page * limit < total) {
    const res = await vcServerFetch("contents", token, {
      page,
      limit,
      partner: VINWONDERS_PARTNER_ID,
      fromAt,
      toAt,
    });

    // Luôn đi qua unwrap() - không truy cập res.data.data/res.data.total trực
    // tiếp, tránh crash khi VC API trả về shape khác hoặc thiếu field.
    const { items: chunk, total: totalFromRes } = unwrap<ContentItem>(res);
    total = totalFromRes > 0 ? totalFromRes : chunk.length;
    items.push(...chunk);

    if (chunk.length === 0) break;
    page += 1;
  }

  return items;
}

export async function fetchUserDetailServer(token: string, userId: string): Promise<UserDetail | null> {
  const res = await vcServerFetch(`users/${userId}`, token);
  return unwrapOne<UserDetail>(res);
}
