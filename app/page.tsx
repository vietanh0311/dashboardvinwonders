"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import ContentTable from "@/components/ContentTable";
import DailyChart from "@/components/DailyChart";
import DataSourceToggle from "@/components/DataSourceToggle";
import DateRangePicker from "@/components/DateRangePicker";
import EventTable from "@/components/EventTable";
import KpiCards from "@/components/KpiCards";
import Nav from "@/components/Nav";
import SyncButton from "@/components/SyncButton";
import TagTable from "@/components/TagTable";
import TokenSettings from "@/components/TokenSettings";
import {
  VcApiError,
  computeMetrics,
  fetchContentsSmart,
  getStoredDataSource,
  vnDaysAgo,
  vnToday,
  type DataSource,
  type DateRangeValue,
} from "@/lib/api";

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(6), to: vnToday() };
}

export default function DashboardPage() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [tokenSettingsOpen, setTokenSettingsOpen] = useState(false);

  // Mặc định "supabase" cả lúc render server lẫn lần render đầu ở client để
  // tránh lệch hydration - đọc lựa chọn thật đã lưu (nếu có) ngay sau khi mount.
  const [dataSource, setDataSource] = useState<DataSource>("supabase");
  useEffect(() => {
    setDataSource(getStoredDataSource());
  }, []);
  const realtime = dataSource === "realtime";

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["vc-contents", range.from, range.to, dataSource],
    () => fetchContentsSmart(range.from, range.to, realtime),
    { revalidateOnFocus: false }
  );

  const metrics = useMemo(() => computeMetrics(data ?? []), [data]);

  const today = vnToday();
  const videosToday = metrics.byDay.find((d) => d.date === today)?.videos ?? 0;
  const avgViewsPerVideo = metrics.totalVideos > 0 ? metrics.totalViews / metrics.totalVideos : 0;

  const latestContents = useMemo(
    () => [...(data ?? [])].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 100),
    [data]
  );

  const rangeLabel = range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  const is401 = realtime && error instanceof VcApiError && error.status === 401;

  return (
    <main className="min-h-screen bg-emerald-50/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <Nav />
            <div>
              <h1 className="text-xl font-semibold text-emerald-900">Dashboard V-Creators – VinWonders</h1>
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
              onClick={() => mutate()}
              disabled={isValidating}
              className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
            >
              {isValidating ? "Đang tải..." : "Làm mới"}
            </button>
            <SyncButton onSynced={() => mutate()} />
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
                {!realtime && "Có thể Supabase chưa được cấu hình hoặc chưa có dữ liệu - bấm \"Cập nhật dữ liệu\" (cần token) hoặc bật Realtime."}
              </>
            )}
          </div>
        )}

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
