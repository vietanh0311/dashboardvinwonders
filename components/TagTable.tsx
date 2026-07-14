"use client";

import { formatNumber, type NamedMetric } from "@/lib/api";

type Props = {
  data: NamedMetric[];
  isLoading: boolean;
};

export default function TagTable({ data, isLoading }: Props) {
  const sorted = [...data].sort((a, b) => b.videos - a.videos);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">Theo tag</h3>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-2 font-medium">Tag</th>
              <th className="pb-2 pr-2 font-medium">Video</th>
              <th className="pb-2 font-medium">Views</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={3} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              sorted.map((row) => (
                <tr key={row.name} className="border-t border-gray-100">
                  <td className="py-2 pr-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {row.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-gray-600">{formatNumber(row.videos)}</td>
                  <td className="whitespace-nowrap py-2 text-gray-600">{formatNumber(row.views)}</td>
                </tr>
              ))}

            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-gray-400">
                  Không có tag nào trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
