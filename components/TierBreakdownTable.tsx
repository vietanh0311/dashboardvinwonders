"use client";

import { formatNumber, formatPercent, type CreatorTier, type TierBreakdownRow } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: TierBreakdownRow[];
};

const TIER_DOT: Record<CreatorTier, string> = {
  star: "bg-amber-500",
  stable: "bg-emerald-500",
  one_hit: "bg-purple-500",
  needs_activation: "bg-red-500",
  unclassified: "bg-gray-400",
};

export default function TierBreakdownTable({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-gray-800">Phân bổ creator theo tier</h3>
      <p className="mb-3 text-xs text-gray-400">
        % quay lại = trong số creator của tier này, bao nhiêu % đã hoạt động ở kỳ 30 ngày trước đó.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Tier</th>
              <th className="pb-2 pr-3 font-medium">Creator</th>
              <th className="pb-2 pr-3 font-medium">% views</th>
              <th className="pb-2 pr-3 font-medium">Views TB/video</th>
              <th className="pb-2 font-medium">% quay lại</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.tier} className="border-t border-gray-100">
                <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${TIER_DOT[row.tier]}`} />
                    {row.label}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                  {formatNumber(row.creators)} ({formatPercent(row.creatorsPct)})
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatPercent(row.viewsPct)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                  {formatNumber(row.avgViewsPerVideo)}
                </td>
                <td className="whitespace-nowrap py-2 text-gray-600">
                  {formatPercent(row.retentionPct)} ({formatNumber(row.returningCreators)}/
                  {formatNumber(row.creators)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
