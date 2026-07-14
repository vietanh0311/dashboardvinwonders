"use client";

import { SOURCE_META } from "@/components/DailyChart";
import { formatNumber, formatPercent, type SourceComparison } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: SourceComparison[];
};

export default function SourceComparisonTable({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">So sánh nền tảng</h3>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="h-2 w-2 rounded-full bg-red-100 ring-1 ring-red-300" /> % video cao nhưng % views thấp
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Nền tảng</th>
              <th className="pb-2 pr-3 font-medium">Video</th>
              <th className="pb-2 pr-3 font-medium">% Video</th>
              <th className="pb-2 pr-3 font-medium">Views</th>
              <th className="pb-2 pr-3 font-medium">% Views</th>
              <th className="pb-2 pr-3 font-medium">Avg views/video</th>
              <th className="pb-2 font-medium">Engagement</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              data.map((row) => (
                <tr
                  key={row.source}
                  className={`border-t border-gray-100 ${row.wastefulEffort ? "bg-red-50/70" : ""}`}
                >
                  <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">
                    {SOURCE_META[row.source]?.label ?? row.source}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatPercent(row.videoPct)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalViews)}</td>
                  <td className={`whitespace-nowrap py-2 pr-3 ${row.wastefulEffort ? "font-semibold text-red-600" : "text-gray-600"}`}>
                    {formatPercent(row.viewPct)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.avgViewsPerVideo)}</td>
                  <td className="whitespace-nowrap py-2 text-gray-600">{formatPercent(row.engagementRate * 100)}</td>
                </tr>
              ))}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-gray-400">
                  Không có dữ liệu cho khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
