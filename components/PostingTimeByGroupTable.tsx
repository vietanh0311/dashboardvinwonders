"use client";

import { useState } from "react";
import { WEEKDAY_LABELS, formatNumber, type PostingTimeGroup } from "@/lib/api";

type Props = {
  isLoading: boolean;
  byFacility: PostingTimeGroup[];
  byTier: PostingTimeGroup[];
};

type TabKey = "facility" | "tier";

function slotLabel(group: PostingTimeGroup): string {
  if (!group.best) return "Chưa đủ dữ liệu";
  return `${group.best.hour}h ${WEEKDAY_LABELS[group.best.dayOfWeek]}`;
}

function liftPct(group: PostingTimeGroup): number | null {
  if (!group.best || group.avgViews <= 0) return null;
  return ((group.best.avgViews - group.avgViews) / group.avgViews) * 100;
}

export default function PostingTimeByGroupTable({ isLoading, byFacility, byTier }: Props) {
  const [tab, setTab] = useState<TabKey>("facility");
  const rows = tab === "facility" ? byFacility : byTier;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Khung giờ vàng theo cơ sở/tier</h3>
          <p className="text-xs text-gray-400">Khuyến nghị giờ đăng tốt nhất - khác heatmap theo nền tảng ở /campaigns</p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("facility")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              tab === "facility" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Theo cơ sở
          </button>
          <button
            type="button"
            onClick={() => setTab("tier")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              tab === "tier" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Theo tier
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">{tab === "facility" ? "Cơ sở" : "Tier"}</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Khung giờ vàng</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Avg views (khung giờ)</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Lift vs TB nhóm</th>
                <th className="pb-2 font-medium">Mẫu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lift = liftPct(row);
                return (
                  <tr key={row.key} className="border-t border-gray-100">
                    <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.label}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {row.best ? (
                        <span className="font-semibold text-emerald-700">{slotLabel(row)}</span>
                      ) : (
                        <span className="text-gray-300">Chưa đủ dữ liệu</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {row.best ? formatNumber(row.best.avgViews) : "-"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {lift !== null && lift > 0 ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          +{lift.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-gray-600">
                      {row.best ? `${formatNumber(row.best.videos)} video` : `${formatNumber(row.totalVideos)} video`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
