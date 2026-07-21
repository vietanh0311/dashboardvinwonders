"use client";

import { formatNumber, formatPercent, type CreatorActivationFunnel } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: CreatorActivationFunnel;
};

type Stage = {
  label: string;
  count: number;
  pctOfTotal: number;
  medianDays: number | null;
};

export default function OnboardingFunnelCard({ isLoading, data }: Props) {
  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />;
  }

  if (data.totalCreators === 0) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-white p-4 text-sm text-gray-400 shadow-sm">
        Chưa đủ dữ liệu lịch sử để tính funnel kích hoạt.
      </div>
    );
  }

  const stages: Stage[] = [
    { label: "Đăng bài #1", count: data.totalCreators, pctOfTotal: 100, medianDays: null },
    {
      label: "Đăng bài #2",
      count: data.reachedPost2,
      pctOfTotal: (data.reachedPost2 / data.totalCreators) * 100,
      medianDays: data.medianDaysToPost2,
    },
    {
      label: "Đăng bài #3",
      count: data.reachedPost3,
      pctOfTotal: (data.reachedPost3 / data.totalCreators) * 100,
      medianDays: data.medianDaysToPost3,
    },
  ];

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Funnel kích hoạt creator</h3>
        <p className="text-xs text-gray-400">
          Tốc độ từ bài đăng đầu tiên tới các bài tiếp theo - chưa đo được mốc đăng ký (xem TODO trong code)
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-xs font-medium text-gray-500">{stage.label}</div>
            <div className="h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.max(2, stage.pctOfTotal)}%` }}
              />
            </div>
            <div className="w-28 shrink-0 text-right text-xs text-gray-600">
              {formatNumber(stage.count)} ({formatPercent(stage.pctOfTotal)})
            </div>
            {i > 0 && (
              <div className="w-32 shrink-0 text-right text-xs text-gray-400">
                {stage.medianDays !== null ? `TB ${stage.medianDays} ngày` : "-"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
