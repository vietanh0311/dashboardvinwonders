// Resolve link rút gọn TikTok (vt.tiktok.com/vm.tiktok.com) sang URL cuối
// cùng theo redirect - server-only (dùng fetch redirect:"follow" tới TikTok).
// Dùng chung bởi app/api/resolve-link/route.ts (client-facing, gọi lẻ từng
// link) và app/api/sync/route.ts (gọi hàng loạt lúc sync).

// Chỉ cho phép resolve domain TikTok đã biết - tránh route/hàm này bị lợi
// dụng làm proxy fetch tuỳ ý (SSRF).
const ALLOWED_HOSTNAME_SUFFIXES = ["tiktok.com"];

function isAllowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOSTNAME_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

export type ResolveLinkResult = { finalUrl: string | null; error?: string };

export async function resolveTikTokLink(target: string): Promise<ResolveLinkResult> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { finalUrl: null, error: "invalid url" };
  }

  if (parsed.protocol !== "https:" || !isAllowedHostname(parsed.hostname)) {
    return { finalUrl: null, error: "hostname not allowed" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Link rút gọn TikTok thường redirect đúng khi giả lập trình duyệt di động.
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      },
    });
    return { finalUrl: res.url };
  } catch {
    return { finalUrl: null, error: "resolve failed" };
  } finally {
    clearTimeout(timeout);
  }
}
