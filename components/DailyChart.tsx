"use client";

import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, type ContentSource, type DayMetric } from "@/lib/api";
import { SOURCE_META } from "@/lib/sourceMeta";

type Props = {
  isLoading: boolean;
  byDay: DayMetric[];
  bySource: Partial<Record<ContentSource, number>>;
};

function formatDateLabel(value: string) {
  try {
    return format(parseISO(value), "dd/MM");
  } catch {
    return value;
  }
}

function ChartCard({
  title,
  isLoading,
  isEmpty,
  children,
}: {
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-emerald-50/60" />
      ) : isEmpty ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian đã chọn.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function DailyChart({ isLoading, byDay, bySource }: Props) {
  const sourceData = (Object.keys(bySource) as ContentSource[])
    .filter((source) => (bySource[source] ?? 0) > 0)
    .map((source) => ({
      source,
      name: SOURCE_META[source]?.label ?? source,
      value: bySource[source] ?? 0,
      color: SOURCE_META[source]?.color ?? "#9ca3af",
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <ChartCard title="Video theo ngày" isLoading={isLoading} isEmpty={byDay.length === 0}>
          <BarChart data={byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis dataKey="date" tickFormatter={formatDateLabel} fontSize={12} stroke="#9ca3af" />
            <YAxis fontSize={12} stroke="#9ca3af" tickFormatter={(v) => formatNumber(v)} allowDecimals={false} />
            <Tooltip
              labelFormatter={(label) => formatDateLabel(String(label))}
              formatter={(value: number) => [formatNumber(value), "Video"]}
            />
            <Bar dataKey="videos" name="Video" fill="#059669" radius={[4, 4, 0, 0]} barSize={22} />
          </BarChart>
        </ChartCard>
      </div>

      <ChartCard title="Tỉ trọng theo nền tảng" isLoading={isLoading} isEmpty={sourceData.length === 0}>
        <PieChart>
          <Tooltip formatter={(value: number, name: string) => [formatNumber(value), name]} />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span className="text-gray-600">{value}</span>}
          />
          <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
            {sourceData.map((entry) => (
              <Cell key={entry.source} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ChartCard>

      <div className="xl:col-span-3">
        <ChartCard title="Views theo ngày" isLoading={isLoading} isEmpty={byDay.length === 0}>
          <LineChart data={byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis dataKey="date" tickFormatter={formatDateLabel} fontSize={12} stroke="#9ca3af" />
            <YAxis fontSize={12} stroke="#9ca3af" tickFormatter={(v) => formatNumber(v)} />
            <Tooltip
              labelFormatter={(label) => formatDateLabel(String(label))}
              formatter={(value: number) => [formatNumber(value), "View"]}
            />
            <Line type="monotone" dataKey="views" name="View" stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
      </div>
    </div>
  );
}
