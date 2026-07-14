"use client";

type Props = {
  isLoading: boolean;
  insights: string[];
};

export default function InsightsPanel({ isLoading, insights }: Props) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-emerald-900">Insight tự động</h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-emerald-100" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa đủ dữ liệu để sinh insight cho khoảng thời gian đã chọn.</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-emerald-900">
          {insights.map((text, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
