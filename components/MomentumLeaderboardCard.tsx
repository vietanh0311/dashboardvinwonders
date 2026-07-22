"use client";

import { formatNumber, type MomentumEntry, type MomentumLeaderboard } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: MomentumLeaderboard;
  onSelectCreator: (creatorId: string) => void;
};

function DeltaLabel({ pct }: { pct: number }) {
  if (!Number.isFinite(pct)) {
    return (
      <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Mới nổi
      </span>
    );
  }

  const rounded = Math.round(pct * 10) / 10;
  const isUp = rounded >= 0;
  const colorClass = isUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";

  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {isUp ? "▲" : "▼"} {Math.abs(rounded).toFixed(0)}%
    </span>
  );
}

function MomentumList({
  title,
  items,
  emptyText,
  onSelectCreator,
}: {
  title: string;
  items: MomentumEntry[];
  emptyText: string;
  onSelectCreator: (creatorId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.creatorId}>
              <button
                type="button"
                onClick={() => onSelectCreator(item.creatorId)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-emerald-50/50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{item.name}</span>
                <span className="whitespace-nowrap text-xs text-gray-400">{formatNumber(item.currentViews)} views</span>
                <DeltaLabel pct={item.viewsDeltaPct} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MomentumLeaderboardCard({ isLoading, data, onSelectCreator }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />
        <div className="h-48 animate-pulse rounded-xl border border-emerald-100 bg-emerald-50/50" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">
        So sánh tổng views của creator giữa kỳ đang xem và kỳ trước đó - phản ánh sản lượng theo kỳ, không phải tốc
        độ tăng view thực (xem tốc độ tăng view thật ở trang Signals).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MomentumList
          title="Đang lên - views tăng mạnh nhất so với kỳ trước"
          items={data.risers}
          emptyText="Chưa đủ dữ liệu để xếp hạng creator tăng trưởng."
          onSelectCreator={onSelectCreator}
        />
        <MomentumList
          title="Đang giảm - cần chú ý"
          items={data.decliners}
          emptyText="Chưa đủ dữ liệu để xếp hạng creator sụt giảm."
          onSelectCreator={onSelectCreator}
        />
      </div>
    </div>
  );
}
