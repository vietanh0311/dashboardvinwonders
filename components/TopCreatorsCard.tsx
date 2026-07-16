"use client";

import { formatNumber, formatPercent, type CreatorStat } from "@/lib/api";

type Props = {
  data: CreatorStat[];
  isLoading: boolean;
};

const TOP_N = 10;

// Top creator theo views trong khoảng ngày đang chọn - bản rút gọn cho màn
// Dashboard (bảng xếp hạng đầy đủ kèm tier/pareto nằm ở trang /creators).
export default function TopCreatorsCard({ data, isLoading }: Props) {
  const sorted = [...data].sort((a, b) => b.totalViews - a.totalViews);
  const top = sorted.slice(0, TOP_N);
  const totalViews = data.reduce((s, c) => s + c.totalViews, 0);
  const maxViews = top[0]?.totalViews ?? 0;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Top creator theo views</h3>
        <a href="/creators" className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
          Xem tất cả →
        </a>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">Creator</th>
              <th className="pb-2 pr-2 font-medium">Video</th>
              <th className="pb-2 pr-2 font-medium">Views</th>
              <th className="pb-2 font-medium">% tổng</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="py-2">
                    <div className="h-9 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              top.map((creator, index) => (
                <tr key={creator.creatorId} className="border-t border-gray-100">
                  <td className="py-2 pr-2 text-gray-400">{index + 1}</td>
                  <td className="max-w-[14rem] py-2 pr-2">
                    <div className="truncate font-medium text-gray-800">{creator.name}</div>
                    {creator.workplaceUnitName && (
                      <div className="truncate text-xs text-gray-400">{creator.workplaceUnitName}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-gray-600">{formatNumber(creator.videos)}</td>
                  <td className="whitespace-nowrap py-2 pr-2">
                    <div className="font-medium text-gray-800">{formatNumber(creator.totalViews)}</div>
                    <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-emerald-50">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${maxViews > 0 ? Math.max(2, (creator.totalViews / maxViews) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 text-gray-600">
                    {totalViews > 0 ? formatPercent((creator.totalViews / totalViews) * 100) : "—"}
                  </td>
                </tr>
              ))}

            {!isLoading && top.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-gray-400">
                  Không có creator nào trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
