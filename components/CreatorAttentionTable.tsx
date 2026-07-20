"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CREATOR_ATTENTION_REASON_LABEL,
  CREATOR_TIER_LABEL,
  formatCurrency,
  type CreatorAttentionItem,
} from "@/lib/api";

// Phân trang client-size như CreatorTable - danh sách này không có giới hạn cứng, một đợt
// chương trình lớn có thể vượt vài trăm creator cần chú ý cùng lúc.
const PAGE_SIZE = 50;

type Props = {
  isLoading: boolean;
  data: CreatorAttentionItem[];
  onSelectCreator: (creatorId: string) => void;
};

const REASON_BADGE: Record<CreatorAttentionItem["reasons"][number], string> = {
  no_phone_with_balance: "bg-amber-50 text-amber-700",
  no_contract_with_balance: "bg-amber-50 text-amber-700",
  banned_with_balance: "bg-red-50 text-red-700",
  inactive_star: "bg-purple-50 text-purple-700",
};

export default function CreatorAttentionTable({ isLoading, data, onSelectCreator }: Props) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [data]);

  const paged = useMemo(() => data.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [data, page]);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Creator cần chú ý</h3>
        <span className="text-xs text-gray-400">Bấm vào 1 hàng để xem chi tiết</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Creator</th>
              <th className="pb-2 pr-3 font-medium">Cơ sở</th>
              <th className="pb-2 pr-3 font-medium">Tier</th>
              <th className="pb-2 pr-3 font-medium">Số dư chưa rút</th>
              <th className="pb-2 font-medium">Lý do</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              paged.map((row) => (
                <tr
                  key={row.creatorId}
                  onClick={() => onSelectCreator(row.creatorId)}
                  className="cursor-pointer border-t border-gray-100 hover:bg-emerald-50/50"
                >
                  <td className="whitespace-nowrap py-2 pr-3 font-medium text-gray-800">{row.name}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{row.workplaceUnitName ?? "-"}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{CREATOR_TIER_LABEL[row.tier]}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                    {row.cashRemaining === null ? "-" : formatCurrency(row.cashRemaining)}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.reasons.map((reason) => (
                        <span
                          key={reason}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${REASON_BADGE[reason]}`}
                        >
                          {CREATOR_ATTENTION_REASON_LABEL[reason]}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-gray-400">
                  Không có creator nào cần chú ý trong khoảng thời gian đã chọn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && data.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {page * PAGE_SIZE + 1}-{Math.min(data.length, (page + 1) * PAGE_SIZE)} / {data.length} creator
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              ← Trước
            </button>
            <span>
              Trang {page + 1}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
