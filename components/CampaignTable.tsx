"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatNumber, formatPercent, type CampaignStat } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: CampaignStat[];
};

type SortKey =
  | "eventName"
  | "videos"
  | "totalViews"
  | "uniqueCreators"
  | "totalCash"
  | "totalPoint"
  | "cpv"
  | "viewsPerCreator"
  | "rejectedPct";

type Column = { key: SortKey; label: string };

const COLUMNS: Column[] = [
  { key: "eventName", label: "Campaign" },
  { key: "videos", label: "Video" },
  { key: "totalViews", label: "Views" },
  { key: "uniqueCreators", label: "Creators" },
  { key: "totalCash", label: "Cash" },
  { key: "totalPoint", label: "Point" },
  { key: "cpv", label: "CPV" },
  { key: "viewsPerCreator", label: "Views/creator" },
  { key: "rejectedPct", label: "% Rejected" },
];

function getSortValue(row: CampaignStat, key: SortKey): string | number {
  if (key === "eventName") return row.eventName.toLowerCase();
  return row[key];
}

export default function CampaignTable({ isLoading, data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("cpv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // CPV thấp = hiệu quả nhất lên đầu

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "cpv" ? "asc" : "desc");
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">Hiệu quả campaign</h3>
      <p className="mb-3 text-xs text-gray-400">Mặc định sắp theo CPV tăng dần — campaign hiệu quả nhất trên mỗi đồng ở trên cùng.</p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
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
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={COLUMNS.length} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              sorted.map((row) => (
                <tr key={row.eventId} className="border-t border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-800">{row.eventName}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalViews)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.uniqueCreators)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatCurrency(row.totalCash)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalPoint)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-semibold text-emerald-700">
                    {formatCurrency(row.cpv)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.viewsPerCreator)}</td>
                  <td
                    className={`whitespace-nowrap py-2 pr-3 ${
                      row.rejectedPct > 20 ? "font-semibold text-red-600" : "text-gray-600"
                    }`}
                  >
                    {formatPercent(row.rejectedPct)}
                  </td>
                </tr>
              ))}

            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center text-sm text-gray-400">
                  Không có campaign nào trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
