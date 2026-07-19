"use client";

import { useEffect, useState } from "react";
import { copyRowsToClipboard } from "@/lib/copyTable";

type Props = {
  headers: string[];
  rows: (string | number)[][];
  label?: string;
  className?: string;
};

// Nút copy dùng chung cho mọi bảng liên quan tới creator - copy kèm cả
// text/html nên dán thẳng vào Google Sheets/Excel vẫn ra đúng từng cột thay vì
// dồn hết vào 1 ô. Luôn copy toàn bộ rows truyền vào (không chỉ trang đang
// hiện), để khớp kỳ vọng "copy cả bảng" khi bảng có phân trang.
export default function CopyTableButton({ headers, rows, label = "Copy bảng", className }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleCopy = async () => {
    const ok = await copyRowsToClipboard(headers, rows);
    setStatus(ok ? "copied" : "error");
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={rows.length === 0}
      title="Copy bảng để dán vào Google Sheets hoặc Excel"
      className={`whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
        status === "copied"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : status === "error"
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
      } ${className ?? ""}`}
    >
      {status === "copied" ? "Đã copy ✓" : status === "error" ? "Lỗi copy, thử lại" : `📋 ${label}`}
    </button>
  );
}
