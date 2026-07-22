"use client";

import { useMemo, useState } from "react";
import CopyTableButton from "@/components/CopyTableButton";
import { formatCurrency, formatNumber, formatPercent, type FacilityScorecardRow, type FacilityTrend } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: FacilityScorecardRow[];
};

const COPY_HEADERS = ["#", "Cơ sở", "Điểm", "Xu hướng", "Creator", "Videos", "Views TB/video", "Engagement (%)", "CPV"];

const TREND_META: Record<FacilityTrend, { label: string; className: string }> = {
  new: { label: "Mới nổi", className: "bg-emerald-50 text-emerald-700" },
  improving: { label: "▲ Tăng", className: "bg-emerald-50 text-emerald-700" },
  declining: { label: "▼ Giảm", className: "bg-red-50 text-red-700" },
  steady: { label: "Ổn định", className: "bg-gray-100 text-gray-500" },
};

function TrendChip({ row }: { row: FacilityScorecardRow }) {
  const meta = TREND_META[row.trend];
  const pctLabel =
    row.trend === "new" || !Number.isFinite(row.viewsDeltaPct)
      ? ""
      : ` ${Math.abs(Math.round(row.viewsDeltaPct))}%`;
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
      {pctLabel}
    </span>
  );
}

export default function FacilityScorecard({ isLoading, data }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? data : data.slice(0, 8);

  const copyRows = useMemo(
    () =>
      data.map((row) => [
        row.rank,
        row.unitName,
        row.score,
        TREND_META[row.trend].label,
        row.creators,
        row.videos,
        Math.round(row.avgViewsPerVideo),
        `${(row.engagementRate * 100).toFixed(2)}%`,
        Number(row.cpv.toFixed(2)),
      ]),
    [data]
  );

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Bảng điểm cơ sở</h3>
          <p className="text-xs text-gray-400">
            Điểm tổng hợp (views TB/video, engagement, hiệu quả CPV) + xu hướng so với kỳ 30 ngày trước
          </p>
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
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400">
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">#</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Cơ sở</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Điểm</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Xu hướng</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Creator</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Views TB/video</th>
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Engagement</th>
                  <th className="pb-2 font-medium">CPV</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.unitName} className="border-t border-gray-100">
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-400">
                      {row.rank === 1 ? "🏆" : row.rank}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.unitName}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-semibold text-emerald-700">{row.score}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <TrendChip row={row} />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.creators)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {formatNumber(row.avgViewsPerVideo)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {formatPercent(row.engagementRate * 100)}
                    </td>
                    <td className="whitespace-nowrap py-2 text-gray-600">
                      {row.hasCashData ? row.cpv.toFixed(2) : <span className="text-gray-300">-</span>}
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
              {expanded ? "Thu gọn" : `Xem tất cả ${formatNumber(data.length)} cơ sở`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
