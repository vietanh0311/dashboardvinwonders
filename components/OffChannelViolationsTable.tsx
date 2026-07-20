"use client";

import { formatCurrency, formatNumber, type OffChannelViolation } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: OffChannelViolation[];
  onSelectCreator: (creatorId: string) => void;
};

export default function OffChannelViolationsTable({ isLoading, data, onSelectCreator }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Vi phạm đăng ngoài kênh liên kết</h3>
          <p className="text-xs text-gray-400">Creator có video đăng bằng kênh TikTok khác kênh đã liên kết trong hồ sơ</p>
        </div>
        {!isLoading && data.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {data.length} creator
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Không phát hiện vi phạm kênh trong khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Creator</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Cơ sở</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Kênh liên kết</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Kênh trái phép</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Video/Views</th>
                <th className="pb-2 font-medium">Cash ảnh hưởng</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.creatorId}
                  onClick={() => onSelectCreator(row.creatorId)}
                  className="cursor-pointer border-t border-gray-100 hover:bg-amber-50/40"
                >
                  <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.creatorName}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{row.workplaceUnitName ?? "-"}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      @{row.linkedUsername}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {row.unauthorizedChannels.map((c) => (
                        <span
                          key={c.username}
                          className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                        >
                          @{c.username} · {c.videos}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                    {formatNumber(row.videosAffected)} / {formatNumber(row.viewsAffected)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-gray-600">
                    {row.cashAffected > 0 ? formatCurrency(row.cashAffected) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
