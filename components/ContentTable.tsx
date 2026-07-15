"use client";

import { format, parseISO } from "date-fns";
import { formatNumber, type ContentItem } from "@/lib/api";
import { SOURCE_META } from "@/components/DailyChart";

type Props = {
  items: ContentItem[];
  isLoading: boolean;
};

function formatPublishedAt(value: string) {
  try {
    return format(parseISO(value), "dd/MM/yyyy HH:mm");
  } catch {
    return value;
  }
}

export default function ContentTable({ items, isLoading }: Props) {
  const rows = items.slice(0, 100);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Video mới nhất</h3>
        <span className="text-xs text-gray-400">Tối đa 100 video, mới nhất trước</span>
      </div>

      <div className="max-h-[32rem] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-2 font-medium">Video</th>
              <th className="pb-2 pr-2 font-medium">Creator</th>
              <th className="pb-2 pr-2 font-medium">Sự kiện</th>
              <th className="pb-2 pr-2 font-medium">Tag</th>
              <th className="pb-2 pr-2 font-medium">Views</th>
              <th className="pb-2 font-medium">Ngày đăng</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="py-2">
                    <div className="h-12 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              rows.map((item) => (
                <tr key={item._id} className="border-t border-gray-100 align-top">
                  <td className="max-w-xs py-2 pr-2">
                    <div className="flex items-start gap-2">
                      {item.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.cover}
                          alt=""
                          className="h-12 w-9 flex-shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-12 w-9 flex-shrink-0 rounded bg-gray-100" />
                      )}
                      <div className="min-w-0">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 font-medium text-emerald-700 hover:underline"
                        >
                          {item.title || "(không có tiêu đề)"}
                        </a>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {SOURCE_META[item.source]?.label ?? item.source}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-gray-600">{item.createdBy?.name ?? "-"}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-gray-600">{item.event?.name ?? "-"}</td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-1">
                      {(item.warningTags ?? []).length === 0 && <span className="text-gray-300">-</span>}
                      {(item.warningTags ?? []).map((tag) => (
                        <span
                          key={tag._id}
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-gray-600">
                    {formatNumber(item.statistic?.view?.total ?? 0)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-gray-600">{formatPublishedAt(item.publishedAt)}</td>
                </tr>
              ))}

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-gray-400">
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
