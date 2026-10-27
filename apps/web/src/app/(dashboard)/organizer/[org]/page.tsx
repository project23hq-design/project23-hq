import Link from "next/link";
import { formatEventDate, formatMoney, can } from "@project23/domain";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Stat,
} from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { SalesChart } from "./sales-chart";

export default async function OrgOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const { data: events } = await supabase
    .from("events")
    .select("id, title, status, starts_at, timezone, admissions_sold, capacity")
    .eq("organization_id", org.id)
    .order("starts_at", { ascending: true });
  const canMoney = can(org.role, "orders.view");
  const [series, balances] = await Promise.all([
    canMoney
      ? supabase.rpc("org_sales_series", { p_org: org.id, p_days: 30 })
      : Promise.resolve({ data: null }),
    can(org.role, "finance.view")
      ? supabase.rpc("org_balances", { p_org: org.id })
      : Promise.resolve({ data: null }),
  ]);
  const s = (series.data ?? []) as {
    day: string;
    orders: number;
    admissions: number;
    net_minor: number;
  }[];
  const b = balances.data as {
    pending_minor: number;
    available_minor: number;
    processing_minor: number;
    paid_out_minor: number;
  } | null;
  const upcoming = (events ?? []).filter(
    (e) =>
      new Date(e.starts_at) > new Date() &&
      ["published", "paused", "draft", "pending_review"].includes(e.status),
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{org.name}</h1>
        {can(org.role, "events.manage") && (
          <Button asChild>
            <Link href={`/organizer/${org.slug}/events/new`}>Create event</Link>
          </Button>
        )}
      </div>
      {canMoney && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Admissions (30d)" value={s.reduce((a, d) => a + d.admissions, 0)} />
          <Stat label="Paid orders (30d)" value={s.reduce((a, d) => a + d.orders, 0)} />
          <Stat
            label="Net proceeds (30d)"
            value={formatMoney(s.reduce((a, d) => a + d.net_minor, 0))}
            hint="Online sales after platform fee & promoter commission"
          />
          {b ? (
            <Stat
              label="Available to withdraw"
              value={formatMoney(b.available_minor)}
              hint={`${formatMoney(b.pending_minor)} pending release`}
            />
          ) : (
            <Stat label="Events" value={events?.length ?? 0} />
          )}
        </div>
      )}
      {canMoney && (
        <Card>
          <CardHeader>
            <CardTitle>Admissions sold · last 30 days (WAT)</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={s} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming events</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events">Create an event to start selling.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                  <Link
                    className="min-w-0 hover:underline"
                    href={`/organizer/${org.slug}/events/${e.id}`}
                  >
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-sm text-fg-muted">
                      {formatEventDate(e.starts_at, e.timezone)}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="tabular-nums text-fg-muted">
                      {e.admissions_sold}/{e.capacity}
                    </span>
                    <Badge>{e.status.replace("_", " ")}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
