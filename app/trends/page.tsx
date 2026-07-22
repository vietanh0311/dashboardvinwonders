"use client";

import useSWR from "swr";
import AnomalyTable from "@/components/AnomalyTable";
import DailyViewsChart from "@/components/DailyViewsChart";
import InsightsPanel from "@/components/InsightsPanel";
import Nav from "@/components/Nav";
import VelocityTable from "@/components/VelocityTable";
import { EMPTY_PERIOD_METRICS, fetchAnomalies, fetchTrends, formatNumber, formatPercent } from "@/lib/api";

export default function TrendsPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR("vc-trends", () => fetchTrends(14));
  const anomalies = useSWR("vc-anomalies", () => fetchAnomalies(14));

  const insights: string[] = [];
  if (data) {
    // Không destructure trực tiếp data.weekOverWeek - phòng trường hợp response
    // thiếu field dù fetchTrends() đã có fallback, tránh throw khi render.
    const thisWeek = data.weekOverWeek?.thisWeek ?? EMPTY_PERIOD_METRICS;
    const lastWeek = data.weekOverWeek?.lastWeek ?? EMPTY_PERIOD_METRICS;
    if (lastWeek.views > 0) {
      const diff = ((thisWeek.views - lastWeek.views) / lastWeek.views) * 100;
      insights.push(
        `Views tuần này ${diff >= 0 ? "tăng" : "giảm"} ${formatPercent(Math.abs(diff))} so với tuần trước (${formatNumber(
          thisWeek.views
        )} vs ${formatNumber(lastWeek.views)}).`
      );
    }
    if (lastWeek.videos > 0) {
      const diff = ((thisWeek.videos - lastWeek.videos) / lastWeek.videos) * 100;
      if (Math.abs(diff) >= 15) {
        insights.push(
          `Số video tuần này ${diff >= 0 ? "tăng" : "giảm"} ${formatPercent(Math.abs(diff))} so với tuần trước.`
        );
      }
    }
    const velocity = Array.isArray(data.velocity) ? data.velocity : [];
    if (velocity.length > 0) {
      const top = velocity[0];
      insights.push(
        `"${top.title || "(không có tiêu đề)"}" đang tăng nhanh nhất: +${formatNumber(
          top.deltaViews
        )} views trong ~${top.deltaHours.toFixed(0)}h gần nhất (creator: ${top.creatorName}).`
      );
    }
  }
  if (anomalies.data && anomalies.data.videos.length > 0) {
    const topAnomaly = anomalies.data.videos[0];
    insights.push(
      `"${topAnomaly.title || "(không có tiêu đề)"}" (creator: ${topAnomaly.creatorName}) có dấu hiệu bất thường điểm ${topAnomaly.score}/100 ngày ${topAnomaly.snapshotDate} - xem bảng bên dưới, chỉ để tham khảo.`
    );
  }

  return (
    <main className="min-h-screen bg-emerald-50/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Nav />
            <div>
              <h1 className="text-xl font-semibold text-emerald-900">Signals - VinWonders</h1>
              <p className="text-sm text-gray-500">
                View velocity thật &amp; dấu hiệu bất thường - chỉ có được nhờ lịch sử đã sync vào Supabase.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              mutate();
              anomalies.mutate();
            }}
            disabled={isValidating}
            className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
          >
            {isValidating ? "Đang tải..." : "Làm mới"}
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Lỗi khi tải dữ liệu: {error instanceof Error ? error.message : "không xác định"}. Trang này cần đã bấm{" "}
            &quot;Cập nhật dữ liệu&quot; (ở Dashboard/Creators/Campaigns) ít nhất 2 lần vào 2 ngày khác nhau để có đủ
            lịch sử, và Supabase phải được cấu hình đúng (SUPABASE_URL/SUPABASE_SERVICE_KEY).
          </div>
        )}

        <InsightsPanel isLoading={isLoading} insights={insights} />

        <DailyViewsChart isLoading={isLoading} data={Array.isArray(data?.dailyTotals) ? data.dailyTotals : []} />

        <VelocityTable isLoading={isLoading} data={Array.isArray(data?.velocity) ? data.velocity : []} />

        <AnomalyTable
          isLoading={anomalies.isLoading}
          data={anomalies.data?.videos ?? []}
          windowDays={anomalies.data?.windowDays ?? 14}
        />
      </div>
    </main>
  );
}
