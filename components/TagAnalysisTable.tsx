"use client";

import { formatNumber, type TagAnalysis } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: TagAnalysis[];
};

export default function TagAnalysisTable({ isLoading, data }: Props) {
  const sorted = [...data].sort((a, b) => b.videos - a.videos);
  const anomalousCount = sorted.filter((t) => t.isAnomalous).length;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Phân tích tag</h3>
        {anomalousCount > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
            {anomalousCount} tag tăng đột biến tuần này
          </span>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Tag</th>
              <th className="pb-2 pr-3 font-medium">Video</th>
              <th className="pb-2 pr-3 font-medium">Avg views</th>
              <th className="pb-2 font-medium">Tuần này</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={4} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              sorted.map((row) => (
                <tr key={row.name} className={`border-t border-gray-100 ${row.isAnomalous ? "bg-red-50/70" : ""}`}>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.isAnomalous ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {row.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.avgViews)}</td>
                  <td className={`whitespace-nowrap py-2 ${row.isAnomalous ? "font-semibold text-red-600" : "text-gray-600"}`}>
                    {formatNumber(row.thisWeekVideos)} video
                    {row.isAnomalous && " ⚠"}
                  </td>
                </tr>
              ))}

            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-gray-400">
                  Không có tag nào trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
