"use client";

import { formatNumber, type AnomalyReason, type AnomalyVideoItem } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: AnomalyVideoItem[];
  windowDays: number;
};

const REASON_LABEL: Record<AnomalyReason, string> = {
  velocity_spike: "Tăng đột biến",
  late_spike: "Bùng nổ muộn",
  engagement_mismatch: "Tương tác lệch",
  negative_views: "View âm",
  creator_cluster: "Nhiều video cùng creator",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-red-100 text-red-700" : score >= 40 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{score}</span>;
}

// Chỉ hiển thị/cảnh báo - KHÔNG tự kết luận buff/cheat. Xem
// supabase-migration-anomaly.sql cho toàn bộ logic chấm điểm + ngưỡng (đang là
// ngưỡng khởi điểm, cần tinh chỉnh sau khi có phản hồi thực tế).
export default function AnomalyTable({ isLoading, data, windowDays }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-gray-800">Video/creator nghi bất thường (nghi mua view)</h3>
        <span className="text-xs text-gray-400">Cửa sổ {windowDays} ngày gần nhất - chỉ để tham khảo, không kết luận</span>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="sticky top-0 bg-white text-xs uppercase text-gray-400">
              <th className="pb-2 pr-3 font-medium">Video</th>
              <th className="pb-2 pr-3 font-medium">Creator</th>
              <th className="pb-2 pr-3 font-medium">Ngày</th>
              <th className="pb-2 pr-3 font-medium">Views</th>
              <th className="pb-2 pr-3 font-medium">Δ Views</th>
              <th className="pb-2 pr-3 font-medium">Điểm</th>
              <th className="pb-2 font-medium">Lý do</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="py-2">
                    <div className="h-8 animate-pulse rounded-md bg-emerald-50/60" />
                  </td>
                </tr>
              ))}

            {!isLoading &&
              data.map((v) => (
                <tr key={`${v.contentId}-${v.snapshotDate}`} className="border-t border-gray-100">
                  <td className="max-w-xs py-2 pr-3">
                    {v.link ? (
                      <a
                        href={v.link}
                        target="_blank"
                        rel="noreferrer"
                        className="line-clamp-2 font-medium text-emerald-700 hover:underline"
                      >
                        {v.title || "(không có tiêu đề)"}
                      </a>
                    ) : (
                      <span className="line-clamp-2 font-medium text-gray-700">{v.title || "(không có tiêu đề)"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{v.creatorName}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{v.snapshotDate}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatNumber(v.views)}</td>
                  <td
                    className={`whitespace-nowrap py-2 pr-3 font-medium ${v.deltaViews < 0 ? "text-red-600" : "text-gray-600"}`}
                  >
                    {v.deltaViews >= 0 ? "+" : ""}
                    {formatNumber(v.deltaViews)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <ScoreBadge score={v.score} />
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {v.reasons.map((r) => (
                        <span
                          key={r}
                          className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {REASON_LABEL[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-gray-400">
                  Không có video nào bị gắn cờ bất thường trong {windowDays} ngày gần nhất - có thể do không có dấu
                  hiệu nào, hoặc chưa đủ lịch sử sync (cần tối thiểu ~7 ngày dữ liệu) để tính baseline.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
