import Link from "next/link";
import { Alert, Badge } from "@project23/ui";
import { can } from "@project23/domain";
import { getMyOrganizations, requireOrg } from "@/lib/auth";
import { OrgSwitcher } from "./org-switcher";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrg(slug);
  const orgs = await getMyOrganizations();
  const nav = [
    { href: "", label: "Overview", show: can(org.role, "orders.view") || can(org.role, "events.manage") },
    { href: "/events", label: "Events", show: can(org.role, "events.manage") || can(org.role, "orders.view") },
    { href: "/orders", label: "Orders", show: can(org.role, "orders.view") },
    { href: "/finance", label: "Finance", show: can(org.role, "finance.view") },
    { href: "/team", label: "Team", show: can(org.role, "team.invite") },
    { href: "/settings", label: "Settings", show: can(org.role, "org.edit") },
  ].filter((n) => n.show);
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-10">
      <aside className="space-y-4">
        <OrgSwitcher current={org.slug} orgs={orgs.map((o) => ({ slug: o.slug, name: o.name, role: o.role }))} />
        <div className="flex flex-wrap gap-1.5">
          {org.is_first_party && <Badge tone="accent">First-party</Badge>}
          <Badge tone={org.approval_status === "approved" ? "success" : "warning"}>{org.approval_status === "approved" ? "Approved" : `Approval ${org.approval_status}`}</Badge>
          {org.verification_status === "verified" && <Badge tone="info">Verified</Badge>}
        </div>
        <nav aria-label="Organization" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {nav.map((n) => <Link key={n.href} href={`/organizer/${org.slug}${n.href}`} className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">{n.label}</Link>)}
          {org.role === "scanner" && <Link href="/gate" className="rounded-xl px-3 py-2 text-sm font-medium text-accent">Open gate scanner</Link>}
        </nav>
      </aside>
      <div className="min-w-0">
        {org.status === "suspended" && <Alert tone="danger" className="mb-6" title="This organization is suspended">New sales and publishing are paused. Existing tickets remain valid. Contact Project23 support.</Alert>}
        {org.approval_status === "pending" && <Alert tone="info" className="mb-6" title="Awaiting approval">You can build events now. Project23 reviews new organizers before the first event goes live.</Alert>}
        {children}
      </div>
    </div>
  );
}
