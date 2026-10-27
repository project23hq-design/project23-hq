"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@project23/domain";

/** Daily admissions sold (bars) from real orders; tooltip shows organizer net for online sales. */
export function SalesChart({
  data,
}: {
  data: { day: string; admissions: number; net_minor: number }[];
}) {
  const has = data.some((d) => d.admissions > 0);
  if (!has)
    return <p className="py-10 text-center text-sm text-fg-muted">No sales in this period yet.</p>;
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Admissions sold per day over the last 30 days"
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--surface-1)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              color: "var(--fg)",
            }}
            formatter={(v, name, item) =>
              name === "admissions"
                ? [
                    `${v} admissions · ${formatMoney((item.payload as { net_minor: number }).net_minor)} net`,
                    "Sold",
                  ]
                : [String(v), String(name)]
            }
          />
          <Bar dataKey="admissions" fill="var(--accent)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
