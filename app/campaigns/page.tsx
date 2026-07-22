"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import CampaignKpiRow from "@/components/CampaignKpiRow";
import CampaignLifecycleChart from "@/components/CampaignLifecycleChart";
import CampaignTable from "@/components/CampaignTable";
import CampaignTopCreatorsTable from "@/components/CampaignTopCreatorsTable";
import ContentFilters from "@/components/ContentFilters";
import DataUpdateBanner from "@/components/DataUpdateBanner";
import DateRangePicker from "@/components/DateRangePicker";
import InsightsPanel from "@/components/InsightsPanel";
import { LAST_SYNC_SWR_KEY } from "@/components/LastSyncBadge";
import DataErrorBanner from "@/components/DataErrorBanner";
import Nav from "@/components/Nav";
import RefreshIndicator from "@/components/RefreshIndicator";
import PublishHeatmap from "@/components/PublishHeatmap";
import SourceComparisonTable from "@/components/SourceComparisonTable";
import TagAnalysisTable from "@/components/TagAnalysisTable";
import TagPerformanceRankingTable from "@/components/TagPerformanceRankingTable";
import TopVideosCard from "@/components/TopVideosCard";
import ViewDistributionPanel from "@/components/ViewDistributionPanel";
import {
  computeCampaignLifecycle,
  computeCampaignMomentum,
  computeCampaignStats,
  computeCampaignWatchlist,
  computePublishHeatmap,
  computePublishHeatmapBySource,
  computeSourceComparison,
  computeTagAnalysis,
  computeTagPerformanceRanking,
  computeViewDistribution,
  fetchContentsSmart,
  fetchEventsSmart,
  fetchLastSync,
  filterContentItems,
  generateCampaignInsights,
  vnDaysAgo,
  vnToday,
  type DateRangeValue,
} from "@/lib/api";
import { useUrlContentFilters, useUrlDateRange } from "@/lib/urlState";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

const LIFECYCLE_LOOKBACK_DAYS = 89; // 90 ngày kể cả hôm nay

export default function CampaignsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-emerald-50/40" />}>
      <CampaignsPageInner />
    </Suspense>
  );
}

function CampaignsPageInner() {
  const [range, setRange] = useUrlDateRange(defaultRange);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [filters, setFilters] = useUrlContentFilters();

  const content = useSWR(["vc-contents", range.from, range.to], () =>
    fetchContentsSmart(range.from, range.to, false)
  );

  const eventsList = useSWR("vc-events-list", () => fetchEventsSmart(false, LIFECYCLE_LOOKBACK_DAYS + 1));

  // Suy eventId đang lọc ở ContentFilters (theo tên) để đồng bộ mặc định cho Lifecycle Chart +
  // Top Creators Table bên dưới - không bắt người dùng chọn lại đúng campaign đã lọc ở trên.
  // Effect chỉ SET GIÁ TRỊ MẶC ĐỊNH mỗi khi filter chung đổi; selectedEventId vẫn tự do đổi riêng
  // sau đó (vd xem lifecycle của 1 campaign khác mà không đổi filter chung của cả trang).
  const syncedEventId = useMemo(
    () => eventsList.data?.find((ev) => ev.name === filters.eventName)?._id,
    [eventsList.data, filters.eventName]
  );
  useEffect(() => {
    if (syncedEventId) setSelectedEventId(syncedEventId);
  }, [syncedEventId]);

  // Ngày sync gần nhất - dùng làm mốc "hôm nay" cho countdown campaign/insight thay vì
  // vnToday() thật (dashboard chỉ sync 1 lần/sáng, xem lib/api.ts generateCampaignInsights).
  const lastSync = useSWR(LAST_SYNC_SWR_KEY, fetchLastSync, { revalidateOnFocus: false });
  const referenceDate = lastSync.data?.snapshotDate ?? vnToday();

  const lifecycleFrom = vnDaysAgo(LIFECYCLE_LOOKBACK_DAYS);
  const lifecycleTo = vnToday();
  const lifecycleFetch = useSWR(selectedEventId ? ["vc-contents-lifecycle", selectedEventId] : null, () =>
    fetchContentsSmart(lifecycleFrom, lifecycleTo, false, { event: selectedEventId })
  );

  // !content.data thay vì content.isLoading: giữ dữ liệu range trước hiển thị
  // (nhờ keepPreviousData ở SWRProvider) thay vì skeleton trắng mỗi lần đổi
  // filter/date range - chỉ true ở lần tải đầu tiên khi chưa có data nào.
  const isLoading = !content.data;
  const isValidating = content.isValidating;
  const error = content.error ?? eventsList.error;
  // Đang tải range mới nhưng màn hình vẫn là số liệu cũ - bật thanh tiến trình
  // + làm mờ nội dung để người dùng biết dữ liệu đang cập nhật, không phải đơ.
  const isRefreshing = isValidating && !isLoading;

  const rawItems = useMemo(() => content.data ?? [], [content.data]);
  const items = useMemo(() => filterContentItems(rawItems, filters), [rawItems, filters]);

  const viewDist = useMemo(() => computeViewDistribution(items), [items]);
  const heatmap = useMemo(() => computePublishHeatmap(items), [items]);
  const heatmapBySource = useMemo(() => computePublishHeatmapBySource(items), [items]);
  const sourceComparison = useMemo(() => computeSourceComparison(items), [items]);
  const campaignStats = useMemo(() => computeCampaignStats(items), [items]);
  const tagAnalysis = useMemo(() => computeTagAnalysis(items), [items]);
  const tagPerformance = useMemo(() => computeTagPerformanceRanking(items), [items]);
  // Cap-risk + countdown theo từng campaign - cùng logic đang phục vụ /actions (CampaignWatchlistTable),
  // dùng ở đây cho KPI "Cần chú ý" và health badge trên CampaignTable.
  const watchlist = useMemo(() => computeCampaignWatchlist(items, referenceDate), [items, referenceDate]);

  const insights = useMemo(
    () => generateCampaignInsights(campaignStats, heatmap, viewDist, tagAnalysis, items, referenceDate),
    [campaignStats, heatmap, viewDist, tagAnalysis, items, referenceDate]
  );

  const lifecycle = useMemo(
    () => computeCampaignLifecycle(lifecycleFetch.data ?? []),
    [lifecycleFetch.data]
  );
  const momentum = useMemo(() => computeCampaignMomentum(lifecycle), [lifecycle]);

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;

  const refresh = () => {
    content.mutate();
    eventsList.mutate();
    if (selectedEventId) lifecycleFetch.mutate();
  };

  return (
    <main className="min-h-screen bg-emerald-50/40">
      <RefreshIndicator active={isRefreshing} />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2">
          <Nav />
          <div>
            <h1 className="text-xl font-semibold text-emerald-900">Content - VinWonders</h1>
            <p className="text-sm text-gray-500">
              Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span> · nguồn, campaign,
              tag, giờ đăng - tối ưu sản xuất &amp; phân bổ nội dung.
            </p>
          </div>
        </header>

        {/* Sticky: date range + filter là thứ người dùng cần đổi liên tục khi cuộn qua 8+ khối
            nội dung bên dưới - giữ cố định để không phải cuộn lên lại mỗi lần muốn lọc khác. */}
        <div className="sticky top-2 z-30 flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <button
              type="button"
              onClick={refresh}
              disabled={isValidating}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
            >
              {isValidating ? "Đang tải..." : "Làm mới"}
            </button>
          </div>
          <ContentFilters items={rawItems} value={filters} onChange={setFilters} />
        </div>

        <DataUpdateBanner />

        <DataErrorBanner error={error} hasData={!isLoading} onRetry={refresh} />

        <div
          aria-busy={isRefreshing}
          className={`flex flex-col gap-5 transition-opacity duration-300 ${isRefreshing ? "opacity-60" : "opacity-100"}`}
        >
          {/* KPI tổng quan lên đầu - trả lời "5-10 giây hiểu tình hình" trước khi đọc chi tiết. */}
          <CampaignKpiRow isLoading={isLoading} campaigns={campaignStats} watchlist={watchlist} />

          <InsightsPanel isLoading={isLoading} insights={insights} />

          {/* Bảng so sánh campaign lên đầu khối nội dung - trả lời trực tiếp "campaign nào tốt/kém",
              trước các widget cấp video/giờ đăng/nền tảng (nhóm "diagnostic" dồn xuống cuối). */}
          {filters.eventName && (
            <p className="-mb-2 text-xs text-gray-400">
              Đang lọc theo 1 campaign (&quot;{filters.eventName}&quot;) nên bảng dưới đây chỉ còn 1 dòng - xoá filter
              ở trên để so sánh nhiều campaign.
            </p>
          )}
          <CampaignTable isLoading={isLoading} data={campaignStats} range={range} watchlist={watchlist} />

          {/* Trả lời "video nào đang đóng góp chính" - component tái dùng từ app/page.tsx. */}
          <TopVideosCard items={items} isLoading={isLoading} />

          <CampaignLifecycleChart
            events={eventsList.data ?? []}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            lifecycle={lifecycle}
            momentum={momentum}
            isLoading={lifecycleFetch.isLoading}
          />

          <CampaignTopCreatorsTable syncedEventId={syncedEventId} />

          {/* Nhóm "diagnostic" - dữ liệu bổ trợ cho người muốn đào sâu, không phải thứ đọc đầu tiên. */}
          <ViewDistributionPanel isLoading={isLoading} data={viewDist} />

          <PublishHeatmap
            isLoading={isLoading}
            data={heatmap}
            bySource={heatmapBySource}
            campaignLabel={filters.eventName}
          />

          <SourceComparisonTable isLoading={isLoading} data={sourceComparison} />

          <TagPerformanceRankingTable isLoading={isLoading} data={tagPerformance} />

          <TagAnalysisTable isLoading={isLoading} data={tagAnalysis} />
        </div>
      </div>
    </main>
  );
}
