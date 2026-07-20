"use client";

import { Fragment, useState } from "react";
import { formatCurrency, formatNumber, type DuplicateContentGroup } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: DuplicateContentGroup[];
};

function formatDateVi(iso: string): string {
  const key = iso?.slice(0, 10);
  if (!key || key.length !== 10) return "-";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export default function DuplicateContentTable({ isLoading, data }: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Link nộp trùng lặp</h3>
          <p className="text-xs text-gray-400">Cùng 1 link xuất hiện ở nhiều lượt nộp - nghi ngờ double-dip hoặc đăng lại nội dung</p>
        </div>
        {!isLoading && data.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {data.length} link trùng lặp
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
          Không phát hiện link nộp trùng lặp trong khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400">
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Link</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Lượt nộp</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Creator</th>
                <th className="whitespace-nowrap pb-2 pr-3 font-medium">Views</th>
                <th className="pb-2 font-medium">Cash</th>
              </tr>
            </thead>
            <tbody>
              {data.map((group) => {
                const expanded = expandedKeys.has(group.normalizedLink);
                return (
                  <Fragment key={group.normalizedLink}>
                    <tr
                      onClick={() => toggle(group.normalizedLink)}
                      className="cursor-pointer border-t border-gray-100 hover:bg-amber-50/40"
                    >
                      <td className="max-w-xs truncate py-2 pr-3 font-medium text-gray-800">
                        {expanded ? "▾" : "▸"}{" "}
                        <a
                          href={group.sampleLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:underline"
                        >
                          {group.sampleLink}
                        </a>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {group.submissions} lượt
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                        {group.creators} creator{group.creators > 1 ? " (khác nhau)" : ""}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(group.totalViews)}</td>
                      <td className="whitespace-nowrap py-2 text-gray-600">{formatCurrency(group.totalCash)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={5} className="px-3 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="pb-1 pr-3 text-left font-medium">Creator</th>
                                <th className="pb-1 pr-3 text-left font-medium">Campaign</th>
                                <th className="pb-1 pr-3 text-left font-medium">Ngày đăng</th>
                                <th className="pb-1 pr-3 text-left font-medium">Views</th>
                                <th className="pb-1 text-left font-medium">Cash</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((item) => (
                                <tr key={item.contentId} className="border-t border-gray-200">
                                  <td className="py-1 pr-3 text-gray-700">{item.creatorName}</td>
                                  <td className="py-1 pr-3 text-gray-600">{item.eventName}</td>
                                  <td className="py-1 pr-3 text-gray-600">{formatDateVi(item.publishedAt)}</td>
                                  <td className="py-1 pr-3 text-gray-600">{formatNumber(item.views)}</td>
                                  <td className="py-1 text-gray-600">{formatCurrency(item.cash)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
