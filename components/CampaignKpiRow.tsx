"use client";

import Link from "next/link";
import {
  formatCurrency,
  formatNumber,
  type CampaignStat,
  type CampaignWatchlistRow,
} from "@/lib/api";

type Props = {
  isLoading: boolean;
  campaigns: CampaignStat[];
  watchlist: CampaignWatchlistRow[];
};

type KpiCard = { label: string; value: string };

function sumBy(campaigns: CampaignStat[], pick: (c: CampaignStat) => number): number {
  return campaigns.reduce((total, c) => total + pick(c), 0);
}

// Hàng KPI tổng quan đầu trang - trả lời "5-10 giây hiểu tình hình" trước khi phải đọc qua
// Insight/bảng/chart bên dưới. Không thêm business logic mới: "cần chú ý" tái dùng thẳng
// computeCampaignWatchlist (đã phục vụ /actions), tránh 2 định nghĩa "cần chú ý" khác nhau.
export default function CampaignKpiRow({ isLoading, campaigns, watchlist }: Props) {
  const totalViews = sumBy(campaigns, (c) => c.totalViews);
  const totalCash = sumBy(campaigns, (c) => c.totalCash);
  // CPV trung bình có trọng số (tổng cash / tổng views) - không phải trung bình cộng của từng
  // CPV/campaign, vì trung bình cộng sẽ bị kéo lệch bởi campaign ít video/ít views.
  const avgCpv = totalViews > 0 ? totalCash / totalViews : 0;
  const needsAttention = watchlist.filter(
    (w) => w.videosOverCap > 0 || (!w.isEnded && w.daysRemaining <= 7)
  ).length;

  const cards: KpiCard[] = [
    { label: "Campaign đang xem", value: formatNumber(campaigns.length) },
    { label: "Tổng views", value: formatNumber(totalViews) },
    { label: "Tổng chi phí", value: formatCurrency(totalCash) },
    { label: "CPV trung bình", value: formatCurrency(avgCpv) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((item) => (
        <div key={item.label} className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-500">{item.label}</div>
          {isLoading ? (
            <div className="mt-1.5 h-6 w-16 animate-pulse rounded bg-emerald-50/60" />
          ) : (
            <div className="mt-1 text-xl font-bold text-emerald-900">{item.value}</div>
          )}
        </div>
      ))}

      <div
        className={`rounded-xl border p-3 shadow-sm ${
          needsAttention > 0 ? "border-red-200 bg-red-50" : "border-emerald-100 bg-white"
        }`}
      >
        <div className="text-xs text-gray-500">Cần chú ý</div>
        {isLoading ? (
          <div className="mt-1.5 h-6 w-16 animate-pulse rounded bg-emerald-50/60" />
        ) : (
          <div
            className={`mt-1 flex items-baseline gap-2 text-xl font-bold ${
              needsAttention > 0 ? "text-red-700" : "text-emerald-900"
            }`}
          >
            {formatNumber(needsAttention)}
            {needsAttention > 0 && (
              <Link href="/actions" className="text-xs font-medium text-red-600 underline underline-offset-2">
                Xem →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
