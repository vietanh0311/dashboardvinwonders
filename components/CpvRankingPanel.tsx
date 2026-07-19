"use client";

import { useMemo } from "react";
import CopyTableButton from "@/components/CopyTableButton";
import { formatCurrency, formatNumber, type CpvRanking, type CreatorWithTier } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: CpvRanking;
  onSelectCreator: (creatorId: string) => void;
};

const COPY_HEADERS = ["Nhóm", "Creator", "Views", "Cash", "CPV"];

function CreatorRow({
  creator,
  onSelectCreator,
}: {
  creator: CreatorWithTier;
  onSelectCreator: (creatorId: string) => void;
}) {
  return (
    <li
      onClick={() => onSelectCreator(creator.creatorId)}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-emerald-50/50"
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-gray-800">{creator.name}</div>
        <div className="text-xs text-gray-400">
          {formatNumber(creator.totalViews)} views · {formatCurrency(creator.totalCash)}
        </div>
      </div>
      <div className="whitespace-nowrap text-sm font-semibold text-gray-700">{creator.cpv.toFixed(2)}</div>
    </li>
  );
}

export default function CpvRankingPanel({ isLoading, data, onSelectCreator }: Props) {
  const hasData = data.mostEfficient.length > 0 || data.leastEfficient.length > 0;

  const copyRows = useMemo(
    () => [
      ...data.mostEfficient.map((c) => [
        "Hiệu quả nhất",
        c.name,
        Math.round(c.totalViews),
        Math.round(c.totalCash),
        Number(c.cpv.toFixed(2)),
      ]),
      ...data.leastEfficient.map((c) => [
        "Kém hiệu quả nhất",
        c.name,
        Math.round(c.totalViews),
        Math.round(c.totalCash),
        Number(c.cpv.toFixed(2)),
      ]),
    ],
    [data]
  );

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Xếp hạng CPV (chi phí/view)</h3>
        <CopyTableButton headers={COPY_HEADERS} rows={copyRows} />
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Chỉ xét creator có phát sinh cash và đủ views để tránh nhiễu mẫu nhỏ.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-md bg-emerald-50/60" />
          ))}
        </div>
      ) : !hasData ? (
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Chưa đủ dữ liệu (cần creator có cash) cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-emerald-600">Hiệu quả nhất (CPV thấp)</h4>
            <ul className="space-y-0.5 text-sm">
              {data.mostEfficient.map((c) => (
                <CreatorRow key={c.creatorId} creator={c} onSelectCreator={onSelectCreator} />
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-red-500">Kém hiệu quả nhất (CPV cao)</h4>
            <ul className="space-y-0.5 text-sm">
              {data.leastEfficient.map((c) => (
                <CreatorRow key={c.creatorId} creator={c} onSelectCreator={onSelectCreator} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
