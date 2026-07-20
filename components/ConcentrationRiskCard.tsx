"use client";

import { formatNumber, type ConcentrationTrend } from "@/lib/api";

type Props = {
  isLoading: boolean;
  trend: ConcentrationTrend;
};

// goodDirection: chiều mà delta được coi là "tốt lên" - 2 tile này ngược chiều nhau (xem
// ConcentrationTrend trong lib/api.ts), nên không thể dùng chung 1 quy tắc "dương = tốt".
function DeltaChip({ deltaPct, goodDirection }: { deltaPct: number; goodDirection: "up" | "down" }) {
  const rounded = Math.round(deltaPct * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Không đổi</span>;
  }

  const isIncrease = rounded > 0;
  const isGood = isIncrease ? goodDirection === "up" : goodDirection === "down";
  const arrow = isIncrease ? "▲" : "▼";
  const colorClass = isGood ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {arrow} {Math.abs(rounded).toFixed(1)} điểm % so với kỳ trước
    </span>
  );
}

export default function ConcentrationRiskCard({ isLoading, trend }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />
        <div className="h-28 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />
      </div>
    );
  }

  const { current, hasPreviousData, shareDeltaPct, breadthDeltaPct } = trend;

  if (current.totalCreators === 0) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-white p-4 text-sm text-gray-400 shadow-sm">
        Chưa có dữ liệu creator trong khoảng thời gian đã chọn để tính rủi ro phụ thuộc.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        className={`flex flex-col justify-between rounded-xl border p-4 shadow-sm ${
          current.topViewSharePct > 70 ? "border-amber-200 bg-amber-50/60" : "border-emerald-100 bg-white"
        }`}
      >
        <span className="text-sm font-medium text-gray-500">
          Top {current.topCreatorPct}% creator chiếm views
        </span>
        <span className={`mt-2 text-2xl font-semibold ${current.topViewSharePct > 70 ? "text-amber-700" : "text-emerald-900"}`}>
          {current.topViewSharePct.toFixed(1)}%
        </span>
        <span className="mt-1 text-xs text-gray-400">
          {formatNumber(current.topCreatorCount)}/{formatNumber(current.totalCreators)} creator - càng cao càng phụ
          thuộc
        </span>
        <div className="mt-2">
          {hasPreviousData ? (
            <DeltaChip deltaPct={shareDeltaPct} goodDirection="down" />
          ) : (
            <span className="text-xs italic text-gray-300">Chưa đủ dữ liệu kỳ trước để so sánh</span>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-gray-500">Số creator cần để đạt 80% views</span>
        <span className="mt-2 text-2xl font-semibold text-emerald-900">
          {formatNumber(current.creatorsFor80Pct)}
          <span className="ml-1 text-base font-normal text-gray-400">({current.creatorsFor80PctPct.toFixed(1)}%)</span>
        </span>
        <span className="mt-1 text-xs text-gray-400">Càng nhiều/càng cao % càng phân tán, ít phụ thuộc</span>
        <div className="mt-2">
          {hasPreviousData ? (
            <DeltaChip deltaPct={breadthDeltaPct} goodDirection="up" />
          ) : (
            <span className="text-xs italic text-gray-300">Chưa đủ dữ liệu kỳ trước để so sánh</span>
          )}
        </div>
      </div>
    </div>
  );
}
