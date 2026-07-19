"use client";

import { useEffect, useMemo, useState } from "react";
import CopyTableButton from "@/components/CopyTableButton";
import {
  CHANNEL_PLATFORM_LABEL,
  CREATOR_TIER_LABEL,
  formatNumber,
  formatPercent,
  type CreatorChannelsSummary,
  type CreatorTier,
  type CreatorWithTier,
  type UserDetail,
} from "@/lib/api";

const COPY_HEADERS = [
  "#",
  "Creator",
  "Cơ sở",
  "Tier",
  "Videos",
  "Views",
  "Views TB/video",
  "Engagement (%)",
  "Cash",
  "CPV",
  "Email",
  "SĐT",
  "Thành phố",
  "Hợp đồng",
];

type Props = {
  data: CreatorWithTier[];
  isLoading: boolean;
  profiles: Map<string, UserDetail>;
  channelSummaries: Map<string, CreatorChannelsSummary>;
  onSelectCreator: (creatorId: string) => void;
};

type SortKey =
  | "name"
  | "workplaceUnitName"
  | "tier"
  | "videos"
  | "totalViews"
  | "avgViewsPerVideo"
  | "engagementRate"
  | "totalCash"
  | "cpv";

type Column = {
  key: SortKey;
  label: string;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Creator" },
  { key: "workplaceUnitName", label: "Cơ sở" },
  { key: "tier", label: "Tier" },
  { key: "videos", label: "Videos" },
  { key: "totalViews", label: "Views" },
  { key: "avgViewsPerVideo", label: "Views TB/video" },
  { key: "engagementRate", label: "Engagement" },
  { key: "totalCash", label: "Cash" },
  { key: "cpv", label: "CPV" },
];

// Số cột "tĩnh" thêm sau các cột sortable ở trên (dùng cho colSpan skeleton/empty).
const EXTRA_COLUMN_COUNT = 5;

// Render toàn bộ hàng đã sort vào DOM (không phân trang) khiến bảng giật khi
// sort/lọc lại trên danh sách lớn - phân trang client-side để giữ số hàng
// render tại 1 thời điểm ở mức cố định.
const PAGE_SIZE = 50;

const TIER_BADGE: Record<CreatorTier, string> = {
  star: "bg-amber-50 text-amber-700",
  stable: "bg-emerald-50 text-emerald-700",
  one_hit: "bg-purple-50 text-purple-700",
  needs_activation: "bg-red-50 text-red-700",
  unclassified: "bg-gray-100 text-gray-500",
};

function getSortValue(row: CreatorWithTier, key: SortKey): string | number {
  if (key === "name") return row.name.toLowerCase();
  if (key === "workplaceUnitName") return (row.workplaceUnitName ?? "").toLowerCase();
  if (key === "tier") return CREATOR_TIER_LABEL[row.tier];
  return row[key];
}

function NotLoadedCell() {
  return <span className="text-xs italic text-gray-300">chưa tải</span>;
}

export default function CreatorTable({ data, isLoading, profiles, channelSummaries, onSelectCreator }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalViews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [data, sortKey, sortDir]);

  const paged = useMemo(
    () => sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sorted, page]
  );

  // Copy toàn bộ danh sách đã sort (không chỉ trang đang xem) để dán vào
  // Google Sheets/Excel là dùng được ngay cho cả bảng, không riêng 1 trang.
  const copyRows = useMemo(
    () =>
      sorted.map((row, index) => {
        const profile = profiles.get(row.creatorId);
        return [
          index + 1,
          row.name,
          row.workplaceUnitName ?? "-",
          CREATOR_TIER_LABEL[row.tier],
          row.videos,
          Math.round(row.totalViews),
          Math.round(row.avgViewsPerVideo),
          `${(row.engagementRate * 100).toFixed(2)}%`,
          Math.round(row.totalCash),
          Number(row.cpv.toFixed(2)),
          profile?.email ?? "-",
          profile?.phone?.full ?? "-",
          profile?.info?.cityName ?? "-",
          profile?.contract?.status ?? "-",
        ];
      }),
    [sorted, profiles]
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const totalColumns = COLUMNS.length + EXTRA_COLUMN_COUNT;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Xếp hạng creator</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Bấm vào 1 hàng để xem chi tiết</span>
          <CopyTableButton headers={COPY_HEADERS} rows={copyRows} />
        </div>
      </div>

      <div className="max-h-[36rem] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
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
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Email</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">SĐT</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Thành phố</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Hợp đồng</th>
              <th className="pb-2 font-medium">Kênh</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={totalColumns} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              paged.map((row) => {
                const profile = profiles.get(row.creatorId);
                const channels = channelSummaries.get(row.creatorId);
                return (
                  <tr
                    key={row.creatorId}
                    onClick={() => onSelectCreator(row.creatorId)}
                    className="cursor-pointer border-t border-gray-100 hover:bg-emerald-50/50"
                  >
                    <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.name}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{row.workplaceUnitName ?? "-"}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_BADGE[row.tier]}`}>
                        {CREATOR_TIER_LABEL[row.tier]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.videos)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalViews)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {formatNumber(row.avgViewsPerVideo)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {formatPercent(row.engagementRate * 100)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(row.totalCash)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{row.cpv.toFixed(2)}</td>

                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {!profile ? (
                        <NotLoadedCell />
                      ) : profile.email ? (
                        <span className="inline-flex items-center gap-1">
                          {profile.email}
                          {profile.emailVerified && (
                            <span className="text-emerald-600" title="Email đã xác minh">
                              ✓
                            </span>
                          )}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {!profile ? (
                        <NotLoadedCell />
                      ) : profile.phone?.full ? (
                        <span className="inline-flex items-center gap-1">
                          {profile.phone.full}
                          {profile.phone.verified && (
                            <span className="text-emerald-600" title="SĐT đã xác minh">
                              ✓
                            </span>
                          )}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {!profile ? <NotLoadedCell /> : profile.info?.cityName ?? "-"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                      {!profile ? <NotLoadedCell /> : profile.contract?.status ?? "-"}
                    </td>
                    <td className="py-2">
                      {!channels ? (
                        <NotLoadedCell />
                      ) : (
                        <div className="flex max-w-xs flex-wrap items-center gap-1">
                          {channels.linkedChannel && (
                            <a
                              href={channels.linkedChannel.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Kênh đã liên kết"
                              className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              🔗 @{channels.linkedChannel.username}
                            </a>
                          )}
                          {channels.postedChannels.map((c) =>
                            c.identified ? (
                              <a
                                key={`${c.platform}-${c.username}`}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Kênh hay đăng video"
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                              >
                                @{c.username} · {c.videos}
                              </a>
                            ) : (
                              <span
                                key={`${c.platform}-unidentified`}
                                title="Chưa biết chính xác kênh của những video này - bấm 'Tải profile' để kiểm tra lại nhé"
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400"
                              >
                                {CHANNEL_PLATFORM_LABEL[c.platform]} · {c.videos} (chưa rõ kênh)
                              </span>
                            )
                          )}
                          {channels.offChannelWarning && (
                            <span
                              title="Có video đăng bằng kênh TikTok khác kênh đã liên kết"
                              className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                            >
                              ⚠ đăng ngoài kênh liên kết
                            </span>
                          )}
                          {!channels.linkedChannel && channels.postedChannels.length === 0 && "-"}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={totalColumns} className="py-6 text-center text-sm text-gray-400">
                  Không có creator nào khớp bộ lọc hiện tại.
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
    </div>
  );
}
