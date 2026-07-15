"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent, type ParetoResult } from "@/lib/api";

type Props = {
  isLoading: boolean;
  pareto: ParetoResult;
};

export default function ParetoChart({ isLoading, pareto }: Props) {
  const isEmpty = pareto.points.length <= 1;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-gray-800">Phân tích Pareto - views theo creator</h3>

      {!isLoading && !isEmpty && (
        <p className="mb-3 text-sm text-gray-600">
          <span className="font-bold text-emerald-700">
            {formatNumber(pareto.creatorsFor80PctViews)} creator ({formatPercent(pareto.creatorsFor80PctViewsPct)})
          </span>{" "}
          tạo ra 80% tổng views trong kỳ.
        </p>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : isEmpty ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={pareto.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis
              dataKey="creatorPct"
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${Math.round(v)}%`}
              fontSize={12}
              stroke="#9ca3af"
              label={{ value: "% creators (tích lũy)", position: "insideBottom", offset: -4, fontSize: 11 }}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${Math.round(v)}%`}
              fontSize={12}
              stroke="#9ca3af"
              label={{ value: "% views (tích lũy)", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(1)}%`}
              labelFormatter={(label) => `${Number(label).toFixed(1)}% creators`}
            />
            <ReferenceLine y={80} stroke="#f97316" strokeDasharray="4 4" label={{ value: "80%", fontSize: 11, fill: "#f97316" }} />
            <Area type="monotone" dataKey="viewPct" stroke="#059669" fill="#059669" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
