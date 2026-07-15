"use client";

import { formatNumber } from "@/lib/api";

type Props = {
  isLoading: boolean;
  totalVideos: number;
  totalViews: number;
  uniqueCreators: number;
  videosToday: number;
  // Ngày sync gần nhất (yyyy-MM-dd) - dashboard chỉ sync 1 lần/sáng nên "hôm nay" thật ra là
  // ngày dữ liệu đã có, không phải ngày lịch hiện tại.
  referenceDate: string;
  avgViewsPerVideo: number;
};

export default function KpiCards({
  isLoading,
  totalVideos,
  totalViews,
  uniqueCreators,
  videosToday,
  referenceDate,
  avgViewsPerVideo,
}: Props) {
  const [y, m, d] = referenceDate.split("-");
  const referenceDateLabel = y && m && d ? `${d}/${m}` : referenceDate;

  const cards = [
    { label: "Tổng videos", value: formatNumber(totalVideos), hint: "Trong khoảng thời gian đã chọn" },
    { label: "Tổng views", value: formatNumber(totalViews), hint: "Tổng lượt xem" },
    { label: "Số creators", value: formatNumber(uniqueCreators), hint: "Creator có video (duy nhất)" },
    {
      label: `Videos ngày ${referenceDateLabel}`,
      value: formatNumber(videosToday),
      hint: "Ngày gần nhất có dữ liệu sync (giờ VN)",
    },
    { label: "Views TB/video", value: formatNumber(avgViewsPerVideo), hint: "Trung bình lượt xem mỗi video" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {isLoading &&
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />
        ))}

      {!isLoading &&
        cards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col justify-between rounded-xl border border-emerald-100 bg-white p-4 shadow-sm"
          >
            <span className="text-sm font-medium text-gray-500">{card.label}</span>
            <span className="mt-2 text-2xl font-semibold text-emerald-900">{card.value}</span>
            <span className="mt-1 text-xs text-gray-400">{card.hint}</span>
          </div>
        ))}
    </div>
  );
}
