"use client";

import { Suspense, useMemo, useState } from "react";
import useSWR from "swr";
import ConcentrationRiskCard from "@/components/ConcentrationRiskCard";
import ContentFilters from "@/components/ContentFilters";
import CpvRankingPanel from "@/components/CpvRankingPanel";
import CreatorDrawer from "@/components/CreatorDrawer";
import CreatorSearch from "@/components/CreatorSearch";
import CreatorTable from "@/components/CreatorTable";
import DataUpdateBanner from "@/components/DataUpdateBanner";
import DateRangePicker from "@/components/DateRangePicker";
import FacilityScorecard from "@/components/FacilityScorecard";
import InsightsPanel from "@/components/InsightsPanel";
import DataErrorBanner from "@/components/DataErrorBanner";
import MomentumLeaderboardCard from "@/components/MomentumLeaderboardCard";
import Nav from "@/components/Nav";
import OnboardingFunnelCard from "@/components/OnboardingFunnelCard";
import PostingTimeByGroupTable from "@/components/PostingTimeByGroupTable";
import RefreshIndicator from "@/components/RefreshIndicator";
import NewReturningChart from "@/components/NewReturningChart";
import ParetoChart from "@/components/ParetoChart";
import RetentionCohortTable from "@/components/RetentionCohortTable";
import TierBreakdownTable from "@/components/TierBreakdownTable";
import {
  addDaysToVnDate,
  classifyCreatorTiers,
  computeBestPostingTimeByFacility,
  computeBestPostingTimeByTier,
  computeConcentrationTrend,
  computeCpvRanking,
  computeCreatorChannelsSummary,
  computeCreatorStats,
  computeFacilityScorecard,
  computeMomentumLeaderboard,
  computeNewVsReturning,
  computeParetoAnalysis,
  computeTierBreakdown,
  countVnWeeksInRange,
  daysSince,
  diffDaysUtc,
  fetchAnomalies,
  fetchContentsSmart,
  fetchCreatorIdsInRangeFromSupabase,
  fetchCreatorLifecycle,
  fetchCreatorProfilesFromSupabase,
  filterContentItems,
  generateCreatorInsights,
  vnDaysAgo,
  vnToday,
  type ContentItem,
  type CreatorChannelsSummary,
  type CreatorTier,
  type DateRangeValue,
  type UserDetail,
} from "@/lib/api";
import { useUrlContentFilters, useUrlDateRange } from "@/lib/urlState";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

// Tham chiếu ổn định cho lúc previous.data chưa tải xong - tránh tạo Set mới
// mỗi render (sẽ làm vô hiệu memo hoá của weeklyTrend/tierBreakdown bên dưới).
const EMPTY_CREATOR_IDS = new Set<string>();

export default function CreatorsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-emerald-50/40" />}>
      <CreatorsPageInner />
    </Suspense>
  );
}

function CreatorsPageInner() {
  const [range, setRange] = useUrlDateRange(defaultRange);
  const [filters, setFilters] = useUrlContentFilters();

  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);

  const [filterNoPhone, setFilterNoPhone] = useState(false);
  const [filterNoContract, setFilterNoContract] = useState(false);
  const [filterInactive30, setFilterInactive30] = useState(false);

  const current = useSWR(["vc-contents", range.from, range.to], () =>
    fetchContentsSmart(range.from, range.to, false)
  );

  const previousFrom = addDaysToVnDate(range.from, -30);
  const previousTo = addDaysToVnDate(range.from, -1);
  // Chỉ cần biết AI đã đăng trong 30 ngày trước (để tính creator mới/quay
  // lại), không cần chi tiết từng video - fetchCreatorIdsInRangeFromSupabase
  // trả về vài trăm creator_id thay vì hàng chục nghìn dòng video đầy đủ như
  // fetchContentsSmart, xem lib/api.ts.
  const previous = useSWR(
    ["vc-creator-ids-creators-prev", previousFrom, previousTo, filters],
    () => fetchCreatorIdsInRangeFromSupabase(previousFrom, previousTo, filters)
  );

  // Fetch riêng, đầy đủ ContentItem (không chỉ creator_id) cho previous window - cần cho
  // computeCreatorStats bên dưới (concentration trend + momentum leaderboard đều so views
  // theo creator giữa 2 kỳ, previousCreatorIds ở trên không đủ vì chỉ có id, không có views).
  const previousContent = useSWR(
    ["vc-contents", previousFrom, previousTo],
    () => fetchContentsSmart(previousFrom, previousTo, false)
  );
  const previousContentItems = useMemo(
    () => filterContentItems(previousContent.data ?? [], filters),
    [previousContent.data, filters]
  );

  // Profile creator đến TỪ Supabase, do sync ở máy local cào sẵn về (sync tự
  // đăng nhập VC API - xem lib/vcAuth.ts). Trình duyệt không gọi VC API nữa:
  // API đó chỉ nhận IP whitelist/VPN nên người xem dashboard không gọi được.
  const supabaseCreators = useSWR("vc-creators-supabase", fetchCreatorProfilesFromSupabase);
  const userProfiles = useMemo(
    () => supabaseCreators.data ?? new Map<string, UserDetail>(),
    [supabaseCreators.data]
  );

  // Cùng SWR key với /trends (Signals) - dùng chung cache, không tốn thêm request khi 2 trang
  // mở trong cùng phiên.
  const anomalies = useSWR("vc-anomalies", () => fetchAnomalies(14));
  const anomaliesByCreator = useMemo(() => {
    const map = new Map<string, { count: number; maxScore: number }>();
    (anomalies.data?.videos ?? []).forEach((v) => {
      if (!v.creatorId) return;
      const entry = map.get(v.creatorId) ?? { count: 0, maxScore: 0 };
      entry.count += 1;
      entry.maxScore = Math.max(entry.maxScore, v.score);
      map.set(v.creatorId, entry);
    });
    return map;
  }, [anomalies.data]);

  // Cohort giữ chân + funnel kích hoạt dùng TOÀN BỘ lịch sử creator (không theo range đang xem) -
  // fetch độc lập, không chặn phần còn lại của trang trong lúc tải.
  const lifecycle = useSWR("vc-creator-lifecycle", fetchCreatorLifecycle, { revalidateOnFocus: false });

  // !data thay vì SWR isLoading: giữ dữ liệu range trước hiển thị (nhờ
  // keepPreviousData ở SWRProvider) thay vì skeleton trắng mỗi lần đổi date range.
  //
  // Chỉ chặn UI chính theo current - previous (30 ngày trước kỳ đang xem) luôn
  // nặng hơn current (cửa sổ cố định 30 ngày, hầu như không bao giờ trúng cache
  // vì previousFrom/previousTo đổi theo range.from) và chỉ phục vụ 2 khối so
  // sánh bên dưới (NewReturningChart, TierBreakdownTable). Trước đây gộp
  // isLoading = !current.data || !previous.data khiến cả bảng xếp hạng creator
  // phải đợi thêm request 30 ngày đó dù không cần tới nó - đây chính là lý do
  // đổi date filter cảm giác rất chậm.
  const isLoading = !current.data;
  const isLoadingCompare = isLoading || !previous.data;
  const isValidating = current.isValidating || previous.isValidating;
  const error = current.error ?? previous.error;
  // Đang tải range mới nhưng màn hình vẫn là số liệu cũ - bật thanh tiến trình
  // + làm mờ nội dung để người dùng biết dữ liệu đang cập nhật, không phải đơ.
  // Chỉ theo current.isValidating (không gộp previous) - nội dung chính không
  // nên còn mờ chỉ vì request so sánh 30 ngày (chạy nền, không chặn) chưa xong.
  const isRefreshing = current.isValidating && !isLoading;

  const rawCurrentItems = useMemo(() => current.data ?? [], [current.data]);
  const currentItems = useMemo(() => filterContentItems(rawCurrentItems, filters), [rawCurrentItems, filters]);
  const previousCreatorIds = previous.data ?? EMPTY_CREATOR_IDS;

  const weeksInRange = countVnWeeksInRange(range.from, range.to);

  const creatorsWithTier = useMemo(() => {
    const stats = computeCreatorStats(currentItems);
    return classifyCreatorTiers(stats, currentItems, weeksInRange);
  }, [currentItems, weeksInRange]);

  const knownCreatorIds = useMemo(
    () => new Set(creatorsWithTier.map((c) => c.creatorId)),
    [creatorsWithTier]
  );

  const pareto = useMemo(() => computeParetoAnalysis(creatorsWithTier), [creatorsWithTier]);

  // Stat creator của kỳ trước (từ previousContentItems ở trên - riêng với previousCreatorIds
  // vì weeklyTrend/tierBreakdown chỉ cần biết id, còn ở đây cần views để so rủi ro phụ thuộc).
  const previousCreatorStats = useMemo(
    () => computeCreatorStats(previousContentItems),
    [previousContentItems]
  );
  const concentrationTrend = useMemo(
    () => computeConcentrationTrend(creatorsWithTier, previousCreatorStats),
    [creatorsWithTier, previousCreatorStats]
  );

  const momentum = useMemo(
    () => computeMomentumLeaderboard(creatorsWithTier, previousCreatorStats),
    [creatorsWithTier, previousCreatorStats]
  );

  const weeklyTrend = useMemo(
    () => computeNewVsReturning(currentItems, previousCreatorIds),
    [currentItems, previousCreatorIds]
  );

  const tierBreakdown = useMemo(
    () => computeTierBreakdown(creatorsWithTier, previousCreatorIds),
    [creatorsWithTier, previousCreatorIds]
  );

  const currentRangeDays = diffDaysUtc(range.from, range.to) + 1;
  const previousRangeDays = diffDaysUtc(previousFrom, previousTo) + 1;
  const facilityScorecard = useMemo(
    () => computeFacilityScorecard(creatorsWithTier, previousCreatorStats, currentRangeDays, previousRangeDays),
    [creatorsWithTier, previousCreatorStats, currentRangeDays, previousRangeDays]
  );

  const creatorTierMap = useMemo(
    () => new Map<string, CreatorTier>(creatorsWithTier.map((c) => [c.creatorId, c.tier])),
    [creatorsWithTier]
  );
  const postingTimeByFacility = useMemo(() => computeBestPostingTimeByFacility(currentItems), [currentItems]);
  const postingTimeByTier = useMemo(
    () => computeBestPostingTimeByTier(currentItems, creatorTierMap),
    [currentItems, creatorTierMap]
  );

  const cpvRanking = useMemo(() => computeCpvRanking(creatorsWithTier), [creatorsWithTier]);

  const insights = useMemo(
    () => generateCreatorInsights(creatorsWithTier, pareto, weeklyTrend, range.to, concentrationTrend),
    [creatorsWithTier, pareto, weeklyTrend, range.to, concentrationTrend]
  );

  // Cờ lọc nhanh - chỉ áp dụng chính xác cho creator đã tải profile; creator
  // chưa tải profile bị loại khỏi các bộ lọc này (không đủ dữ liệu để đánh giá).
  // Lưu ý: profile.phone.verified và profile.contract.name không có trong dữ
  // liệu đồng bộ từ Supabase (chỉ API live /users/<id> mới trả về, nhưng route
  // đó cần token và UI nhập token đã bị ẩn) - nên "Chưa xác minh SĐT" dùng
  // "không có SĐT" thay vì "SĐT chưa xác minh", và "Chưa có hợp đồng" chỉ xét
  // contract.status (không đòi thêm contract.name).
  const filteredCreators = useMemo(() => {
    if (!filterNoPhone && !filterNoContract && !filterInactive30) return creatorsWithTier;

    return creatorsWithTier.filter((c) => {
      const profile = userProfiles.get(c.creatorId);
      if (!profile) return false;

      if (filterNoPhone && profile.phone?.full) return false;
      if (filterNoContract && profile.contract?.status) return false;
      if (filterInactive30) {
        const days = daysSince(profile.lastActivatedAt);
        if (days === null || days <= 30) return false;
      }

      return true;
    });
  }, [creatorsWithTier, userProfiles, filterNoPhone, filterNoContract, filterInactive30]);

  // Nhóm video hiện tại theo creator để tính kênh (chip Kênh + drawer).
  const itemsByCreator = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    currentItems.forEach((it) => {
      const id = it.createdBy?._id;
      if (!id) return;
      const arr = map.get(id) ?? [];
      arr.push(it);
      map.set(id, arr);
    });
    return map;
  }, [currentItems]);

  const channelSummaries = useMemo(() => {
    const map = new Map<string, CreatorChannelsSummary>();
    itemsByCreator.forEach((items, creatorId) => {
      map.set(creatorId, computeCreatorChannelsSummary(items, userProfiles.get(creatorId) ?? null));
    });
    return map;
  }, [itemsByCreator, userProfiles]);

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;

  const refresh = () => {
    current.mutate();
    previous.mutate();
    previousContent.mutate();
    anomalies.mutate();
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
              <h1 className="text-xl font-semibold text-emerald-900">Creators - VinWonders</h1>
              <p className="text-sm text-gray-500">
                Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span> · so sánh creator
                mới với 30 ngày trước đó ({previousFrom} → {previousTo})
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

        <CreatorSearch knownCreatorIds={knownCreatorIds} onSelectKnownCreator={setSelectedCreatorId} />

        <ContentFilters items={rawCurrentItems} value={filters} onChange={setFilters} />

        <DataErrorBanner error={error} hasData={!isLoading} onRetry={refresh} />

        <div
          aria-busy={isRefreshing}
          className={`flex flex-col gap-5 transition-opacity duration-300 ${isRefreshing ? "opacity-60" : "opacity-100"}`}
        >
        <InsightsPanel isLoading={isLoading} insights={insights} />

        <ConcentrationRiskCard isLoading={isLoading} trend={concentrationTrend} />

        <MomentumLeaderboardCard isLoading={isLoading} data={momentum} onSelectCreator={setSelectedCreatorId} />

        <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium text-gray-600">Lọc nhanh:</span>
            <label className="flex items-center gap-1.5 text-gray-600">
              <input
                type="checkbox"
                checked={filterNoPhone}
                onChange={(e) => setFilterNoPhone(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Chưa có SĐT
            </label>
            <label className="flex items-center gap-1.5 text-gray-600">
              <input
                type="checkbox"
                checked={filterNoContract}
                onChange={(e) => setFilterNoContract(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Chưa có hợp đồng
            </label>
            <label className="flex items-center gap-1.5 text-gray-600">
              <input
                type="checkbox"
                checked={filterInactive30}
                onChange={(e) => setFilterInactive30(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Không hoạt động &gt; 30 ngày
            </label>
          </div>
        </div>

        <CreatorTable
          data={filteredCreators}
          isLoading={isLoading}
          profiles={userProfiles}
          channelSummaries={channelSummaries}
          onSelectCreator={setSelectedCreatorId}
          anomalies={anomaliesByCreator}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ParetoChart isLoading={isLoading} pareto={pareto} />
          <NewReturningChart isLoading={isLoadingCompare} data={weeklyTrend} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <TierBreakdownTable isLoading={isLoadingCompare} data={tierBreakdown} />
          <FacilityScorecard isLoading={isLoading} data={facilityScorecard} />
        </div>

        <PostingTimeByGroupTable isLoading={isLoading} byFacility={postingTimeByFacility} byTier={postingTimeByTier} />

        <CpvRankingPanel isLoading={isLoading} data={cpvRanking} onSelectCreator={setSelectedCreatorId} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RetentionCohortTable isLoading={!lifecycle.data} data={lifecycle.data?.cohorts ?? []} />
          <OnboardingFunnelCard
            isLoading={!lifecycle.data}
            data={
              lifecycle.data?.funnel ?? {
                totalCreators: 0,
                reachedPost2: 0,
                reachedPost3: 0,
                medianDaysToPost2: null,
                medianDaysToPost3: null,
              }
            }
          />
        </div>
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
