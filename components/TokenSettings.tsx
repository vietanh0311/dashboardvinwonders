"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { clearStoredToken, decodeJwtPayload, getStoredToken, getTokenExpiry, setStoredToken } from "@/lib/api";

type TokenStatus = "none" | "valid" | "expiring_soon" | "expired" | "unknown";

const STATUS_LABEL: Record<TokenStatus, string> = {
  none: "Chưa có token",
  valid: "Token còn hạn",
  expiring_soon: "Token sắp hết hạn",
  expired: "Token đã hết hạn",
  unknown: "Không đọc được hạn dùng",
};

const STATUS_BADGE: Record<TokenStatus, string> = {
  none: "bg-gray-100 text-gray-500",
  valid: "bg-emerald-50 text-emerald-700",
  expiring_soon: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000; // < 24h coi là sắp hết hạn

export function getTokenStatus(token: string, expiry: Date | null): TokenStatus {
  if (!token) return "none";
  if (!expiry) return "unknown";
  const diffMs = expiry.getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  if (diffMs < EXPIRING_SOON_MS) return "expiring_soon";
  return "valid";
}

type Props = {
  // Cho phép điều khiển đóng/mở từ bên ngoài (vd nút "Token API" ở header).
  // Nếu không truyền, component tự quản lý trạng thái mở/đóng của chính nó.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function TokenSettings({ open: openProp, onOpenChange }: Props) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (value: boolean) => {
    setOpenState(value);
    onOpenChange?.(value);
  };

  const [draft, setDraft] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = getStoredToken();
    setSavedToken(stored);
    setDraft(stored);
  }, []);

  const expiry = useMemo(() => (savedToken ? getTokenExpiry(savedToken) : null), [savedToken]);
  const status = useMemo(() => getTokenStatus(savedToken, expiry), [savedToken, expiry]);
  const payload = useMemo(() => (savedToken ? decodeJwtPayload(savedToken) : null), [savedToken]);
  const subject = typeof payload?.sub === "string" ? payload.sub : undefined;
  const email = typeof payload?.email === "string" ? payload.email : undefined;

  const handleSave = () => {
    const trimmed = draft.trim();
    setStoredToken(trimmed);
    setSavedToken(trimmed);
    setMessage(trimmed ? "Đã lưu token vào trình duyệt này." : "Đã xoá token.");
  };

  const handleClear = () => {
    clearStoredToken();
    setDraft("");
    setSavedToken("");
    setMessage("Đã xoá token.");
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800"
      >
        <span>Cấu hình Token API</span>
        <span className="flex items-center gap-2 text-xs font-normal">
          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_BADGE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          <span className="text-gray-300">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-emerald-50 px-4 py-4">
          <p className="mb-3 rounded-md bg-emerald-50/60 px-3 py-2 text-xs text-gray-500">
            Đăng nhập <span className="font-medium text-gray-700">admin.gen-green.global</span> → F12 → Application →
            Local Storage → copy giá trị <code className="rounded bg-emerald-100 px-1">access-token</code>, dán vào ô
            bên dưới.
          </p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Dán JWT (access-token) vào đây"
            rows={4}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-emerald-400"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Lưu token
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-red-100 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Xoá
            </button>
          </div>

          {message && <p className="mt-2 text-xs text-gray-500">{message}</p>}

          {savedToken && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              {expiry && (
                <span>
                  Hết hạn lúc:{" "}
                  <span
                    className={`font-medium ${
                      status === "expired"
                        ? "text-red-600"
                        : status === "expiring_soon"
                          ? "text-amber-600"
                          : "text-gray-700"
                    }`}
                  >
                    {format(expiry, "dd/MM/yyyy HH:mm")}
                  </span>
                </span>
              )}
              {!expiry && <span>Không đọc được thời hạn từ token (không đúng định dạng JWT?).</span>}
              {(email || subject) && <span>Tài khoản: {email ?? subject}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
