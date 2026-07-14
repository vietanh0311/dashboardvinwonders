"use client";

import { useMemo } from "react";
import { WEEKDAY_LABELS, formatNumber, type HeatmapCell } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: HeatmapCell[];
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function cellColor(intensity: number) {
  if (intensity <= 0) return "#f3f4f6"; // xám nhạt - không có dữ liệu
  // nội suy từ xanh nhạt -> xanh đậm theo cường độ 0..1
  const alpha = 0.12 + intensity * 0.78;
  return `rgba(5, 150, 105, ${alpha.toFixed(2)})`;
}

export default function PublishHeatmap({ isLoading, data }: Props) {
  const { grid, best, maxAvg } = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    data.forEach((c) => map.set(`${c.dayOfWeek}-${c.hour}`, c));
    const withData = data.filter((c) => c.videos > 0);
    const maxAvgViews = withData.reduce((m, c) => Math.max(m, c.avgViews), 0);
    const bestCell = withData.length > 0 ? [...withData].sort((a, b) => b.avgViews - a.avgViews)[0] : null;
    return { grid: map, best: bestCell, maxAvg: maxAvgViews };
  }, [data]);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-gray-800">Heatmap giờ đăng x thứ trong tuần</h3>

      {!isLoading && best && (
        <p className="mb-3 text-sm text-gray-600">
          Đăng lúc tốt nhất:{" "}
          <span className="font-bold text-emerald-700">
            {best.hour}h {WEEKDAY_LABELS[best.dayOfWeek]}
          </span>{" "}
          (avg {formatNumber(best.avgViews)} views/video, {formatNumber(best.videos)} video mẫu).
        </p>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : maxAvg === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[2px] text-xs">
            <thead>
              <tr>
                <th className="w-14" />
                {HOURS.map((h) => (
                  <th key={h} className="w-6 pb-1 text-center font-normal text-gray-400">
                    {h % 3 === 0 ? h : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAY_LABELS.map((label, dayIdx) => (
                <tr key={label}>
                  <td className="whitespace-nowrap pr-2 text-right text-gray-500">{label}</td>
                  {HOURS.map((h) => {
                    const cell = grid.get(`${dayIdx}-${h}`);
                    const intensity = cell && maxAvg > 0 ? cell.avgViews / maxAvg : 0;
                    return (
                      <td
                        key={h}
                        title={
                          cell && cell.videos > 0
                            ? `${label} ${h}h — ${formatNumber(cell.videos)} video, avg ${formatNumber(cell.avgViews)} views`
                            : `${label} ${h}h — chưa có video`
                        }
                        className="h-6 w-6 rounded-sm"
                        style={{ backgroundColor: cellColor(intensity) }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
