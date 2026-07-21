"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeCampaignHealth,
  formatCurrency,
  formatNumber,
  formatPercent,
  type CampaignHealthStatus,
  type CampaignStat,
  type CampaignWatchlistRow,
} from "@/lib/api";

// Phân trang client-side để tránh render toàn bộ hàng đã sort vào DOM (giật
// khi sort/lọc lại trên danh sách campaign lớn).
const PAGE_SIZE = 50;

type Props = {
  isLoading: boolean;
  data: CampaignStat[];
  // Đã tính sẵn ở page.tsx bằng computeCampaignWatchlist (cùng logic phục vụ /actions) - bảng
  // này chỉ join theo eventName để hiện badge, không tính lại cap-risk/timeline.
  watchlist: CampaignWatchlistRow[];
};

const HEALTH_META: Record<CampaignHealthStatus, { label: string; className: string }> = {
  at_risk: { label: "Cần xử lý", className: "bg-red-50 text-red-700" },
  watch: { label: "Theo dõi", className: "bg-amber-50 text-amber-700" },
  stable: { label: "Ổn định", className: "bg-emerald-50 text-emerald-700" },
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

export default function CampaignTable({ isLoading, data, watchlist }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("cpv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // CPV thấp = hiệu quả nhất lên đầu
  const [page, setPage] = useState(0);

  const watchlistByEvent = useMemo(() => new Map(watchlist.map((w) => [w.eventName, w])), [watchlist]);
  // Mốc "CPV cao bất thường" cho health badge - chỉ tính trên campaign có cash/views > 0, cùng
  // điều kiện với insight rule "cpv-spread" (lib/api.ts) để 2 nơi không chấm khác nhau.
  const bestCpv = useMemo(() => {
    const eligible = data.filter((c) => c.totalCash > 0 && c.totalViews > 0).map((c) => c.cpv);
    return eligible.length > 0 ? Math.min(...eligible) : 0;
  }, [data]);

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

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [data, sortKey, sortDir]);

  const paged = useMemo(() => sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [sorted, page]);

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
      <p className="mb-3 text-xs text-gray-400">Mặc định sắp theo CPV tăng dần - campaign hiệu quả nhất trên mỗi đồng ở trên cùng.</p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Tình trạng</th>
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
                  <td colSpan={COLUMNS.length + 1} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              paged.map((row) => {
                const health = HEALTH_META[computeCampaignHealth(row, watchlistByEvent, bestCpv)];
                return (
                  <tr key={row.eventId} className="border-t border-gray-100">
                    <td className="whitespace-nowrap py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${health.className}`}>
                        {health.label}
                      </span>
                    </td>
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
                );
              })}

            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="py-6 text-center text-sm text-gray-400">
                  Không có campaign nào trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && sorted.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {page * PAGE_SIZE + 1}-{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} / {sorted.length} campaign
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              ← Trước
            </button>
            <span>
              Trang {page + 1}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
