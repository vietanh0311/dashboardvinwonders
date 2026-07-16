"use client";

// Hiển thị khi SWR đang revalidate mà TRÊN MÀN HÌNH vẫn là dữ liệu cũ
// (keepPreviousData): thanh tiến trình mảnh chạy ngang mép trên màn hình +
// pill "Đang cập nhật..." nổi giữa trên. Mục đích: người dùng đổi khoảng
// ngày thấy ngay là hệ thống đang tải, thay vì tưởng trang bị đơ vì số liệu
// chưa nhảy. Không render gì khi active=false nên đặt cố định ở mọi trang
// cũng không tốn kém.
export default function RefreshIndicator({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <>
      <style>{`
        @keyframes refresh-indicator-sweep {
          0% { left: -40%; width: 40%; }
          50% { left: 30%; width: 45%; }
          100% { left: 100%; width: 40%; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-emerald-100/60">
        <div
          className="absolute top-0 h-full rounded-full bg-emerald-500"
          style={{ animation: "refresh-indicator-sweep 1.2s ease-in-out infinite" }}
        />
      </div>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2"
      >
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white/95 px-4 py-1.5 text-sm font-medium text-emerald-800 shadow-md">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"
          />
          Đang cập nhật dữ liệu...
        </div>
      </div>
    </>
  );
}
