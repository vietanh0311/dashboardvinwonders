"use client";

import { format, parseISO } from "date-fns";
import { formatNumber, type ContentItem } from "@/lib/api";
import { SOURCE_META } from "@/components/DailyChart";

type Props = {
  items: ContentItem[];
  isLoading: boolean;
};

const TOP_N = 10;

function formatPublishedAt(value: string) {
  try {
    return format(parseISO(value), "dd/MM");
  } catch {
    return value;
  }
}

// Top video theo views trong khoảng ngày đang chọn - bổ sung cho bảng "Video
// mới nhất" (sắp theo ngày đăng) ở cuối trang: bảng này trả lời "video nào
// đang kéo views nhiều nhất kỳ này".
export default function TopVideosCard({ items, isLoading }: Props) {
  const top = [...items]
    .sort((a, b) => (b.statistic?.view?.total ?? 0) - (a.statistic?.view?.total ?? 0))
    .slice(0, TOP_N);
  const maxViews = top[0]?.statistic?.view?.total ?? 0;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Top video theo views</h3>
        <span className="text-xs text-gray-400">Trong khoảng thời gian đã chọn</span>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">Video</th>
              <th className="pb-2 pr-2 font-medium">Views</th>
              <th className="pb-2 pr-2 font-medium">Likes</th>
              <th className="pb-2 font-medium">Đăng</th>
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
              top.map((item, index) => {
                const views = item.statistic?.view?.total ?? 0;
                return (
                  <tr key={item._id} className="border-t border-gray-100">
                    <td className="py-2 pr-2 align-top text-gray-400">{index + 1}</td>
                    <td className="max-w-[16rem] py-2 pr-2">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 font-medium text-gray-800 hover:text-emerald-700 hover:underline"
                        title={item.title}
                      >
                        {item.title || "(không có tiêu đề)"}
                      </a>
                      <div className="mt-0.5 truncate text-xs text-gray-400">
                        {SOURCE_META[item.source]?.label ?? item.source} · {item.createdBy?.name ?? "—"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 align-top">
                      <div className="font-medium text-gray-800">{formatNumber(views)}</div>
                      <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-emerald-50">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${maxViews > 0 ? Math.max(2, (views / maxViews) * 100) : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 align-top text-gray-600">
                      {formatNumber(item.statistic?.like?.total ?? 0)}
                    </td>
                    <td className="whitespace-nowrap py-2 align-top text-gray-600">
                      {formatPublishedAt(item.publishedAt)}
                    </td>
                  </tr>
                );
              })}

            {!isLoading && top.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-gray-400">
                  Không có video nào trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
