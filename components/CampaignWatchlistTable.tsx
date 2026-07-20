"use client";

import { formatNumber, type CampaignWatchlistRow } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: CampaignWatchlistRow[];
};

function formatDateVi(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return y && m && d ? `${d}/${m}/${y}` : dateStr;
}

function statusBadge(row: CampaignWatchlistRow) {
  if (row.possiblyExtended) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Có thể đã gia hạn - cần đối chiếu
      </span>
    );
  }
  if (row.isEnded) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        Đã kết thúc {formatNumber(Math.abs(row.daysRemaining))} ngày trước
      </span>
    );
  }
  if (row.daysRemaining <= 7) {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Còn {formatNumber(row.daysRemaining)} ngày
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Còn {formatNumber(row.daysRemaining)} ngày
    </span>
  );
}

export default function CampaignWatchlistTable({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Campaign cần theo dõi</h3>
        <span className="text-xs text-gray-400">Thời gian còn lại + cap đối soát theo lib/campaignRules.ts</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Campaign</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Hạn (thể lệ)</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Trạng thái</th>
              <th className="whitespace-nowrap pb-2 pr-3 font-medium">Video vượt cap</th>
              <th className="pb-2 font-medium">Views vượt cap</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              data.map((row) => (
                <tr key={row.eventName} className="border-t border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-800">{row.label}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatDateVi(row.endDate)}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{statusBadge(row)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                    {row.viewCapPerVideo === null ? (
                      <span className="text-gray-300">- (không áp cap)</span>
                    ) : row.videosOverCap > 0 ? (
                      <span className="font-semibold text-red-600">
                        {formatNumber(row.videosOverCap)}/{formatNumber(row.totalVideos)}
                      </span>
                    ) : (
                      `0/${formatNumber(row.totalVideos)}`
                    )}
                  </td>
                  <td className="py-2 text-gray-600">
                    {row.viewsBeyondCap > 0 ? formatNumber(row.viewsBeyondCap) : "-"}
                  </td>
                </tr>
              ))}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-gray-400">
                  Không có campaign nào khớp thể lệ đã cấu hình trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
