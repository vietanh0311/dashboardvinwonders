"use client";

import { useMemo, useState } from "react";
import CopyTableButton from "@/components/CopyTableButton";
import { formatNumber, formatPercent, type TagPerformanceRow } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: TagPerformanceRow[];
};

const COPY_HEADERS = ["Tag", "Videos", "Avg views", "Lift vs TB chung", "Engagement (%)", "Độ tin cậy"];

export default function TagPerformanceRankingTable({ isLoading, data }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? data : data.slice(0, 8);

  const copyRows = useMemo(
    () =>
      data.map((row) => [
        row.name,
        row.videos,
        Math.round(row.avgViews),
        `${row.liftVsOverallPct >= 0 ? "+" : ""}${row.liftVsOverallPct.toFixed(1)}%`,
        `${(row.engagementRate * 100).toFixed(2)}%`,
        row.confidence === "high" ? "Đủ mẫu" : "Mẫu nhỏ",
      ]),
    [data]
  );

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Xếp hạng hiệu quả theo tag/nội dung</h3>
          <p className="text-xs text-gray-400">Sắp theo avg views/video - nội dung nào nên đẩy mạnh, nội dung nào nên giảm</p>
        </div>
        <CopyTableButton headers={COPY_HEADERS} rows={copyRows} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Không có tag nào trong khoảng thời gian đã chọn.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400">
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Tag</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Videos</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Avg views</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Lift vs TB chung</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Engagement</th>
                  <th className="pb-2 font-medium">Độ tin cậy</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.name} className="border-t border-gray-100">
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {row.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.avgViews)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.liftVsOverallPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {row.liftVsOverallPct >= 0 ? "▲" : "▼"} {Math.abs(row.liftVsOverallPct).toFixed(0)}%
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {formatPercent(row.engagementRate * 100)}
                    </td>
                    <td className="whitespace-nowrap py-2 text-gray-600">
                      {row.confidence === "low" ? (
                        <span
                          title="Dưới 5 video - kết quả có thể chưa ổn định"
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                        >
                          Mẫu nhỏ
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 8 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              {expanded ? "Thu gọn" : `Xem tất cả ${formatNumber(data.length)} tag`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
