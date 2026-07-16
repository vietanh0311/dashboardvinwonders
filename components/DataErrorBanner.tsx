"use client";

type Props = {
  error: unknown;
  // Còn dữ liệu (cũ) đang hiển thị hay không - quyết định mức độ "báo động"
  // của banner: còn dữ liệu thì chỉ cảnh báo vàng nhẹ, trắng trơn mới báo đỏ.
  hasData: boolean;
  onRetry: () => void;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "không xác định";
}

// Lỗi tạm thời kiểu quá tải - tự hết khi thử lại, không phải lỗi cấu hình.
function isTransient(error: unknown): boolean {
  const msg = messageOf(error);
  return msg.includes("statement timeout") || msg.includes("lỗi mạng") || msg.includes("Failed to fetch");
}

export default function DataErrorBanner({ error, hasData, onRetry }: Props) {
  if (!error) return null;

  // Còn số liệu cũ trên màn hình: đừng dọa người dùng bằng banner đỏ - dữ
  // liệu họ đang xem vẫn dùng được, chỉ là chưa làm mới được. SWR vẫn đang
  // tự thử lại ngầm theo backoff.
  if (hasData && isTransient(error)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span>
          Máy chủ đang bận, chưa tải được dữ liệu mới — đang hiển thị số liệu của lần tải trước. Hệ thống sẽ tự thử
          lại.
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          Thử lại ngay
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>
        Lỗi khi tải dữ liệu: {messageOf(error)}.{" "}
        {hasData ? "Đang hiển thị số liệu của lần tải trước." : "Có thể Supabase chưa được cấu hình hoặc chưa có dữ liệu."}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        Thử lại
      </button>
    </div>
  );
}
