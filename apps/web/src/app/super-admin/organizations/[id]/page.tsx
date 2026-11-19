import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, formatEventDate, formatMoney } from "@project23/domain";
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
import { canAccess } from "@/lib/admin-access";
import { PageHeader } from "@/components/dashboard-shell";
import { OrgControls } from "@/components/admin/moderation-controls";
import { TrendChart } from "@/components/admin/trend-chart";

export const metadata = { title: "Organization" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_NAMES: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  finance: "Finance",
  scanner: "Event staff",
};

type Balances = {
  pending_minor: number;
  available_minor: number;
  processing_minor: number;
  held_minor: number;
  paid_out_minor: number;
};

export default async function AdminOrganization({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, roles } = await requirePlatformAdmin("organizations");
  const { data: org } = await supabase
    .from("organizations")
    .select("*, cities(name), regions(name)")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();
  const showFinance = canAccess(roles, "finance");

  const [members, events, balances, series, payouts, recipient, audit] = await Promise.all([
    supabase.rpc("org_members", { p_org: id }),
    supabase
      .from("events")
      .select(
        "id, title, slug, status, starts_at, timezone, admissions_sold, capacity, is_featured",
      )
      .eq("organization_id", id)
      .order("starts_at", { ascending: false })
      .limit(50),
    supabase.rpc("org_balances", { p_org: id }),
    supabase.rpc("org_sales_series", { p_org: id, p_days: 30 }),
    showFinance
      ? supabase
          .from("payout_requests")
          .select("id, reference, amount_minor, status, settlement_method, created_at")
          .eq("organization_id", id)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
    supabase
      .from("payout_recipients")
      .select("bank_name, account_name, account_last4, status, verified_at, created_at")
      .eq("organization_id", id)
      .neq("status", "disabled")
      .maybeSingle(),
    supabase
      .from("audit_logs")
      .select("id, action, reason, entity_type, entity_id, created_at")
      .eq("organization_id", id)
      .order("id", { ascending: false })
      .limit(25),
  ]);
  const b = (balances.data ?? {}) as Partial<Balances>;
  const seriesData = (series.data ?? []) as unknown as {
    day: string;
    orders: number;
    admissions: number;
    net_minor: number;
  }[];
  const city = (org.cities as unknown as { name: string } | null)?.name;
  const region = (org.regions as unknown as { name: string } | null)?.name;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link href="/super-admin/organizations" className="hover:text-fg">
            ← Organizations
          </Link>
        }
        title={org.name}
        description={
          <>
            <Link href={`/organizers/${org.slug}`} className="hover:text-fg">
              /{org.slug}
            </Link>
            {[city, region].filter(Boolean).length > 0 &&
              ` · ${[city, region].filter(Boolean).join(", ")}`}{" "}
            · since {formatDateTime(org.created_at)}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-1">
            {org.is_first_party && <Badge tone="accent">first-party</Badge>}
            <Badge tone={org.approval_status === "approved" ? "success" : "warning"}>
              {org.approval_status}
            </Badge>
            <Badge tone={org.verification_status === "verified" ? "info" : "neutral"}>
              {org.verification_status}
            </Badge>
            <Badge>payout: {org.payout_status.replace(/_/g, " ")}</Badge>
            {org.status === "suspended" && <Badge tone="danger">suspended</Badge>}
          </div>
        }
        className="mb-0"
      />
      {org.status_reason && (
        <p className="text-sm text-fg-muted">Last status reason: {org.status_reason}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Pending"
          value={formatMoney(b.pending_minor ?? 0)}
          hint="Released after events end"
        />
        <Stat
          label="Available"
          value={formatMoney(b.available_minor ?? 0)}
          hint="Can be withdrawn"
        />
        <Stat label="Processing" value={formatMoney(b.processing_minor ?? 0)} />
        <Stat label="Held (disputes)" value={formatMoney(b.held_minor ?? 0)} />
        <Stat label="Paid out" value={formatMoney(b.paid_out_minor ?? 0)} />
      </div>

      {canAccess(roles, "organizations.manage") && (
        <Card>
          <CardHeader>
            <CardTitle>Change status (reason required, audited)</CardTitle>
          </CardHeader>
          <CardContent>
            <OrgControls orgId={org.id} className="grid gap-2 sm:grid-cols-4" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tickets sold, last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={seriesData} dataKey="admissions" label="Tickets sold" />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-medium">Events</h2>
        <Table>
          <thead>
            <tr>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th className="text-right">Sold</Th>
            </tr>
          </thead>
          <tbody>
            {events.data?.map((e) => (
              <tr key={e.id}>
                <Td>
                  <Link
                    href={`/super-admin/events/${e.id}`}
                    className="font-medium hover:text-brand"
                  >
                    {e.title}
                  </Link>
                  <p className="text-xs text-fg-subtle">
                    {formatEventDate(e.starts_at, e.timezone)}
                  </p>
                </Td>
                <Td className="space-x-1">
                  <Badge
                    tone={
                      e.status === "published"
                        ? "success"
                        : e.status === "cancelled"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {e.status.replace(/_/g, " ")}
                  </Badge>
                  {e.is_featured && <Badge tone="info">featured</Badge>}
                </Td>
                <Td className="text-right tabular-nums">
                  {e.admissions_sold} / {e.capacity}
                </Td>
              </tr>
            ))}
            {events.data?.length === 0 && (
              <tr>
                <Td colSpan={3} className="py-8 text-center text-fg-muted">
                  No events yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {(members.data ?? []).map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Link className="hover:text-brand" href={`/super-admin/users/${m.user_id}`}>
                      {m.full_name || m.email}
                    </Link>
                    {m.full_name && (
                      <span className="block truncate text-xs text-fg-subtle">{m.email}</span>
                    )}
                  </span>
                  <Badge>{ROLE_NAMES[m.role] ?? m.role}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contact & payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Email</dt>
                <dd className="truncate">{org.contact_email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Phone</dt>
                <dd>{org.contact_phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Website</dt>
                <dd className="truncate">{org.website ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Bank account</dt>
                <dd className="text-right">
                  {recipient.data ? (
                    <>
                      {recipient.data.bank_name} ····{recipient.data.account_last4}
                      <span className="block text-xs text-fg-subtle">
                        {recipient.data.account_name} ·{" "}
                        {recipient.data.status === "verified"
                          ? "verified"
                          : "awaiting verification"}
                      </span>
                    </>
                  ) : (
                    "Not set"
                  )}
                </dd>
              </div>
            </dl>
            {org.description && <p className="mt-4 text-sm text-fg-muted">{org.description}</p>}
          </CardContent>
        </Card>
      </div>

      {showFinance && (
        <section className="space-y-3">
          <h2 className="text-base font-medium">Recent payouts</h2>
          {(payouts.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-muted">No payout requests.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Status</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {payouts.data!.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <span className="font-mono text-xs">{p.reference}</span>
                      <p className="text-xs text-fg-subtle">{formatDateTime(p.created_at)}</p>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          p.status === "paid"
                            ? "success"
                            : p.status === "failed"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-fg-muted">
                      {p.settlement_method.replace(/_/g, " ")}
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.amount_minor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
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
