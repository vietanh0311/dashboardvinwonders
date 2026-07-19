"use client";

import { useMemo, useState } from "react";
import { SOURCE_META } from "@/components/DailyChart";
import {
  WEEKDAY_LABELS,
  dominantHeatmapSource,
  formatNumber,
  pickBestHeatmapCell,
  type ContentSource,
  type HeatmapCell,
  type SourceHeatmap,
} from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: HeatmapCell[]; // heatmap gộp mọi nền tảng - dữ liệu cho tab "Tất cả"
  bySource: SourceHeatmap[]; // heatmap tách riêng theo từng nền tảng - 1 tab/nền tảng
  // Tên campaign đang được lọc ở ContentFilters của trang (filters.eventName) - undefined
  // nghĩa là đang xem gộp mọi campaign, hiển thị để người dùng biết khuyến nghị bên dưới đang
  // tính trên phạm vi nào.
  campaignLabel?: string;
};

type TabKey = ContentSource | "all";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function cellColor(intensity: number) {
  if (intensity <= 0) return "#f3f4f6"; // xám nhạt - không có dữ liệu
  // nội suy từ xanh nhạt -> xanh đậm theo cường độ 0..1
  const alpha = 0.12 + intensity * 0.78;
  return `rgba(5, 150, 105, ${alpha.toFixed(2)})`;
}

function slotLabel(cell: HeatmapCell) {
  return `${cell.hour}h ${WEEKDAY_LABELS[cell.dayOfWeek]}`;
}

export default function PublishHeatmap({ isLoading, data, bySource, campaignLabel }: Props) {
  const [tab, setTab] = useState<TabKey>("all");
  // Nếu nền tảng đang chọn không còn trong dữ liệu (đổi filter/range) thì rơi về "all" thay vì
  // hiển thị tab rỗng.
  const activeTab: TabKey = tab === "all" || bySource.some((s) => s.source === tab) ? tab : "all";

  const active = useMemo(() => {
    if (activeTab === "all") {
      const totalVideos = data.reduce((sum, c) => sum + c.videos, 0);
      const best = pickBestHeatmapCell(data);
      return { cells: data, best, totalVideos, dominant: dominantHeatmapSource(best), label: null as string | null };
    }
    const found = bySource.find((s) => s.source === activeTab);
    return {
      cells: found?.cells ?? [],
      best: found?.best ?? null,
      totalVideos: found?.totalVideos ?? 0,
      dominant: null as ContentSource | null,
      label: SOURCE_META[activeTab]?.label ?? activeTab,
    };
  }, [activeTab, data, bySource]);

  const { grid, maxAvg } = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    active.cells.forEach((c) => map.set(`${c.dayOfWeek}-${c.hour}`, c));
    const maxAvgViews = active.cells.reduce((m, c) => Math.max(m, c.avgViews), 0);
    return { grid: map, maxAvg: maxAvgViews };
  }, [active.cells]);

  const totalVideosAll = useMemo(() => data.reduce((sum, c) => sum + c.videos, 0), [data]);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-gray-800">Heatmap giờ đăng x thứ trong tuần</h3>
        <span className="text-xs text-gray-400">
          Phạm vi: {campaignLabel ? `chiến dịch "${campaignLabel}"` : "tất cả chiến dịch"}
        </span>
      </div>

      {!isLoading && bySource.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="text-gray-400">Khung giờ vàng theo nền tảng:</span>
          {bySource.map((s) => (
            <span key={s.source} className="inline-flex items-center gap-1 text-gray-600">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SOURCE_META[s.source]?.color ?? "#9ca3af" }}
              />
              <span className="font-medium">{SOURCE_META[s.source]?.label ?? s.source}:</span>
              {s.best ? <span>{slotLabel(s.best)}</span> : <span className="text-gray-400">chưa đủ dữ liệu</span>}
            </span>
          ))}
        </div>
      )}

      {!isLoading && (data.length > 0 || bySource.length > 0) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTab === "all" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Tất cả ({formatNumber(totalVideosAll)})
          </button>
          {bySource.map((s) => (
            <button
              key={s.source}
              type="button"
              onClick={() => setTab(s.source)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeTab === s.source ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {SOURCE_META[s.source]?.label ?? s.source} ({formatNumber(s.totalVideos)})
            </button>
          ))}
        </div>
      )}

      {!isLoading && active.best && (
        <p className="mb-3 text-sm text-gray-600">
          Đăng lúc tốt nhất{active.label ? ` cho ${active.label}` : ""}:{" "}
          <span className="font-bold text-emerald-700">{slotLabel(active.best)}</span>{" "}
          (avg {formatNumber(active.best.avgViews)} views/video, {formatNumber(active.best.videos)} video mẫu)
          {active.dominant && <> - chủ yếu từ {SOURCE_META[active.dominant]?.label ?? active.dominant}</>}.
        </p>
      )}

      {!isLoading && !active.best && active.totalVideos > 0 && (
        <p className="mb-3 text-sm text-gray-400">
          Chưa đủ dữ liệu để xác định khung giờ vàng đáng tin cậy{active.label ? ` cho ${active.label}` : ""} (cần
          ≥3 video và có ghi nhận views ở cùng 1 khung giờ) - xem tạm heatmap bên dưới hoặc gộp thêm khoảng thời
          gian.
        </p>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : active.totalVideos === 0 ? (
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
                    const breakdown =
                      activeTab === "all" && cell?.bySource
                        ? ` (${Object.entries(cell.bySource)
                            .sort((a, b) => b[1] - a[1])
                            .map(([src, count]) => `${SOURCE_META[src as ContentSource]?.label ?? src} ${count}`)
                            .join(", ")})`
                        : "";
                    return (
                      <td
                        key={h}
                        title={
                          cell && cell.videos > 0
                            ? `${label} ${h}h - ${formatNumber(cell.videos)} video, avg ${formatNumber(
                                cell.avgViews
                              )} views${breakdown}`
                            : `${label} ${h}h - chưa có video`
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
