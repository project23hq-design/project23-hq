import Link from "next/link";
import { Plus } from "lucide-react";
import { formatMoney, can } from "@project23/domain";
import { Button, Card, EmptyState, Stat } from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { PageHeader, SectionTitle } from "@/components/dashboard-shell";
import {
  WORKSPACE_EVENT_COLUMNS,
  WorkspaceEventRow,
  type WorkspaceEvent,
} from "@/components/workspace-event-row";
import { SalesChart } from "./sales-chart";

export default async function OrgOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const { data: events } = await supabase
    .from("events")
    .select(WORKSPACE_EVENT_COLUMNS)
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
  const upcoming = ((events ?? []) as unknown as WorkspaceEvent[]).filter(
    (e) =>
      new Date(e.starts_at) > new Date() &&
      ["published", "paused", "draft", "pending_review"].includes(e.status),
  );
  const net30 = s.reduce((a, d) => a + d.net_minor, 0);
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Overview"
        title={org.name}
        actions={
          can(org.role, "events.manage") && (
            <Button asChild size="sm" className="h-9 px-4">
              <Link href={`/organizer/${org.slug}/events/new`}>
                <Plus className="size-4" /> Create event
              </Link>
            </Button>
          )
        }
      />
      {canMoney && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Admissions (30d)" value={s.reduce((a, d) => a + d.admissions, 0)} />
          <Stat label="Paid orders (30d)" value={s.reduce((a, d) => a + d.orders, 0)} />
          <Stat
            label="Net proceeds (30d)"
            value={formatMoney(net30)}
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
        <section>
          <SectionTitle>Admissions sold · last 30 days</SectionTitle>
          <Card className="p-5">
            <SalesChart data={s} />
          </Card>
        </section>
      )}
      <section>
        <SectionTitle
          action={
            <Link
              href={`/organizer/${org.slug}/events`}
              className="text-xs font-medium text-fg-muted hover:text-fg"
            >
              All events
            </Link>
          }
        >
          Upcoming events <span className="text-fg-muted">{upcoming.length}</span>
        </SectionTitle>
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState title="No upcoming events">Create an event to start selling.</EmptyState>
          </Card>
        ) : (
          <div className="-mx-2 grid gap-1">
            {upcoming.map((e) => (
              <WorkspaceEventRow key={e.id} e={e} href={`/organizer/${org.slug}/events/${e.id}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
