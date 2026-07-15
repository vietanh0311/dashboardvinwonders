"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import ContentFilters from "@/components/ContentFilters";
import ContentTable from "@/components/ContentTable";
import DailyChart from "@/components/DailyChart";
import DataUpdateBanner from "@/components/DataUpdateBanner";
import DateRangePicker from "@/components/DateRangePicker";
import EventTable from "@/components/EventTable";
import InsightsPanel from "@/components/InsightsPanel";
import KpiCards from "@/components/KpiCards";
import Nav from "@/components/Nav";
import TagTable from "@/components/TagTable";
import {
  computeMetrics,
  computeSourceComparison,
  computeTagAnalysis,
  fetchContentsSmart,
  filterContentItems,
  generateDashboardInsights,
  vnDaysAgo,
  vnToday,
  type ContentFilters as ContentFiltersValue,
  type DateRangeValue,
} from "@/lib/api";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

export default function DashboardPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [filters, setFilters] = useState<ContentFiltersValue>({});

  const { data, error, isValidating, mutate } = useSWR(
    ["vc-contents", range.from, range.to],
    () => fetchContentsSmart(range.from, range.to, false),
    { revalidateOnFocus: false }
  );
  // !data thay vì SWR isLoading: với keepPreviousData bật ở SWRProvider, "data"
  // vẫn giữ kết quả của range trước trong lúc range mới đang tải - dùng !data
  // để bảng/biểu đồ hiện dữ liệu cũ (mờ) thay vì skeleton trắng mỗi lần đổi filter.
  const isLoading = !data;

  const filteredData = useMemo(() => filterContentItems(data ?? [], filters), [data, filters]);
  const metrics = useMemo(() => computeMetrics(filteredData), [filteredData]);
  const sourceComparison = useMemo(() => computeSourceComparison(filteredData), [filteredData]);
  const tagAnalysis = useMemo(() => computeTagAnalysis(filteredData), [filteredData]);

  const daysInRange = useMemo(() => {
    const fromMs = new Date(`${range.from}T00:00:00Z`).getTime();
    const toMs = new Date(`${range.to}T00:00:00Z`).getTime();
    return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
  }, [range.from, range.to]);

  const insights = useMemo(
    () => generateDashboardInsights(metrics, sourceComparison, tagAnalysis, daysInRange),
    [metrics, sourceComparison, tagAnalysis, daysInRange]
  );

  const today = vnToday();
  const videosToday = metrics.byDay.find((d) => d.date === today)?.videos ?? 0;
  const avgViewsPerVideo = metrics.totalVideos > 0 ? metrics.totalViews / metrics.totalVideos : 0;

  const latestContents = useMemo(
    () => [...filteredData].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 100),
    [filteredData]
  );

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  return (
    <main className="min-h-screen bg-emerald-50/40">
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

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Lỗi khi tải dữ liệu: {error instanceof Error ? error.message : "không xác định"}. Có thể Supabase chưa
            được cấu hình hoặc chưa có dữ liệu.
          </div>
        )}

        <InsightsPanel isLoading={isLoading} insights={insights} />

        <KpiCards
          isLoading={isLoading}
          totalVideos={metrics.totalVideos}
          totalViews={metrics.totalViews}
          uniqueCreators={metrics.uniqueCreators}
          videosToday={videosToday}
          avgViewsPerVideo={avgViewsPerVideo}
        />

        <DailyChart isLoading={isLoading} byDay={metrics.byDay} bySource={metrics.bySource} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <EventTable data={metrics.byEvent} isLoading={isLoading} />
          <TagTable data={metrics.byTag} isLoading={isLoading} />
        </div>

        <ContentTable items={latestContents} isLoading={isLoading} />
      </div>
    </main>
  );
}
