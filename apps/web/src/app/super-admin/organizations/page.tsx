import Link from "next/link";
import { formatDateTime } from "@project23/domain";
import { Badge, Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { canAccess } from "@/lib/admin-access";
import { PageHeader, TabLinks } from "@/components/dashboard-shell";
import { OrgControls } from "@/components/admin/moderation-controls";
import { Pagination, pageRange } from "@/components/admin/pagination";

export const metadata = { title: "Organizations" };

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["suspended", "Suspended"],
  ["rejected", "Blocked"],
  ["verified", "Verified"],
  ["payout_review", "Payout review"],
] as const;

export default async function AdminOrgs({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[^\w\s-]/g, "").trim();
  const filter = FILTERS.some(([k]) => k === sp.filter) ? sp.filter! : "all";
  const { page, from, to } = pageRange(sp.page);
  const { supabase, roles } = await requirePlatformAdmin("organizations");
  const canManage = canAccess(roles, "organizations.manage");
  let query = supabase
    .from("organizations")
    .select("*, memberships(count), events(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  if (filter === "active") query = query.eq("status", "active").eq("approval_status", "approved");
  if (filter === "suspended") query = query.eq("status", "suspended");
  if (filter === "rejected") query = query.eq("approval_status", "rejected");
  if (filter === "verified") query = query.eq("verification_status", "verified");
  if (filter === "payout_review") query = query.eq("payout_status", "pending_review");
  const { data: orgs, count } = await query;
  const href = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("filter", f);
    const s = p.toString();
    return `/super-admin/organizations${s ? `?${s}` : ""}`;
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Organizations" className="mb-2" />
      <form className="flex flex-wrap gap-2">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name or slug"
          className="max-w-sm"
          aria-label="Search organizations"
        />
      </form>
      <TabLinks
        label="Filter organizations"
        links={FILTERS.map(([k, label]) => ({ href: href(k), label, active: k === filter }))}
      />
      <p className="text-sm text-fg-muted">
        New organizations are approved automatically; set approval to rejected to block one.
        Approval, public verification and payout eligibility are independent. Suspension stops new
        sales and publishing; existing tickets, orders and financial records are untouched.
      </p>
      <div>
        <Table>
          <thead>
            <tr>
              <Th>Organization</Th>
              <Th>State</Th>
              {canManage && <Th>Change (reason required, audited)</Th>}
            </tr>
          </thead>
          <tbody>
            {orgs?.map((o) => {
              const members = (o.memberships as unknown as { count: number }[])[0]?.count ?? 0;
              const events = (o.events as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <tr key={o.id} className="align-top">
                  <Td>
                    <Link
                      href={`/super-admin/organizations/${o.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {o.name}
                    </Link>
                    <p className="text-xs text-fg-subtle">
                      /{o.slug} · {members} member{members === 1 ? "" : "s"} · {events} event
                      {events === 1 ? "" : "s"} · since {formatDateTime(o.created_at)}
                    </p>
                  </Td>
                  <Td className="space-x-1 space-y-1">
                    {o.is_first_party && <Badge tone="accent">first-party</Badge>}
                    <Badge tone={o.approval_status === "approved" ? "success" : "warning"}>
                      {o.approval_status}
                    </Badge>
                    <Badge>{o.verification_status}</Badge>
                    <Badge>payout: {o.payout_status}</Badge>
                    {o.status === "suspended" && <Badge tone="danger">suspended</Badge>}
                  </Td>
                  {canManage && (
                    <Td>
                      <OrgControls orgId={o.id} />
                    </Td>
                  )}
                </tr>
              );
            })}
            {orgs?.length === 0 && (
              <tr>
                <Td colSpan={3} className="py-10 text-center text-fg-muted">
                  No organizations match.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/super-admin/organizations"
          params={{ q: q || undefined, filter: filter === "all" ? undefined : filter }}
          page={page}
          total={count ?? 0}
        />
      </div>
    </div>
  );
}
