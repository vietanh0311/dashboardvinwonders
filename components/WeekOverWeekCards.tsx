"use client";

import { formatNumber, formatPercent, type PeriodMetrics } from "@/lib/api";

type MetricKey = "videos" | "views" | "creators" | "avgViewsPerVideo" | "likes" | "comments";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "videos", label: "Videos" },
  { key: "views", label: "Views" },
  { key: "creators", label: "Creators" },
  { key: "avgViewsPerVideo", label: "Views TB/video" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
];

type Props = {
  isLoading: boolean;
  thisWeek: PeriodMetrics;
  lastWeek: PeriodMetrics;
};

export default function WeekOverWeekCards({ isLoading, thisWeek, lastWeek }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-gray-800">So sánh tuần này vs tuần trước</h3>
        <span className="text-xs text-gray-400">
          {thisWeek.from} → {thisWeek.to} so với {lastWeek.from} → {lastWeek.to}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-emerald-50/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {METRICS.map((m) => {
            const cur = thisWeek[m.key];
            const prev = lastWeek[m.key];
            const diffPct = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;
            const up = diffPct >= 0;
            return (
              <div key={m.key} className="rounded-lg border border-gray-100 p-3">
                <div className="text-xs text-gray-500">{m.label}</div>
                <div className="mt-1 text-xl font-bold text-emerald-900">{formatNumber(cur)}</div>
                <div className={`mt-1 text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
                  {up ? "▲" : "▼"} {formatPercent(Math.abs(diffPct))} so với {formatNumber(prev)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
