"use client";

import { formatNumber, type CreatorRetentionCohort } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: CreatorRetentionCohort[];
};

const MONTH_OFFSETS = [0, 1, 2, 3, 4, 5];

function cellStyle(pct: number | undefined) {
  if (pct === undefined) return { backgroundColor: "transparent" };
  const alpha = 0.08 + Math.min(pct, 100) / 100 * 0.7;
  return { backgroundColor: `rgba(5, 150, 105, ${alpha.toFixed(2)})` };
}

export default function RetentionCohortTable({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Cohort giữ chân creator</h3>
        <p className="text-xs text-gray-400">
          % creator còn đăng bài theo số tháng kể từ bài đăng đầu tiên (toàn bộ lịch sử, không theo bộ lọc ngày phía trên)
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Chưa đủ dữ liệu lịch sử để tính cohort.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-[2px] text-left text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="whitespace-nowrap pb-1 pr-3 font-medium">Cohort</th>
                <th className="whitespace-nowrap pb-1 pr-3 font-medium">Cỡ</th>
                {MONTH_OFFSETS.map((m) => (
                  <th key={m} className="w-16 pb-1 text-center font-medium">
                    Tháng {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((cohort) => {
                const byOffset = new Map(cohort.retention.map((r) => [r.monthOffset, r]));
                return (
                  <tr key={cohort.cohortMonth}>
                    <td className="whitespace-nowrap py-1 pr-3 font-medium text-gray-800">{cohort.cohortMonth}</td>
                    <td className="whitespace-nowrap py-1 pr-3 text-gray-500">{formatNumber(cohort.cohortSize)}</td>
                    {MONTH_OFFSETS.map((m) => {
                      const entry = byOffset.get(m);
                      return (
                        <td
                          key={m}
                          className="rounded-sm py-1 text-center text-gray-700"
                          style={cellStyle(entry?.retentionPct)}
                          title={
                            entry
                              ? `${formatNumber(entry.activeCreators)}/${formatNumber(cohort.cohortSize)} creator còn hoạt động`
                              : "Chưa tới mốc này hoặc chưa có dữ liệu"
                          }
                        >
                          {entry ? `${entry.retentionPct}%` : "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
