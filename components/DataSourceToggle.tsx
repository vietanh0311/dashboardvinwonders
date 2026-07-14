"use client";

import { setStoredDataSource, type DataSource } from "@/lib/api";

type Props = {
  value: DataSource;
  onChange: (v: DataSource) => void;
};

// Checkbox "Realtime": mặc định TẮT = đọc dữ liệu đã sync trong Supabase
// (nhanh, không cần token). BẬT = gọi thẳng VC API thật (cần token hợp lệ ở
// TokenSettings), dùng khi cần soi số mới nhất trong ngày.
export default function DataSourceToggle({ value, onChange }: Props) {
  const isRealtime = value === "realtime";

  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm">
      <input
        type="checkbox"
        checked={isRealtime}
        onChange={(e) => {
          const next: DataSource = e.target.checked ? "realtime" : "supabase";
          setStoredDataSource(next);
          onChange(next);
        }}
        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
      />
      Realtime
      {isRealtime ? (
        <span className="text-xs font-medium text-amber-600">(API gốc, cần token)</span>
      ) : (
        <span className="text-xs text-gray-400">(Supabase)</span>
      )}
    </label>
  );
}
