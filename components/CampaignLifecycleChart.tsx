"use client";

import { format, parseISO } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, type CampaignLifecyclePoint, type CampaignMomentum, type EventItem } from "@/lib/api";

type Props = {
  events: EventItem[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  lifecycle: CampaignLifecyclePoint[];
  momentum: CampaignMomentum | null;
  isLoading: boolean;
};

function formatDateLabel(value: string) {
  try {
    return format(parseISO(value), "dd/MM");
  } catch {
    return value;
  }
}

export default function CampaignLifecycleChart({
  events,
  selectedEventId,
  onSelectEvent,
  lifecycle,
  momentum,
  isLoading,
}: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Lifecycle campaign</h3>
        <select
          value={selectedEventId}
          onChange={(e) => onSelectEvent(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-emerald-400"
        >
          <option value="">— Chọn campaign —</option>
          {events.map((ev) => (
            <option key={ev._id} value={ev._id}>
              {ev.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedEventId ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Chọn 1 campaign ở trên để xem lifecycle (dữ liệu 90 ngày gần nhất).
        </div>
      ) : isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : lifecycle.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Campaign này chưa có video nào trong 90 ngày gần nhất.
        </div>
      ) : (
        <>
          {momentum && (
            <div
              className={`mb-3 rounded-md px-3 py-2 text-sm ${
                momentum.isDeclining ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {momentum.isDeclining ? (
                <>
                  <span className="font-semibold">Đang nguội:</span> 7 ngày gần nhất đều dưới 50% đỉnh (đỉnh{" "}
                  {formatNumber(momentum.peakViews)} views ngày {formatDateLabel(momentum.peakDate)}, hiện còn{" "}
                  {formatNumber(momentum.latestViews)} views/ngày) — cần đợt push mới hoặc cân nhắc đóng campaign.
                </>
              ) : (
                <>
                  Còn momentum — đỉnh {formatNumber(momentum.peakViews)} views ngày{" "}
                  {formatDateLabel(momentum.peakDate)}, hiện {formatNumber(momentum.latestViews)} views/ngày (
                  {momentum.declineFromPeakPct > 0
                    ? `giảm ${momentum.declineFromPeakPct.toFixed(0)}% so đỉnh`
                    : "vẫn đang ở đỉnh"}
                  ).
                </>
              )}
            </div>
          )}

          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={lifecycle} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} fontSize={12} stroke="#9ca3af" />
              <YAxis yAxisId="left" fontSize={12} stroke="#9ca3af" tickFormatter={(v) => formatNumber(v)} />
              <YAxis
                yAxisId="right"
                orientation="right"
                fontSize={12}
                stroke="#9ca3af"
                allowDecimals={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip
                labelFormatter={(label) => formatDateLabel(String(label))}
                formatter={(value: number, name: string) => [formatNumber(value), name]}
              />
              <Bar yAxisId="right" dataKey="videos" name="Video" fill="#a7f3d0" radius={[4, 4, 0, 0]} barSize={18} />
              <Line yAxisId="left" type="monotone" dataKey="views" name="Views" stroke="#059669" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
