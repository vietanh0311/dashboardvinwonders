"use client";

import { useEffect } from "react";

// Error boundary cấp route (Next.js App Router) - bắt mọi lỗi throw ra trong
// lúc render/effect ở bất kỳ trang nào dưới app/ (trừ lỗi trong chính
// app/layout.tsx - xem app/global-error.tsx). Không để crash thành trắng
// trang: luôn hiện thông báo tiếng Việt rõ ràng + nút thử lại.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log để debug - không log token hay dữ liệu cá nhân, chỉ message/stack lỗi.
    console.error("[vcreators-dashboard] Lỗi hiển thị trang:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-red-700">Đã có lỗi khi hiển thị trang</h1>
        <p className="mt-2 text-sm text-gray-600">
          Nguyên nhân thường gặp: dữ liệu trả về không đúng định dạng, hoặc token đã hết hạn/thiếu. Thử tải lại; nếu
          vẫn lỗi, dán token mới ở mục Token API rồi tải lại.
        </p>
        {error.message && <p className="mt-2 truncate text-xs text-gray-400">{error.message}</p>}
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Thử lại
          </button>
          <a
            href="/"
            className="rounded-md border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Về Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
