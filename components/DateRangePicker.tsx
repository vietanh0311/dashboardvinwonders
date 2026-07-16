"use client";

import { vnDaysAgo, vnToday, type DateRangeValue } from "@/lib/api";

type Props = {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
};

const PRESETS: Array<{ label: string; range: () => DateRangeValue }> = [
  { label: "Hôm nay", range: () => ({ from: vnToday(), to: vnToday() }) },
  { label: "Hôm qua", range: () => ({ from: vnDaysAgo(1), to: vnDaysAgo(1) }) },
  { label: "7 ngày", range: () => ({ from: vnDaysAgo(6), to: vnToday() }) },
  { label: "30 ngày", range: () => ({ from: vnDaysAgo(29), to: vnToday() }) },
];

export default function DateRangePicker({ value, onChange }: Props) {
  const isActivePreset = (getRange: () => DateRangeValue) => {
    const r = getRange();
    return value.from === r.from && value.to === r.to;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.range())}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              isActivePreset(preset.range) ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-emerald-50"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mx-1 h-6 w-px bg-emerald-100" />
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-gray-500">
          Từ
          <input
            type="date"
            value={value.from}
            max={value.to}
            onChange={(e) => {
              const from = e.target.value;
              // Input type="date" chỉ gợi ý min/max qua UI - gõ tay hoặc dán vẫn có thể
              // vượt giới hạn (không bắn onChange nếu rỗng do đang gõ dở). Tự kẹp lại để
              // "Từ" không bao giờ vượt quá "Đến", tránh range đảo ngược (from > to) khiến
              // query trả về rỗng mà không có cảnh báo gì.
              if (!from) return;
              onChange({ from, to: from > value.to ? from : value.to });
            }}
            className="rounded-md border border-gray-200 px-2 py-1 text-gray-800 outline-none focus:border-emerald-400"
          />
        </label>
        <label className="flex items-center gap-1 text-gray-500">
          Đến
          <input
            type="date"
            value={value.to}
            min={value.from}
            max={vnToday()}
            onChange={(e) => {
              let to = e.target.value;
              if (!to) return;
              if (to > vnToday()) to = vnToday();
              onChange({ from: to < value.from ? to : value.from, to });
            }}
            className="rounded-md border border-gray-200 px-2 py-1 text-gray-800 outline-none focus:border-emerald-400"
          />
        </label>
      </div>
    </div>
  );
}
