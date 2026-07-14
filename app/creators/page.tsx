"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import CreatorDrawer from "@/components/CreatorDrawer";
import CreatorTable from "@/components/CreatorTable";
import DataSourceToggle from "@/components/DataSourceToggle";
import DateRangePicker from "@/components/DateRangePicker";
import InsightsPanel from "@/components/InsightsPanel";
import Nav from "@/components/Nav";
import NewReturningChart from "@/components/NewReturningChart";
import ParetoChart from "@/components/ParetoChart";
import SyncButton from "@/components/SyncButton";
import TokenSettings from "@/components/TokenSettings";
import {
  VcApiError,
  addDaysToVnDate,
  classifyCreatorTiers,
  computeCreatorChannelsSummary,
  computeCreatorStats,
  computeNewVsReturning,
  computeParetoAnalysis,
  countVnWeeksInRange,
  daysSince,
  extractChannelSync,
  fetchContentsSmart,
  fetchCreatorProfilesFromSupabase,
  fetchUserProfiles,
  generateCreatorInsights,
  getStoredDataSource,
  resolveShortLinks,
  vnDaysAgo,
  vnToday,
  type ContentItem,
  type CreatorChannelsSummary,
  type DataSource,
  type DateRangeValue,
  type UserDetail,
} from "@/lib/api";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

type ProfileProgress = { done: number; total: number };

export default function CreatorsPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [tokenSettingsOpen, setTokenSettingsOpen] = useState(false);

  // Mặc định "supabase" cả lúc render server lẫn lần render đầu ở client để
  // tránh lệch hydration - đọc lựa chọn thật đã lưu (nếu có) ngay sau khi mount.
  const [dataSource, setDataSource] = useState<DataSource>("supabase");
  useEffect(() => {
    setDataSource(getStoredDataSource());
  }, []);
  const realtime = dataSource === "realtime";

  const [userProfiles, setUserProfiles] = useState<Map<string, UserDetail>>(new Map());
  const [channelVersion, setChannelVersion] = useState(0); // bump để buộc tính lại kênh sau khi resolve short-link
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profileProgress, setProfileProgress] = useState<ProfileProgress | null>(null);

  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);

  const [filterUnverifiedPhone, setFilterUnverifiedPhone] = useState(false);
  const [filterNoContract, setFilterNoContract] = useState(false);
  const [filterInactive30, setFilterInactive30] = useState(false);

  const current = useSWR(["vc-contents-creators", range.from, range.to, dataSource], () =>
    fetchContentsSmart(range.from, range.to, realtime)
  );

  const previousFrom = addDaysToVnDate(range.from, -30);
  const previousTo = addDaysToVnDate(range.from, -1);
  const previous = useSWR(["vc-contents-creators-prev", previousFrom, previousTo, dataSource], () =>
    fetchContentsSmart(previousFrom, previousTo, realtime)
  );

  // Ở chế độ Supabase, tự nạp "cache mỏng" creators (email/phone/thành phố/kênh
  // liên kết/hợp đồng) - nhanh, không cần token. Nút "Tải profile" (live, cần
  // token) vẫn dùng được để lấy đầy đủ hơn (ngày sinh, banned, thống kê tiền...).
  const supabaseCreators = useSWR(
    dataSource === "supabase" ? "vc-creators-supabase" : null,
    fetchCreatorProfilesFromSupabase
  );
  useEffect(() => {
    if (!supabaseCreators.data) return;
    setUserProfiles((prev) => {
      const merged = new Map(supabaseCreators.data);
      prev.forEach((v, k) => merged.set(k, v)); // profile live (đầy đủ hơn) ghi đè bản Supabase
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseCreators.data]);

  const isLoading = current.isLoading || previous.isLoading;
  const isValidating = current.isValidating || previous.isValidating;
  const error = current.error ?? previous.error;

  const currentItems = useMemo(() => current.data ?? [], [current.data]);
  const previousItems = useMemo(() => previous.data ?? [], [previous.data]);

  const weeksInRange = countVnWeeksInRange(range.from, range.to);

  const creatorsWithTier = useMemo(() => {
    const stats = computeCreatorStats(currentItems);
    return classifyCreatorTiers(stats, currentItems, weeksInRange);
  }, [currentItems, weeksInRange]);

  const pareto = useMemo(() => computeParetoAnalysis(creatorsWithTier), [creatorsWithTier]);

  const weeklyTrend = useMemo(
    () => computeNewVsReturning(currentItems, previousItems),
    [currentItems, previousItems]
  );

  const insights = useMemo(
    () => generateCreatorInsights(creatorsWithTier, pareto, weeklyTrend, range.to),
    [creatorsWithTier, pareto, weeklyTrend, range.to]
  );

  // Cờ lọc nhanh - chỉ áp dụng chính xác cho creator đã tải profile; creator
  // chưa tải profile bị loại khỏi các bộ lọc này (không đủ dữ liệu để đánh giá).
  const filteredCreators = useMemo(() => {
    if (!filterUnverifiedPhone && !filterNoContract && !filterInactive30) return creatorsWithTier;

    return creatorsWithTier.filter((c) => {
      const profile = userProfiles.get(c.creatorId);
      if (!profile) return false;

      if (filterUnverifiedPhone && profile.phone?.verified) return false;
      if (filterNoContract && profile.contract?.status && profile.contract?.name) return false;
      if (filterInactive30) {
        const days = daysSince(profile.lastActivatedAt);
        if (days === null || days <= 30) return false;
      }

      return true;
    });
  }, [creatorsWithTier, userProfiles, filterUnverifiedPhone, filterNoContract, filterInactive30]);

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
    // channelVersion không được đọc trực tiếp nhưng cần trong deps để buộc
    // tính lại sau khi resolveShortLinks cập nhật cache trong localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsByCreator, userProfiles, channelVersion]);

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  const is401 = realtime && error instanceof VcApiError && error.status === 401;

  const refresh = () => {
    current.mutate();
    previous.mutate();
  };

  // Chỉ tải profile (và resolve link video) cho các creator đang hiển thị
  // trong bảng sau khi áp cờ lọc nhanh - tránh gọi hàng nghìn request không
  // cần thiết mỗi lần mở trang.
  const handleLoadProfiles = async () => {
    if (loadingProfiles || filteredCreators.length === 0) return;
    setLoadingProfiles(true);
    try {
      const ids = Array.from(new Set(filteredCreators.map((c) => c.creatorId)));
      const idSet = new Set(ids);
      const shortLinkItems = currentItems.filter((it) => {
        const id = it.createdBy?._id;
        if (!id || !idSet.has(id)) return false;
        return extractChannelSync(it.link, it.source).needsResolve;
      });

      const totalSteps = ids.length + shortLinkItems.length;
      setProfileProgress({ done: 0, total: totalSteps });

      const profiles = await fetchUserProfiles(ids, {
        concurrency: 5,
        onEach: (done) => setProfileProgress({ done, total: totalSteps }),
      });
      setUserProfiles((prev) => {
        const merged = new Map(prev);
        profiles.forEach((v, k) => merged.set(k, v));
        return merged;
      });

      await resolveShortLinks(shortLinkItems, {
        concurrency: 4,
        onEach: (done) => setProfileProgress({ done: ids.length + done, total: totalSteps }),
      });
      setChannelVersion((v) => v + 1);
    } finally {
      setLoadingProfiles(false);
      setProfileProgress(null);
    }
  };

  const selectedCreator = creatorsWithTier.find((c) => c.creatorId === selectedCreatorId) ?? null;
  const selectedVideos = selectedCreatorId ? itemsByCreator.get(selectedCreatorId) ?? [] : [];

  return (
    <main className="min-h-screen bg-emerald-50/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Nav />
            <div>
              <h1 className="text-xl font-semibold text-emerald-900">Creators – VinWonders</h1>
              <p className="text-sm text-gray-500">
                Khoảng thời gian: <span className="font-medium text-gray-700">{rangeLabel}</span> · so sánh creator
                mới với 30 ngày trước đó ({previousFrom} → {previousTo})
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

        <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium text-gray-600">Lọc nhanh:</span>
            <label className="flex items-center gap-1.5 text-gray-600">
              <input
                type="checkbox"
                checked={filterUnverifiedPhone}
                onChange={(e) => setFilterUnverifiedPhone(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Chưa xác minh SĐT
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
            <span className="text-xs text-gray-400">(chỉ tính trên creator đã tải profile)</span>
          </div>

          <div className="flex items-center gap-3">
            {profileProgress && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{
                      width: `${
                        profileProgress.total > 0 ? (profileProgress.done / profileProgress.total) * 100 : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="whitespace-nowrap text-xs text-gray-400">
                  {profileProgress.done}/{profileProgress.total}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleLoadProfiles}
              disabled={loadingProfiles || filteredCreators.length === 0}
              className="whitespace-nowrap rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
            >
              {loadingProfiles ? "Đang tải profile..." : `Tải profile (${filteredCreators.length})`}
            </button>
          </div>
        </div>

        <CreatorTable
          data={filteredCreators}
          isLoading={isLoading}
          profiles={userProfiles}
          channelSummaries={channelSummaries}
          onSelectCreator={setSelectedCreatorId}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ParetoChart isLoading={isLoading} pareto={pareto} />
          <NewReturningChart isLoading={isLoading} data={weeklyTrend} />
        </div>
      </div>

      {selectedCreator && (
        <CreatorDrawer
          creator={selectedCreator}
          profile={userProfiles.get(selectedCreator.creatorId)}
          isLoadingProfile={loadingProfiles && !userProfiles.get(selectedCreator.creatorId)}
          channels={channelSummaries.get(selectedCreator.creatorId)}
          videos={selectedVideos}
          onClose={() => setSelectedCreatorId(null)}
        />
      )}
    </main>
  );
}
