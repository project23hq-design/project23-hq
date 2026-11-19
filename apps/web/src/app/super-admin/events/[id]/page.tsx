import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, formatEventRange, formatMoney } from "@project23/domain";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Stat,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { plural } from "@/lib/admin-access";
import { canAccess } from "@/lib/admin-access";
import { PageHeader } from "@/components/dashboard-shell";
import { TrendChart } from "@/components/admin/trend-chart";
import {
  CancelControl,
  FeatureControl,
  PauseControl,
} from "@/components/admin/moderation-controls";

export const metadata = { title: "Event" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Summary = {
  views: number;
  capacity: number;
  admissions_sold: number;
  admissions_held: number;
  orders_paid: number;
  online_orders: number;
  gross_minor: number;
  discount_minor: number;
  platform_fee_minor: number;
  commission_minor: number;
  organizer_net_minor: number;
  door_cash_minor: number;
  refunded_minor: number;
  checked_in: number;
  valid_tickets: number;
  by_ticket_type: {
    id: string;
    name: string;
    price_minor: number;
    quantity_total: number;
    units_sold: number;
    units_held: number;
    admissions_per_unit: number;
    checked_in: number;
  }[];
  promo_codes: { code: string; completed: number; reserved: number; max: number | null }[];
  referrals: {
    enrollment_id: string;
    status: string;
    promoter_name: string;
    orders: number;
    commission_minor: number;
  }[];
};

export default async function AdminEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, roles } = await requirePlatformAdmin("events");
  const { data: ev } = await supabase
    .from("events")
    .select("*, organizations(id, name, slug, status), categories(name), cities(name)")
    .eq("id", id)
    .maybeSingle();
  if (!ev) notFound();
  const org = ev.organizations as unknown as {
    id: string;
    name: string;
    slug: string;
    status: string;
  };

  const [summary, series, orders, audit] = await Promise.all([
    supabase.rpc("org_event_summary", { p_event: id }),
    supabase.rpc("org_sales_series", { p_org: org.id, p_event: id, p_days: 30 }),
    supabase
      .from("orders")
      .select(
        "id, public_ref, buyer_name, buyer_email, status, channel, admissions, total_minor, created_at",
      )
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("audit_logs")
      .select("id, action, reason, created_at")
      .eq("entity_type", "event")
      .eq("entity_id", id)
      .order("id", { ascending: false })
      .limit(20),
  ]);
  const s = summary.data as unknown as Summary | null;
  const live = ev.status === "published" || ev.status === "paused";
  const canManage = canAccess(roles, "events.manage");
  const canCancel = canAccess(roles, "events.cancel");
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const where =
    ev.format === "online"
      ? "Online"
      : [ev.venue_name, (ev.cities as unknown as { name: string } | null)?.name]
          .filter(Boolean)
          .join(", ");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link href="/super-admin/events" className="hover:text-fg">
            ← Events
          </Link>
        }
        title={ev.title}
        description={
          <>
            <Link href={`/super-admin/organizations/${org.id}`} className="hover:text-fg">
              {org.name}
            </Link>{" "}
            · {formatEventRange(ev.starts_at, ev.ends_at, ev.timezone)}
            {where && ` · ${where}`}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                ev.status === "published"
                  ? "success"
                  : ev.status === "cancelled"
                    ? "danger"
                    : ev.status === "paused"
                      ? "warning"
                      : "neutral"
              }
            >
              {ev.status.replace(/_/g, " ")}
            </Badge>
            {ev.visibility !== "public" && <Badge>{ev.visibility}</Badge>}
            {ev.is_featured && <Badge tone="info">featured</Badge>}
            {org.status === "suspended" && <Badge tone="danger">organizer suspended</Badge>}
            {(ev.status === "published" || ev.status === "paused") && (
              <Link href={`/events/${ev.slug}`} className="text-sm text-brand">
                View page ↗
              </Link>
            )}
          </div>
        }
        className="mb-0"
      />
      {ev.cancellation_reason && (
        <p className="text-sm text-danger">Cancelled: {ev.cancellation_reason}</p>
      )}

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Tickets sold"
            value={`${s.admissions_sold} / ${s.capacity}`}
            hint={`${pct(s.admissions_sold, s.capacity)} of capacity${s.admissions_held ? ` · ${s.admissions_held} in checkout` : ""}`}
          />
          <Stat
            label="Online ticket sales"
            value={formatMoney(s.gross_minor - s.discount_minor)}
            hint={`${plural(s.online_orders, "online order")}`}
          />
          <Stat
            label="Platform fees"
            value={formatMoney(s.platform_fee_minor)}
            hint={`Organizer net ${formatMoney(s.organizer_net_minor)}`}
          />
          <Stat
            label="Checked in"
            value={`${s.checked_in} / ${s.valid_tickets}`}
            hint={`${pct(s.checked_in, s.valid_tickets)} of valid tickets · ${s.views} page views`}
          />
        </div>
      )}

      {canManage && live && (
        <Card>
          <CardHeader>
            <CardTitle>Moderation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-6">
            <div>
              <p className="mb-2 text-xs text-fg-muted">Featured on the home page</p>
              <FeatureControl eventId={ev.id} featured={ev.is_featured} rank={ev.featured_rank} />
            </div>
            <div>
              <p className="mb-2 text-xs text-fg-muted">Sales</p>
              <PauseControl eventId={ev.id} status={ev.status} />
            </div>
            {canCancel && (
              <div>
                <p className="mb-2 text-xs text-fg-muted">Cancel and refund every buyer</p>
                <CancelControl eventId={ev.id} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tickets sold, last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={(series.data ?? []) as unknown as { day: string; admissions: number }[]}
            dataKey="admissions"
            label="Tickets sold"
          />
        </CardContent>
      </Card>

      {s && (
        <section className="space-y-3">
          <h2 className="text-base font-medium">Ticket types</h2>
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Sold</Th>
                <Th className="text-right">In checkout</Th>
                <Th className="text-right">Checked in</Th>
              </tr>
            </thead>
            <tbody>
              {s.by_ticket_type.map((t) => (
                <tr key={t.id}>
                  <Td>
                    {t.name}
                    {t.admissions_per_unit > 1 && (
                      <span className="text-xs text-fg-subtle">
                        {" "}
                        · admits {t.admissions_per_unit}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {t.price_minor ? formatMoney(t.price_minor) : "Free"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {t.units_sold} / {t.quantity_total}
                  </Td>
                  <Td className="text-right tabular-nums">{t.units_held}</Td>
                  <Td className="text-right tabular-nums">{t.checked_in}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-medium">Recent orders</h2>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Buyer</Th>
              <Th>Status</Th>
              <Th className="text-right">Tickets</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {(orders.data ?? []).map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link
                    className="font-mono text-xs hover:text-brand"
                    href={`/super-admin/orders?q=${o.public_ref}`}
                  >
                    {o.public_ref}
                  </Link>
                  <p className="text-xs text-fg-subtle">
                    {formatDateTime(o.created_at)} · {o.channel}
                  </p>
                </Td>
                <Td>
                  {o.buyer_name}
                  <p className="text-xs text-fg-subtle">{o.buyer_email}</p>
                </Td>
                <Td>
                  <Badge>{o.status.replace(/_/g, " ")}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{o.admissions}</Td>
                <Td className="text-right tabular-nums">{formatMoney(o.total_minor)}</Td>
              </tr>
            ))}
            {orders.data?.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-fg-muted">
                  No orders yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      {s && (s.promo_codes.length > 0 || s.referrals.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Promo codes</CardTitle>
            </CardHeader>
            <CardContent>
              {s.promo_codes.length === 0 ? (
                <p className="text-sm text-fg-muted">None.</p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {s.promo_codes.map((p) => (
                    <li key={p.code} className="flex justify-between gap-3">
                      <span className="font-mono">{p.code}</span>
                      <span className="tabular-nums text-fg-muted">
                        {p.completed} used{p.reserved ? ` · ${p.reserved} reserved` : ""}
                        {p.max ? ` · max ${p.max}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Promoters</CardTitle>
            </CardHeader>
            <CardContent>
              {s.referrals.length === 0 ? (
                <p className="text-sm text-fg-muted">None.</p>
              ) : (
                <ul className="grid gap-1.5 text-sm">
                  {s.referrals.map((r) => (
                    <li key={r.enrollment_id} className="flex justify-between gap-3">
                      <span>
                        {r.promoter_name}{" "}
                        <span className="text-xs text-fg-subtle">· {r.status}</span>
                      </span>
                      <span className="tabular-nums text-fg-muted">
                        {plural(r.orders, "order")} · {formatMoney(r.commission_minor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {s && (s.refunded_minor > 0 || s.door_cash_minor > 0 || s.commission_minor > 0) && (
        <p className="text-sm text-fg-muted">
          Refunded {formatMoney(s.refunded_minor)} · Door sales {formatMoney(s.door_cash_minor)} ·
          Promoter commission {formatMoney(s.commission_minor)}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-medium">Activity</h2>
        {(audit.data ?? []).length === 0 ? (
          <p className="text-sm text-fg-muted">No audited activity.</p>
        ) : (
          <ul className="grid gap-1.5 text-sm">
            {audit.data!.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap justify-between gap-x-4 border-b border-line py-1.5"
              >
                <span>
                  <span className="font-mono text-xs">{l.action}</span>
                  {l.reason && <span className="text-fg-muted"> · {l.reason}</span>}
                </span>
                <span className="text-xs text-fg-subtle">{formatDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
