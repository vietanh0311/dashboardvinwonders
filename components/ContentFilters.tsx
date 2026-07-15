"use client";

import { useMemo } from "react";
import { SOURCE_LABEL, extractFilterOptions, type ContentFilters as ContentFiltersValue, type ContentItem } from "@/lib/api";

type Props = {
  items: ContentItem[];
  value: ContentFiltersValue;
  onChange: (value: ContentFiltersValue) => void;
};

const selectClass =
  "rounded-md border border-emerald-200 bg-white px-2 py-2 text-sm text-gray-600 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";

// 4 dropdown lọc content: nguồn/sự kiện/tag/nhóm cơ sở - option tách trực tiếp
// từ danh sách content đã tải (items), không gọi thêm request nào. Filter áp
// dụng client-side nên dùng được cho cả 2 data source (Supabase/Realtime).
export default function ContentFilters({ items, value, onChange }: Props) {
  const options = useMemo(() => extractFilterOptions(items), [items]);

  const hasActiveFilter = !!(value.source || value.eventName || value.tagName || value.workplaceUnit);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClass}
        value={value.source ?? ""}
        onChange={(e) => onChange({ ...value, source: (e.target.value || undefined) as ContentFiltersValue["source"] })}
      >
        <option value="">Tất cả nguồn</option>
        {options.sources.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABEL[s] ?? s}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={value.eventName ?? ""}
        onChange={(e) => onChange({ ...value, eventName: e.target.value || undefined })}
      >
        <option value="">Tất cả sự kiện</option>
        {options.events.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={value.tagName ?? ""}
        onChange={(e) => onChange({ ...value, tagName: e.target.value || undefined })}
      >
        <option value="">Tất cả tag</option>
        {options.tags.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={value.workplaceUnit ?? ""}
        onChange={(e) => onChange({ ...value, workplaceUnit: e.target.value || undefined })}
      >
        <option value="">Tất cả nhóm cơ sở</option>
        {options.units.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      {hasActiveFilter && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
        >
          Xoá filter
        </button>
      )}
    </div>
  );
}
