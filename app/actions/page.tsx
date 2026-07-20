"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import AttentionSummaryCards from "@/components/AttentionSummaryCards";
import CampaignWatchlistTable from "@/components/CampaignWatchlistTable";
import ContentFilters from "@/components/ContentFilters";
import CreatorAttentionTable from "@/components/CreatorAttentionTable";
import CreatorDrawer from "@/components/CreatorDrawer";
import DataErrorBanner from "@/components/DataErrorBanner";
import DataUpdateBanner from "@/components/DataUpdateBanner";
import DateRangePicker from "@/components/DateRangePicker";
import EngagementRiskTable from "@/components/EngagementRiskTable";
import { LAST_SYNC_SWR_KEY } from "@/components/LastSyncBadge";
import Nav from "@/components/Nav";
import RefreshIndicator from "@/components/RefreshIndicator";
import {
  classifyCreatorTiers,
  computeCampaignWatchlist,
  computeCreatorAttentionList,
  computeCreatorChannelsSummary,
  computeCreatorStats,
  computeEngagementCompliance,
  countVnWeeksInRange,
  fetchContentsSmart,
  fetchCreatorProfilesFromSupabase,
  fetchLastSync,
  filterContentItems,
  vnDaysAgo,
  vnToday,
  type ContentFilters as ContentFiltersValue,
  type ContentItem,
  type CreatorChannelsSummary,
  type DateRangeValue,
  type UserDetail,
} from "@/lib/api";

// Mặc định 30 ngày (rộng hơn 7 ngày của Dashboard/Campaigns): trang này để rà soát định kỳ, không
// phải xem nhanh hằng ngày, nên cần đủ dài để không bỏ sót campaign/video cần xử lý.
function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(29), to: vnToday() };
}

export default function ActionsPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [filters, setFilters] = useState<ContentFiltersValue>({});
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);

  const content = useSWR(["vc-contents-actions", range.from, range.to], () =>
    fetchContentsSmart(range.from, range.to, false)
  );

  // Cùng SWR key với /creators - dùng chung cache, không tốn thêm request khi 2 trang mở trong
  // cùng phiên.
  const supabaseCreators = useSWR("vc-creators-supabase", fetchCreatorProfilesFromSupabase);
  const userProfiles = useMemo(
    () => supabaseCreators.data ?? new Map<string, UserDetail>(),
    [supabaseCreators.data]
  );

  const lastSync = useSWR(LAST_SYNC_SWR_KEY, fetchLastSync, { revalidateOnFocus: false });
  const referenceDate = lastSync.data?.snapshotDate ?? vnToday();

  const isLoading = !content.data || !supabaseCreators.data;
  const isValidating = content.isValidating || supabaseCreators.isValidating;
  const error = content.error ?? supabaseCreators.error;
  const isRefreshing = isValidating && !isLoading;

  const rawItems = useMemo(() => content.data ?? [], [content.data]);
  const items = useMemo(() => filterContentItems(rawItems, filters), [rawItems, filters]);

  const weeksInRange = countVnWeeksInRange(range.from, range.to);
  const creatorsWithTier = useMemo(() => {
    const stats = computeCreatorStats(items);
    return classifyCreatorTiers(stats, items, weeksInRange);
  }, [items, weeksInRange]);

  const compliance = useMemo(() => computeEngagementCompliance(items), [items]);
  const watchlist = useMemo(() => computeCampaignWatchlist(items, referenceDate), [items, referenceDate]);
  const creatorAttention = useMemo(
    () => computeCreatorAttentionList(creatorsWithTier, userProfiles, referenceDate),
    [creatorsWithTier, userProfiles, referenceDate]
  );

  const campaignsOverCapCount = watchlist.filter((w) => w.videosOverCap > 0).length;
  const campaignsEndingSoonCount = watchlist.filter(
    (w) => (!w.isEnded && w.daysRemaining <= 7) || (w.isEnded && w.daysRemaining >= -14)
  ).length;

  // Nhóm video hiện tại theo creator để tính kênh (drawer chi tiết) - giống hệt logic ở /creators.
  const itemsByCreator = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    items.forEach((it) => {
      const id = it.createdBy?._id;
      if (!id) return;
      const arr = map.get(id) ?? [];
      arr.push(it);
      map.set(id, arr);
    });
    return map;
  }, [items]);

  const channelSummaries = useMemo(() => {
    const map = new Map<string, CreatorChannelsSummary>();
    itemsByCreator.forEach((creatorItems, creatorId) => {
      map.set(creatorId, computeCreatorChannelsSummary(creatorItems, userProfiles.get(creatorId) ?? null));
    });
    return map;
  }, [itemsByCreator, userProfiles]);

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;

  const refresh = () => {
    content.mutate();
    supabaseCreators.mutate();
  };

  const selectedCreator = creatorsWithTier.find((c) => c.creatorId === selectedCreatorId) ?? null;
  const selectedVideos = selectedCreatorId ? itemsByCreator.get(selectedCreatorId) ?? [] : [];

  return (
    <main className="min-h-screen bg-emerald-50/40">
      <RefreshIndicator active={isRefreshing} />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Nav />
            <div>
              <h1 className="text-xl font-semibold text-emerald-900">Cần xử lý - VinWonders</h1>
              <p className="text-sm text-gray-500">
                Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span> · gộp rủi ro tương
                tác, cap đối soát, hạn campaign và creator vướng thanh toán vào 1 trang.
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

        <DataErrorBanner error={error} hasData={!isLoading} onRetry={refresh} />

        <div
          aria-busy={isRefreshing}
          className={`flex flex-col gap-5 transition-opacity duration-300 ${isRefreshing ? "opacity-60" : "opacity-100"}`}
        >
          <AttentionSummaryCards
            isLoading={isLoading}
            engagementRiskCount={compliance.atRiskCount}
            campaignsOverCapCount={campaignsOverCapCount}
            campaignsEndingSoonCount={campaignsEndingSoonCount}
            creatorAttentionCount={creatorAttention.length}
          />

          <EngagementRiskTable isLoading={isLoading} data={compliance.atRiskItems} />

          <CampaignWatchlistTable isLoading={isLoading} data={watchlist} />

          <CreatorAttentionTable
            isLoading={isLoading}
            data={creatorAttention}
            onSelectCreator={setSelectedCreatorId}
          />
        </div>
      </div>

      {selectedCreator && (
        <CreatorDrawer
          creator={selectedCreator}
          profile={userProfiles.get(selectedCreator.creatorId)}
          isLoadingProfile={!supabaseCreators.data && !userProfiles.get(selectedCreator.creatorId)}
          channels={channelSummaries.get(selectedCreator.creatorId)}
          videos={selectedVideos}
          onClose={() => setSelectedCreatorId(null)}
        />
      )}
    </main>
  );
}
