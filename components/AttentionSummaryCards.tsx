"use client";

import { formatNumber } from "@/lib/api";

type Props = {
  isLoading: boolean;
  engagementRiskCount: number;
  campaignsOverCapCount: number;
  campaignsEndingSoonCount: number;
  creatorAttentionCount: number;
  anomalyCount: number;
};

export default function AttentionSummaryCards({
  isLoading,
  engagementRiskCount,
  campaignsOverCapCount,
  campaignsEndingSoonCount,
  creatorAttentionCount,
  anomalyCount,
}: Props) {
  const cards = [
    {
      label: "Video vi phạm tương tác",
      value: formatNumber(engagementRiskCount),
      hint: "Dưới chuẩn tối thiểu theo thể lệ",
      alert: engagementRiskCount > 0,
    },
    {
      label: "Campaign vượt cap đối soát",
      value: formatNumber(campaignsOverCapCount),
      hint: "Có video vượt cap views/video",
      alert: campaignsOverCapCount > 0,
    },
    {
      label: "Campaign sắp/vừa kết thúc",
      value: formatNumber(campaignsEndingSoonCount),
      hint: "Còn ≤7 ngày hoặc kết thúc ≤14 ngày trước",
      alert: campaignsEndingSoonCount > 0,
    },
    {
      label: "Creator cần chú ý",
      value: formatNumber(creatorAttentionCount),
      hint: "Vướng thanh toán hoặc ngôi sao im hơi",
      alert: creatorAttentionCount > 0,
    },
    {
      label: "Video nghi bất thường",
      value: formatNumber(anomalyCount),
      hint: "Nghi mua view - xem chi tiết ở Signals",
      alert: anomalyCount > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {isLoading &&
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />
        ))}

      {!isLoading &&
        cards.map((card) => (
          <div
            key={card.label}
            className={`flex flex-col justify-between rounded-xl border p-4 shadow-sm ${
              card.alert ? "border-amber-200 bg-amber-50/60" : "border-emerald-100 bg-white"
            }`}
          >
            <span className="text-sm font-medium text-gray-500">{card.label}</span>
            <span className={`mt-2 text-2xl font-semibold ${card.alert ? "text-amber-700" : "text-emerald-900"}`}>
              {card.value}
            </span>
            <span className="mt-1 text-xs text-gray-400">{card.hint}</span>
          </div>
        ))}
    </div>
  );
}
