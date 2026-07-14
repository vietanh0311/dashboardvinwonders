"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import CampaignLifecycleChart from "@/components/CampaignLifecycleChart";
import CampaignTable from "@/components/CampaignTable";
import DataSourceToggle from "@/components/DataSourceToggle";
import DateRangePicker from "@/components/DateRangePicker";
import InsightsPanel from "@/components/InsightsPanel";
import Nav from "@/components/Nav";
import PublishHeatmap from "@/components/PublishHeatmap";
import SourceComparisonTable from "@/components/SourceComparisonTable";
import SyncButton from "@/components/SyncButton";
import TagAnalysisTable from "@/components/TagAnalysisTable";
import TokenSettings from "@/components/TokenSettings";
import ViewDistributionPanel from "@/components/ViewDistributionPanel";
import {
  VcApiError,
  computeCampaignLifecycle,
  computeCampaignMomentum,
  computeCampaignStats,
  computePublishHeatmap,
  computeSourceComparison,
  computeTagAnalysis,
  computeViewDistribution,
  fetchContentsSmart,
  fetchEvents,
  generateCampaignInsights,
  getStoredDataSource,
  vnDaysAgo,
  vnToday,
  type DataSource,
  type DateRangeValue,
} from "@/lib/api";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

const LIFECYCLE_LOOKBACK_DAYS = 89; // 90 ngày kể cả hôm nay

export default function CampaignsPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [tokenSettingsOpen, setTokenSettingsOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");

  // Mặc định "supabase" cả lúc render server lẫn lần render đầu ở client để
  // tránh lệch hydration - đọc lựa chọn thật đã lưu (nếu có) ngay sau khi mount.
  const [dataSource, setDataSource] = useState<DataSource>("supabase");
  useEffect(() => {
    setDataSource(getStoredDataSource());
  }, []);
  const realtime = dataSource === "realtime";

  const content = useSWR(["vc-contents-campaigns", range.from, range.to, dataSource], () =>
    fetchContentsSmart(range.from, range.to, realtime)
  );

  const eventsList = useSWR("vc-events-list", () => fetchEvents());

  const lifecycleFrom = vnDaysAgo(LIFECYCLE_LOOKBACK_DAYS);
  const lifecycleTo = vnToday();
  const lifecycleFetch = useSWR(
    selectedEventId ? ["vc-contents-lifecycle", selectedEventId, dataSource] : null,
    () => fetchContentsSmart(lifecycleFrom, lifecycleTo, realtime, { event: selectedEventId })
  );

  const isLoading = content.isLoading;
  const isValidating = content.isValidating;
  const error = content.error ?? eventsList.error;

  const items = useMemo(() => content.data ?? [], [content.data]);

  const viewDist = useMemo(() => computeViewDistribution(items), [items]);
  const heatmap = useMemo(() => computePublishHeatmap(items), [items]);
  const sourceComparison = useMemo(() => computeSourceComparison(items), [items]);
  const campaignStats = useMemo(() => computeCampaignStats(items), [items]);
  const tagAnalysis = useMemo(() => computeTagAnalysis(items), [items]);

  const insights = useMemo(
    () => generateCampaignInsights(campaignStats, heatmap, viewDist, tagAnalysis),
    [campaignStats, heatmap, viewDist, tagAnalysis]
  );

  const lifecycle = useMemo(
    () => computeCampaignLifecycle(lifecycleFetch.data ?? []),
    [lifecycleFetch.data]
  );
  const momentum = useMemo(() => computeCampaignMomentum(lifecycle), [lifecycle]);

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  const is401 = realtime && error instanceof VcApiError && error.status === 401;

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
              <h1 className="text-xl font-semibold text-emerald-900">Campaigns – VinWonders</h1>
              <p className="text-sm text-gray-500">
                Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <DataSourceToggle value={dataSource} onChange={setDataSource} />
            <button
              type="button"
              onClick={refresh}
              disabled={isValidating}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
            >
              {isValidating ? "Đang tải..." : "Làm mới"}
            </button>
            <SyncButton onSynced={refresh} />
            <button
              type="button"
              onClick={() => setTokenSettingsOpen((v) => !v)}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              Token API
            </button>
          </div>
        </header>

        <TokenSettings open={tokenSettingsOpen} onOpenChange={setTokenSettingsOpen} />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {is401 ? (
              <>
                <strong>Token hết hạn, dán token mới.</strong> VC API từ chối yêu cầu (401) vì token thiếu hoặc đã hết
                hạn. Bấm{" "}
                <button
                  type="button"
                  onClick={() => setTokenSettingsOpen(true)}
                  className="font-medium underline underline-offset-2"
                >
                  Token API
                </button>{" "}
                để dán token mới rồi bấm Làm mới.
              </>
            ) : (
              <>
                Lỗi khi tải dữ liệu: {error instanceof Error ? error.message : "không xác định"}.{" "}
                {!realtime &&
                  "Có thể Supabase chưa được cấu hình hoặc chưa có dữ liệu - bấm \"Cập nhật dữ liệu\" (cần token) hoặc bật Realtime."}
              </>
            )}
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
