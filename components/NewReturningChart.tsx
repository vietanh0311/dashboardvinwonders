"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, type WeeklyCreatorTrend } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: WeeklyCreatorTrend[];
};

export default function NewReturningChart({ isLoading, data }: Props) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">Creator mới vs quay lại theo tuần</h3>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis dataKey="week" fontSize={12} stroke="#9ca3af" />
            <YAxis fontSize={12} stroke="#9ca3af" tickFormatter={(v) => formatNumber(v)} allowDecimals={false} />
            <Tooltip formatter={(value: number, name: string) => [formatNumber(value), name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="newCreators" name="Mới" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
            <Bar dataKey="returningCreators" name="Quay lại" stackId="a" fill="#a7f3d0" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
