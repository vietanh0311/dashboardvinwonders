"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import CampaignLifecycleChart from "@/components/CampaignLifecycleChart";
import CampaignTable from "@/components/CampaignTable";
import ContentFilters from "@/components/ContentFilters";
import DataUpdateBanner from "@/components/DataUpdateBanner";
import DateRangePicker from "@/components/DateRangePicker";
import InsightsPanel from "@/components/InsightsPanel";
import { LAST_SYNC_SWR_KEY } from "@/components/LastSyncBadge";
import Nav from "@/components/Nav";
import PublishHeatmap from "@/components/PublishHeatmap";
import SourceComparisonTable from "@/components/SourceComparisonTable";
import TagAnalysisTable from "@/components/TagAnalysisTable";
import ViewDistributionPanel from "@/components/ViewDistributionPanel";
import {
  computeCampaignLifecycle,
  computeCampaignMomentum,
  computeCampaignStats,
  computePublishHeatmap,
  computeSourceComparison,
  computeTagAnalysis,
  computeViewDistribution,
  fetchContentsSmart,
  fetchEventsSmart,
  fetchLastSync,
  filterContentItems,
  generateCampaignInsights,
  vnDaysAgo,
  vnToday,
  type ContentFilters as ContentFiltersValue,
  type DateRangeValue,
} from "@/lib/api";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

const LIFECYCLE_LOOKBACK_DAYS = 89; // 90 ngày kể cả hôm nay

export default function CampaignsPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [filters, setFilters] = useState<ContentFiltersValue>({});

  const content = useSWR(["vc-contents-campaigns", range.from, range.to], () =>
    fetchContentsSmart(range.from, range.to, false)
  );

  const eventsList = useSWR("vc-events-list", () => fetchEventsSmart(false, LIFECYCLE_LOOKBACK_DAYS + 1));

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

  const rawItems = useMemo(() => content.data ?? [], [content.data]);
  const items = useMemo(() => filterContentItems(rawItems, filters), [rawItems, filters]);

  const viewDist = useMemo(() => computeViewDistribution(items), [items]);
  const heatmap = useMemo(() => computePublishHeatmap(items), [items]);
  const sourceComparison = useMemo(() => computeSourceComparison(items), [items]);
  const campaignStats = useMemo(() => computeCampaignStats(items), [items]);
  const tagAnalysis = useMemo(() => computeTagAnalysis(items), [items]);

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
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Nav />
            <div>
              <h1 className="text-xl font-semibold text-emerald-900">Campaigns - VinWonders</h1>
              <p className="text-sm text-gray-500">
                Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
        </header>

        <DataUpdateBanner />

        <ContentFilters items={rawItems} value={filters} onChange={setFilters} />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Lỗi khi tải dữ liệu: {error instanceof Error ? error.message : "không xác định"}. Có thể Supabase chưa
            được cấu hình hoặc chưa có dữ liệu.
          </div>
        )}

        <InsightsPanel isLoading={isLoading} insights={insights} />

        <ViewDistributionPanel isLoading={isLoading} data={viewDist} />

        <PublishHeatmap isLoading={isLoading} data={heatmap} />

        <SourceComparisonTable isLoading={isLoading} data={sourceComparison} />

        <CampaignTable isLoading={isLoading} data={campaignStats} />

        <CampaignLifecycleChart
          events={eventsList.data ?? []}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          lifecycle={lifecycle}
          momentum={momentum}
          isLoading={lifecycleFetch.isLoading}
        />

        <TagAnalysisTable isLoading={isLoading} data={tagAnalysis} />
      </div>
    </main>
  );
}
