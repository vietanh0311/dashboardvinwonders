"use client";

import { formatNumber, type VelocityItem } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: VelocityItem[];
};

export default function VelocityTable({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Video đang tăng tốc nhất (~48h gần nhất)</h3>
        <span className="text-xs text-gray-400">So sánh 2 lần sync gần nhất mỗi video</span>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Video</th>
              <th className="pb-2 pr-3 font-medium">Creator</th>
              <th className="pb-2 pr-3 font-medium">Views hiện tại</th>
              <th className="pb-2 pr-3 font-medium">+Views</th>
              <th className="pb-2 font-medium">Views/giờ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              data.map((v) => (
                <tr key={v.contentId} className="border-t border-gray-100">
                  <td className="max-w-xs py-2 pr-3">
                    {v.link ? (
                      <a
                        href={v.link}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 font-medium text-emerald-700 hover:underline"
                      >
                        {v.title || "(không có tiêu đề)"}
                      </a>
                    ) : (
                      <span className="line-clamp-2 font-medium text-gray-700">
                        {v.title || "(không có tiêu đề)"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{v.creatorName}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(v.views)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-semibold text-emerald-600">
                    +{formatNumber(v.deltaViews)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-gray-600">{formatNumber(v.viewsPerHour)}</td>
                </tr>
              ))}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-gray-400">
                  Chưa đủ lịch sử (cần ít nhất 2 lần sync ở 2 ngày khác nhau) để tính velocity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
