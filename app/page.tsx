"use client";

import { Suspense, useMemo } from "react";
import useSWR from "swr";
import ContentFilters from "@/components/ContentFilters";
import DailyChart from "@/components/DailyChart";
import DataErrorBanner from "@/components/DataErrorBanner";
import DataUpdateBanner from "@/components/DataUpdateBanner";
import DateRangePicker from "@/components/DateRangePicker";
import InsightsPanel from "@/components/InsightsPanel";
import KpiCards from "@/components/KpiCards";
import { LAST_SYNC_SWR_KEY } from "@/components/LastSyncBadge";
import Nav from "@/components/Nav";
import RefreshIndicator from "@/components/RefreshIndicator";
import TopCreatorsCard from "@/components/TopCreatorsCard";
import TopVideosCard from "@/components/TopVideosCard";
import WeekOverWeekCards from "@/components/WeekOverWeekCards";
import {
  computeCreatorStats,
  computeMetrics,
  computeSourceComparison,
  computeTagAnalysis,
  EMPTY_PERIOD_METRICS,
  fetchContentsSmart,
  fetchLastSync,
  fetchTrends,
  filterContentItems,
  generateDashboardInsights,
  vnDaysAgo,
  vnToday,
  type DateRangeValue,
} from "@/lib/api";
import { useUrlContentFilters, useUrlDateRange } from "@/lib/urlState";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-emerald-50/40" />}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const [range, setRange] = useUrlDateRange(defaultRange);
  const [filters, setFilters] = useUrlContentFilters();

  const { data, error, isValidating, mutate } = useSWR(
    ["vc-contents", range.from, range.to],
    () => fetchContentsSmart(range.from, range.to, false),
    { revalidateOnFocus: false }
  );
  // !data thay vì SWR isLoading: với keepPreviousData bật ở SWRProvider, "data"
  // vẫn giữ kết quả của range trước trong lúc range mới đang tải - dùng !data
  // để bảng/biểu đồ hiện dữ liệu cũ (mờ) thay vì skeleton trắng mỗi lần đổi filter.
  const isLoading = !data;
  // Đang tải range mới nhưng màn hình vẫn là số liệu cũ - bật thanh tiến trình
  // + làm mờ nội dung để người dùng biết dữ liệu đang cập nhật, không phải đơ.
  const isRefreshing = isValidating && !isLoading;

  // Dashboard chỉ sync 1 lần/sáng nên "hôm nay" theo lịch (vnToday()) gần như luôn rỗng - dùng
  // ngày sync gần nhất (đã có sẵn, cùng SWR key với DataUpdateBanner/LastSyncBadge nên không tốn
  // thêm request) làm mốc "ngày gần nhất có dữ liệu" cho KPI card + insight.
  const lastSync = useSWR(LAST_SYNC_SWR_KEY, fetchLastSync, { revalidateOnFocus: false });
  const referenceDate = lastSync.data?.snapshotDate ?? vnToday();

  // Cùng SWR key với /trends (Signals) - dùng chung cache, không tốn thêm request khi 2 trang
  // mở trong cùng phiên. Cần lịch sử snapshot Supabase nên có thể rỗng nếu chưa sync đủ ngày.
  const trends = useSWR("vc-trends", () => fetchTrends(14));

  const filteredData = useMemo(() => filterContentItems(data ?? [], filters), [data, filters]);
  const metrics = useMemo(() => computeMetrics(filteredData), [filteredData]);
  // Không hiển thị bảng riêng cho 2 cái này nữa (xem SourceComparisonTable ở trang Content,
  // TagAnalysisTable ở trang Content) - vẫn phải tính vì generateDashboardInsights cần chúng.
  const sourceComparison = useMemo(() => computeSourceComparison(filteredData), [filteredData]);
  const tagAnalysis = useMemo(() => computeTagAnalysis(filteredData), [filteredData]);
  const creatorStats = useMemo(() => computeCreatorStats(filteredData), [filteredData]);

  const insights = useMemo(
    () => generateDashboardInsights(metrics, sourceComparison, tagAnalysis, filteredData),
    [metrics, sourceComparison, tagAnalysis, filteredData]
  );

  const videosToday = metrics.byDay.find((d) => d.date === referenceDate)?.videos ?? 0;
  const avgViewsPerVideo = metrics.totalVideos > 0 ? metrics.totalViews / metrics.totalVideos : 0;

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  return (
    <main className="min-h-screen bg-emerald-50/40">
      <RefreshIndicator active={isRefreshing} />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Nav />
            <div>
              <h1 className="text-xl font-semibold text-emerald-900">Dashboard V-Creators - VinWonders</h1>
              <p className="text-sm text-gray-500">
                Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <button
              type="button"
              onClick={() => mutate()}
              disabled={isValidating}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
            >
              {isValidating ? "Đang tải..." : "Làm mới"}
            </button>
          </div>
        </header>

        <DataUpdateBanner />

        <ContentFilters items={data ?? []} value={filters} onChange={setFilters} />

        <DataErrorBanner error={error} hasData={!!data} onRetry={() => mutate()} />

        <div
          aria-busy={isRefreshing}
          className={`flex flex-col gap-5 transition-opacity duration-300 ${isRefreshing ? "opacity-60" : "opacity-100"}`}
        >
          <InsightsPanel isLoading={isLoading} insights={insights} />

          <KpiCards
            isLoading={isLoading}
            totalVideos={metrics.totalVideos}
            totalViews={metrics.totalViews}
            uniqueCreators={metrics.uniqueCreators}
            videosToday={videosToday}
            referenceDate={referenceDate}
            avgViewsPerVideo={avgViewsPerVideo}
          />

          <WeekOverWeekCards
            isLoading={!trends.data}
            thisWeek={trends.data?.weekOverWeek?.thisWeek ?? EMPTY_PERIOD_METRICS}
            lastWeek={trends.data?.weekOverWeek?.lastWeek ?? EMPTY_PERIOD_METRICS}
          />

          <DailyChart isLoading={isLoading} byDay={metrics.byDay} bySource={metrics.bySource} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <TopCreatorsCard data={creatorStats} isLoading={isLoading} />
            <TopVideosCard items={filteredData} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </main>
  );
}
