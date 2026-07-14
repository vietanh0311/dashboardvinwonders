"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, formatPercent, type ViewDistribution } from "@/lib/api";

type Props = {
  isLoading: boolean;
  data: ViewDistribution;
};

export default function ViewDistributionPanel({ isLoading, data }: Props) {
  const skewed = data.median > 0 && data.mean > data.median * 1.5;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">Phân phối views video</h3>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 p-3">
              <div className="text-xs text-gray-500">Median vs Mean</div>
              <div className="mt-1 text-2xl font-bold text-emerald-900">
                {formatNumber(data.median)} <span className="text-sm font-normal text-gray-400">/</span>{" "}
                {formatNumber(data.mean)}
              </div>
              <div className={`mt-1 text-xs ${skewed ? "text-amber-600" : "text-gray-400"}`}>
                {skewed ? "Lệch nhiều — phụ thuộc video viral" : "Phân phối tương đối đều"}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 p-3">
              <div className="text-xs text-gray-500">Video &quot;flop&quot; (&lt; 200 views)</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{formatPercent(data.flopPct)}</div>
              <div className="mt-1 text-xs text-gray-400">{formatNumber(data.flopCount)} video</div>
            </div>
            <div className="rounded-lg border border-gray-100 p-3">
              <div className="text-xs text-gray-500">Video &quot;viral&quot; (&gt; 10x median)</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">{formatPercent(data.viralPct)}</div>
              <div className="mt-1 text-xs text-gray-400">{formatNumber(data.viralCount)} video</div>
            </div>
          </div>

          {data.histogram.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-gray-400">
              Chưa có dữ liệu cho khoảng thời gian đã chọn.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.histogram} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="bucket" fontSize={11} stroke="#9ca3af" />
                <YAxis fontSize={12} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip formatter={(value: number) => [formatNumber(value), "Video"]} />
                <Bar dataKey="count" name="Video" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}
