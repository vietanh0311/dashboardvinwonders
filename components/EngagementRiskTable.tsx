"use client";

import { useEffect, useMemo, useState } from "react";
import { SOURCE_LABEL, formatNumber, formatPercent, type EngagementRiskItem } from "@/lib/api";

// Phân trang client-side để tránh render toàn bộ hàng vào DOM (danh sách này không có giới hạn
// cứng như VelocityTable - 1 campaign lớn có thể vượt vài trăm video dưới chuẩn cùng lúc).
const PAGE_SIZE = 50;

type Props = {
  isLoading: boolean;
  data: EngagementRiskItem[];
};

type SortKey = "views" | "engagementRate";

const REASON_LABEL: Record<EngagementRiskItem["reason"], string> = {
  engagement_rate: "Tương tác <0.5%",
  comment_ratio: "Tỉ lệ comment thấp",
};

export default function EngagementRiskTable({ isLoading, data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => (sortDir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return copy;
  }, [data, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [data, sortKey, sortDir]);

  const paged = useMemo(() => sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [sorted, page]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Video có nguy cơ bị từ chối (tương tác dưới chuẩn)</h3>
        <span className="text-xs text-gray-400">Chuẩn theo thể lệ chương trình - xem lib/campaignRules.ts</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Video</th>
              <th className="pb-2 pr-3 font-medium">Creator</th>
              <th className="pb-2 pr-3 font-medium">Nguồn</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("views")}
                  className={`transition ${sortKey === "views" ? "text-emerald-600" : "hover:text-gray-600"}`}
                >
                  Views {sortKey === "views" && (sortDir === "asc" ? "↑" : "↓")}
                </button>
              </th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("engagementRate")}
                  className={`transition ${sortKey === "engagementRate" ? "text-emerald-600" : "hover:text-gray-600"}`}
                >
                  Engagement {sortKey === "engagementRate" && (sortDir === "asc" ? "↑" : "↓")}
                </button>
              </th>
              <th className="pb-2 font-medium">Lý do</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              paged.map((item) => (
                <tr key={item.contentId} className="border-t border-gray-100">
                  <td className="max-w-xs py-2 pr-3">
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 font-medium text-emerald-700 hover:underline"
                      >
                        {item.title || "(không có tiêu đề)"}
                      </a>
                    ) : (
                      <span className="line-clamp-2 font-medium text-gray-700">
                        {item.title || "(không có tiêu đề)"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{item.creatorName}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{SOURCE_LABEL[item.source] ?? item.source}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(item.views)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-semibold text-red-600">
                    {formatPercent(item.engagementRate * 100)}
                  </td>
                  <td className="whitespace-nowrap py-2">
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      {REASON_LABEL[item.reason]}
                    </span>
                  </td>
                </tr>
              ))}

            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-gray-400">
                  Không có video nào dưới chuẩn tương tác trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && sorted.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {page * PAGE_SIZE + 1}-{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} / {sorted.length} video
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
