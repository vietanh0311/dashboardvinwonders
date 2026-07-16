"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatNumber, type UnitComparisonRow } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: UnitComparisonRow[];
};

type SortKey = "creators" | "videos" | "totalViews" | "avgViewsPerVideo" | "totalCash" | "cpv";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "creators", label: "Creator" },
  { key: "videos", label: "Videos" },
  { key: "totalViews", label: "Views" },
  { key: "avgViewsPerVideo", label: "Views TB/video" },
  { key: "totalCash", label: "Cash" },
  { key: "cpv", label: "CPV" },
];

export default function UnitComparisonTable({ isLoading, data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalViews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const cmp = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">So sánh hiệu quả theo cơ sở</h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Cơ sở</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="whitespace-nowrap pb-2 pr-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`transition ${sortKey === col.key ? "text-emerald-600" : "hover:text-gray-600"}`}
                    >
                      {col.label} {sortKey === col.key && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.unitName} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.unitName}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.creators)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalViews)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                    {formatNumber(row.avgViewsPerVideo)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatCurrency(row.totalCash)}</td>
                  <td className="whitespace-nowrap py-2 text-gray-600">{row.cpv.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
