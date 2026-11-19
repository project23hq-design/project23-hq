"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@project23/domain";

type Point = Record<string, number | string> & { day: string };

const compactMoney = (minor: number) => {
  const naira = minor / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}m`;
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}k`;
  return `₦${Math.round(naira)}`;
};

/** Single-series daily trend. `money` values are kobo and are formatted as naira. */
export function TrendChart({
  data,
  dataKey,
  label,
  money = false,
  color = "var(--brand-strong)",
}: {
  data: Point[];
  dataKey: string;
  label: string;
  money?: boolean;
  color?: string;
}) {
  const has = data.some((d) => Number(d[dataKey]) > 0);
  if (!has)
    return <p className="py-16 text-center text-sm text-fg-muted">Nothing in this period.</p>;
  const id = `trend-${dataKey}`;
  return (
    <div className="h-60 w-full" role="img" aria-label={`${label} per day`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: money ? 0 : -20, right: 8, top: 8 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={(v: number) => (money ? compactMoney(v) : String(v))}
            tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={money ? 56 : 40}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            contentStyle={{
              background: "var(--surface-1)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--fg)",
            }}
            labelStyle={{ color: "var(--fg-muted)" }}
            formatter={(v) => [
              money ? formatMoney(Number(v)) : Number(v).toLocaleString("en-NG"),
              label,
            ]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
