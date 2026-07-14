"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: { date: string; views: number; videos: number }[];
};

export default function DailyViewsChart({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">Tổng views theo ngày sync (tham khảo xu hướng)</h3>

      {isLoading ? (
        <div className="h-56 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-gray-400">
          Chưa có đủ lịch sử sync để vẽ biểu đồ.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis dataKey="date" fontSize={11} stroke="#9ca3af" />
            <YAxis fontSize={12} stroke="#9ca3af" tickFormatter={(v) => formatNumber(v)} />
            <Tooltip formatter={(value: number) => [formatNumber(value), "Views"]} />
            <Bar dataKey="views" name="Views" fill="#059669" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
