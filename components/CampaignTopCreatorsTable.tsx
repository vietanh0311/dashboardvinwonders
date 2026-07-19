"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import CopyTableButton from "@/components/CopyTableButton";
import DataErrorBanner from "@/components/DataErrorBanner";
import DateRangePicker from "@/components/DateRangePicker";
import {
  computeCreatorStats,
  fetchContentsSmart,
  fetchEventsSmart,
  formatCurrency,
  formatNumber,
  formatPercent,
  vnDaysAgo,
  vnToday,
  type CreatorStat,
  type DateRangeValue,
} from "@/lib/api";

// Danh sách campaign cho dropdown chọn - cùng SWR key với CampaignLifecycleChart
// (app/campaigns/page.tsx) nên nếu 2 widget cùng nằm trên 1 trang, SWR tự gộp
// request thay vì gọi 2 lần.
const EVENTS_LOOKBACK_DAYS = 90;
const PAGE_SIZE = 50;

function defaultRange(): DateRangeValue {
  return { from: vnDaysAgo(29), to: vnToday() };
}

type SortKey =
  | "name"
  | "workplaceUnitName"
  | "videos"
  | "totalViews"
  | "avgViewsPerVideo"
  | "engagementRate"
  | "totalCash"
  | "cpv";

type Column = { key: SortKey; label: string };

const COLUMNS: Column[] = [
  { key: "name", label: "Creator" },
  { key: "workplaceUnitName", label: "Cơ sở" },
  { key: "videos", label: "Videos" },
  { key: "totalViews", label: "Views" },
  { key: "avgViewsPerVideo", label: "Views TB/video" },
  { key: "engagementRate", label: "Engagement" },
  { key: "totalCash", label: "Cash" },
  { key: "cpv", label: "CPV" },
];

function getSortValue(row: CreatorStat, key: SortKey): string | number {
  if (key === "name") return row.name.toLowerCase();
  if (key === "workplaceUnitName") return (row.workplaceUnitName ?? "").toLowerCase();
  return row[key];
}

const COPY_HEADERS = [
  "#",
  "Campaign",
  "Creator",
  "Cơ sở",
  "Videos",
  "Views",
  "Views TB/video",
  "Engagement (%)",
  "Cash",
  "CPV",
];

// Bảng top creator riêng cho 1 campaign - tự chọn campaign + khoảng ngày độc
// lập với filter chung của trang (giống cách CreatorSearch tự fetch riêng),
// nên đặt được ở bất kỳ trang nào mà không phụ thuộc state của trang đó.
export default function CampaignTopCreatorsTable() {
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [eventId, setEventId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalViews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const eventsList = useSWR("vc-events-list", () => fetchEventsSmart(false, EVENTS_LOOKBACK_DAYS));
  const events = eventsList.data ?? [];
  const selectedEvent = events.find((ev) => ev._id === eventId);

  const content = useSWR(
    eventId ? ["vc-contents-campaign-top-creators", range.from, range.to, eventId] : null,
    () => fetchContentsSmart(range.from, range.to, false, { event: eventId })
  );

  const isLoading = !!eventId && !content.data;

  const creators = useMemo(() => (content.data ? computeCreatorStats(content.data) : []), [content.data]);

  const sorted = useMemo(() => {
    const copy = [...creators];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [creators, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [eventId, range.from, range.to, sortKey, sortDir]);

  const paged = useMemo(
    () => sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sorted, page]
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Copy toàn bộ danh sách đã sort (không chỉ trang đang xem) - kèm cột
  // Campaign để dán nhiều lần (nhiều campaign) vào cùng 1 sheet vẫn phân biệt được.
  const copyRows = useMemo(
    () =>
      sorted.map((row, index) => [
        index + 1,
        selectedEvent?.name ?? "-",
        row.name,
        row.workplaceUnitName ?? "-",
        row.videos,
        Math.round(row.totalViews),
        Math.round(row.avgViewsPerVideo),
        `${(row.engagementRate * 100).toFixed(2)}%`,
        Math.round(row.totalCash),
        Number(row.cpv.toFixed(2)),
      ]),
    [sorted, selectedEvent]
  );

  const totalColumns = COLUMNS.length + 1;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Top creator theo từng campaign</h3>
          <p className="text-xs text-gray-400">Chọn 1 campaign và khoảng ngày để xem creator nào đang dẫn đầu.</p>
        </div>
        <CopyTableButton headers={COPY_HEADERS} rows={copyRows} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="rounded-md border border-emerald-200 bg-white px-2 py-2 text-sm text-gray-600 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          <option value="">- Chọn campaign -</option>
          {events.map((ev) => (
            <option key={ev._id} value={ev._id}>
              {ev.name}
            </option>
          ))}
        </select>
        <DateRangePicker value={range} onChange={setRange} />
        {eventId && content.isValidating && <span className="text-xs text-gray-400">Đang tải...</span>}
      </div>

      {eventId && <DataErrorBanner error={content.error} hasData={!!content.data} onRetry={() => content.mutate()} />}

      {!eventId ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">
          Chọn 1 campaign ở trên để xem bảng xếp hạng creator.
        </div>
      ) : (
        <>
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">#</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="whitespace-nowrap pb-2 pr-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`transition ${sortKey === col.key ? "text-emerald-600" : "hover:text-gray-600"}`}
                      >
                        {col.label} {sortKey === col.key && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={totalColumns} className="py-2">
                        <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                      </td>
                    </tr>
                  ))}

                {!isLoading &&
                  paged.map((row, index) => (
                    <tr key={row.creatorId} className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-400">{page * PAGE_SIZE + index + 1}</td>
                      <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.name}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{row.workplaceUnitName ?? "-"}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalViews)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                        {formatNumber(row.avgViewsPerVideo)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                        {formatPercent(row.engagementRate * 100)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatCurrency(row.totalCash)}</td>
                      <td className="whitespace-nowrap py-2 text-gray-600">{row.cpv.toFixed(2)}</td>
                    </tr>
                  ))}

                {!isLoading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={totalColumns} className="py-6 text-center text-sm text-gray-400">
                      Campaign này chưa có creator nào trong khoảng thời gian đã chọn.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && sorted.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>
                {page * PAGE_SIZE + 1}-{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} / {sorted.length} creator
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Trước
                </button>
                <span>
                  Trang {page + 1}/{pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
