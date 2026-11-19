import Link from "next/link";
import { formatMoney } from "@project23/domain";
import { Alert, Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { plural } from "@/lib/admin-access";
import { PageHeader, TabLinks } from "@/components/dashboard-shell";
import { TrendChart } from "@/components/admin/trend-chart";

export const metadata = { title: "Analytics" };

type Totals = Record<
  | "gross"
  | "gross_prev"
  | "revenue"
  | "revenue_prev"
  | "orders"
  | "orders_prev"
  | "admissions"
  | "admissions_prev"
  | "new_users"
  | "new_users_prev"
  | "new_orgs"
  | "new_orgs_prev"
  | "events_published"
  | "events_published_prev"
  | "refunds",
  number
>;
type SeriesPoint = {
  day: string;
  gross_minor: number;
  revenue_minor: number;
  orders: number;
  admissions: number;
  new_users: number;
  new_orgs: number;
};
type Analytics = {
  totals: Totals;
  series: SeriesPoint[];
  channels: Record<string, number>;
  top_events: {
    id: string;
    title: string;
    organization: string;
    status: string;
    gross_minor: number;
    admissions: number;
  }[];
  top_organizations: {
    id: string;
    name: string;
    slug: string;
    gross_minor: number;
    revenue_minor: number;
    orders: number;
  }[];
  top_cities: { name: string; gross_minor: number; admissions: number }[];
  top_categories: { name: string; gross_minor: number; admissions: number }[];
};

const RANGES = [7, 30, 90, 365] as const;
const METRICS = {
  gross: { key: "gross_minor", label: "Collected online", money: true },
  revenue: { key: "revenue_minor", label: "Platform revenue", money: true },
  orders: { key: "orders", label: "Paid orders", money: false },
  admissions: { key: "admissions", label: "Tickets sold", money: false },
  users: { key: "new_users", label: "New users", money: false },
  orgs: { key: "new_orgs", label: "New organizers", money: false },
} as const;
type Metric = keyof typeof METRICS;

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return <span className="text-fg-subtle">No change</span>;
  if (prev === 0) return <span className="text-success">New this period</span>;
  const pct = ((now - prev) / prev) * 100;
  const tone = pct > 0 ? "text-success" : pct < 0 ? "text-danger" : "text-fg-subtle";
  return (
    <span className={tone}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : ""}{" "}
      {Math.abs(pct).toFixed(pct !== 0 && Math.abs(pct) < 10 ? 1 : 0)}% vs previous
    </span>
  );
}

function Tile({
  label,
  value,
  now,
  prev,
  href,
  active,
}: {
  label: string;
  value: string;
  now: number;
  prev: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`block rounded-xl border p-5 transition-colors ${active ? "border-brand/50 bg-brand-soft" : "border-white/[0.05] bg-white/[0.035] hover:border-white/[0.12]"}`}
    >
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-3 text-2xl font-light leading-none tracking-[-0.02em] tabular-nums sm:text-[26px]">
        {value}
      </p>
      <p className="mt-2.5 text-xs leading-4">
        <Delta now={now} prev={prev} />
      </p>
    </Link>
  );
}

function Leaderboard({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: React.ReactNode; sub?: string; value: string; share: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">No sales in this period.</p>
        ) : (
          <ol className="grid gap-3">
            {rows.map((r) => (
              <li key={r.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="shrink-0 tabular-nums">{r.value}</span>
                </div>
                {r.sub && <p className="truncate text-xs text-fg-subtle">{r.sub}</p>}
                <div className="mt-1.5 h-1 rounded-full bg-white/[0.05]">
                  <div
                    className="h-1 rounded-full bg-brand-strong"
                    style={{ width: `${Math.max(2, Math.round(r.share * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminAnalytics({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; metric?: string }>;
}) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 30;
  const metric: Metric = sp.metric && sp.metric in METRICS ? (sp.metric as Metric) : "gross";
  const { supabase } = await requirePlatformAdmin("analytics");
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const { data, error } = await supabase.rpc("admin_analytics", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  const href = (p: { days?: number; metric?: Metric }) =>
    `/super-admin/analytics?days=${p.days ?? days}&metric=${p.metric ?? metric}`;

  if (error || !data)
    return (
      <>
        <PageHeader title="Analytics" />
        <Alert tone="danger">
          Analytics couldn&apos;t be loaded: {error?.message ?? "no data"}
        </Alert>
      </>
    );
  const a = data as unknown as Analytics;
  const t = a.totals;
  const m = METRICS[metric];
  const maxOf = (xs: number[]) => Math.max(1, ...xs);
  const evMax = maxOf(a.top_events.map((e) => e.gross_minor || e.admissions));
  const orgMax = maxOf(a.top_organizations.map((o) => o.gross_minor));
  const cityMax = maxOf(a.top_cities.map((c) => c.admissions));
  const catMax = maxOf(a.top_categories.map((c) => c.admissions));
  const channelTotal = Object.values(a.channels).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description={`Last ${days} days, compared with the ${days} days before. Lagos time; amounts in NGN.`}
        actions={
          <TabLinks
            label="Period"
            links={RANGES.map((d) => ({
              href: href({ days: d }),
              label: d === 365 ? "1y" : `${d}d`,
              active: d === days,
            }))}
          />
        }
        className="mb-0"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Collected online"
          value={formatMoney(t.gross)}
          now={t.gross}
          prev={t.gross_prev}
          href={href({ metric: "gross" })}
          active={metric === "gross"}
        />
        <Tile
          label="Platform revenue"
          value={formatMoney(t.revenue)}
          now={t.revenue}
          prev={t.revenue_prev}
          href={href({ metric: "revenue" })}
          active={metric === "revenue"}
        />
        <Tile
          label="Paid orders"
          value={t.orders.toLocaleString("en-NG")}
          now={t.orders}
          prev={t.orders_prev}
          href={href({ metric: "orders" })}
          active={metric === "orders"}
        />
        <Tile
          label="Tickets sold"
          value={t.admissions.toLocaleString("en-NG")}
          now={t.admissions}
          prev={t.admissions_prev}
          href={href({ metric: "admissions" })}
          active={metric === "admissions"}
        />
        <Tile
          label="New users"
          value={t.new_users.toLocaleString("en-NG")}
          now={t.new_users}
          prev={t.new_users_prev}
          href={href({ metric: "users" })}
          active={metric === "users"}
        />
        <Tile
          label="New organizers"
          value={t.new_orgs.toLocaleString("en-NG")}
          now={t.new_orgs}
          prev={t.new_orgs_prev}
          href={href({ metric: "orgs" })}
          active={metric === "orgs"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.label} per day</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={a.series} dataKey={m.key} label={m.label} money={m.money} />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.035] p-5 text-sm">
          <p className="text-xs text-fg-muted">Events published</p>
          <p className="mt-2 text-xl tabular-nums">{t.events_published}</p>
          <p className="mt-1 text-xs">
            <Delta now={t.events_published} prev={t.events_published_prev} />
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.035] p-5 text-sm">
          <p className="text-xs text-fg-muted">Refunds (processing or completed)</p>
          <p className="mt-2 text-xl tabular-nums">{formatMoney(t.refunds)}</p>
          <p className="mt-1 text-xs text-fg-subtle">Requested in this period</p>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.035] p-5 text-sm">
          <p className="text-xs text-fg-muted">Tickets by channel</p>
          {channelTotal === 0 ? (
            <p className="mt-2 text-fg-muted">No sales</p>
          ) : (
            <dl className="mt-2 grid gap-1">
              {(["online", "door", "comp"] as const).map((c) => (
                <div key={c} className="flex justify-between">
                  <dt className="capitalize text-fg-muted">{c === "comp" ? "Complimentary" : c}</dt>
                  <dd className="tabular-nums">
                    {(a.channels[c] ?? 0).toLocaleString("en-NG")}{" "}
                    <span className="text-fg-subtle">
                      ({Math.round(((a.channels[c] ?? 0) / channelTotal) * 100)}%)
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Leaderboard
          title="Top events"
          rows={a.top_events.map((e) => ({
            key: e.id,
            label: (
              <Link className="hover:text-brand" href={`/super-admin/events/${e.id}`}>
                {e.title}
              </Link>
            ),
            sub: `${e.organization} · ${plural(e.admissions, "ticket")}`,
            value: formatMoney(e.gross_minor),
            share: (e.gross_minor || e.admissions) / evMax,
          }))}
        />
        <Leaderboard
          title="Top organizers"
          rows={a.top_organizations.map((o) => ({
            key: o.id,
            label: (
              <Link className="hover:text-brand" href={`/super-admin/organizations/${o.id}`}>
                {o.name}
              </Link>
            ),
            sub: `${plural(o.orders, "order")} · ${formatMoney(o.revenue_minor)} platform revenue`,
            value: formatMoney(o.gross_minor),
            share: o.gross_minor / orgMax,
          }))}
        />
        <Leaderboard
          title="Cities (by tickets sold)"
          rows={a.top_cities.map((c) => ({
            key: c.name,
            label: c.name,
            sub: formatMoney(c.gross_minor) + " collected online",
            value: c.admissions.toLocaleString("en-NG"),
            share: c.admissions / cityMax,
          }))}
        />
        <Leaderboard
          title="Categories (by tickets sold)"
          rows={a.top_categories.map((c) => ({
            key: c.name,
            label: c.name,
            sub: formatMoney(c.gross_minor) + " collected online",
            value: c.admissions.toLocaleString("en-NG"),
            share: c.admissions / catMax,
          }))}
        />
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted">Daily figures</summary>
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th className="text-right">Collected</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Tickets</Th>
                <Th className="text-right">New users</Th>
              </tr>
            </thead>
            <tbody>
              {[...a.series].reverse().map((d) => (
                <tr key={d.day}>
                  <Td>{d.day}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(d.gross_minor)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(d.revenue_minor)}</Td>
                  <Td className="text-right tabular-nums">{d.orders}</Td>
                  <Td className="text-right tabular-nums">{d.admissions}</Td>
                  <Td className="text-right tabular-nums">{d.new_users}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </details>
      <p className="text-xs text-fg-subtle">
        Collected online = what buyers paid through Paystack for orders paid in the period (door and
        complimentary tickets count as tickets sold but not collected). Platform revenue = platform
        fee + buyer booking fee. Figures are order-based; withdrawable balances are on Finance.
      </p>
    </div>
  );
}
