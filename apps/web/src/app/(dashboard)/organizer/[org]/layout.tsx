import {
  ArrowUpRight,
  CalendarDays,
  CircleUser,
  LayoutGrid,
  Receipt,
  ScanLine,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { Alert } from "@project23/ui";
import { can } from "@project23/domain";
import { getMyOrganizations, requireOrg } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { OrgSwitcher } from "./org-switcher";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireOrg(slug);
  const orgs = await getMyOrganizations();
  const base = `/organizer/${org.slug}`;
  const links = [
    {
      href: base,
      label: "Overview",
      icon: <LayoutGrid />,
      exact: true,
      show: can(org.role, "orders.view") || can(org.role, "events.manage"),
    },
    {
      href: `${base}/events`,
      label: "Events",
      icon: <CalendarDays />,
      show: can(org.role, "events.manage") || can(org.role, "orders.view"),
    },
    {
      href: `${base}/orders`,
      label: "Orders",
      icon: <Receipt />,
      show: can(org.role, "orders.view"),
    },
    {
      href: `${base}/finance`,
      label: "Finance",
      icon: <Wallet />,
      show: can(org.role, "finance.view"),
    },
    { href: `${base}/team`, label: "Team", icon: <Users />, show: can(org.role, "team.invite") },
    {
      href: `${base}/settings`,
      label: "Settings",
      icon: <Settings />,
      show: can(org.role, "org.edit"),
    },
  ]
    .filter((n) => n.show)
    .map((n) => ({ href: n.href, label: n.label, icon: n.icon, exact: n.exact }));
  const status = [
    org.is_first_party && "First-party",
    org.verification_status === "verified" && "Verified",
  ].filter(Boolean);
  return (
    <DashboardShell
      label="Organization"
      context={
        <OrgSwitcher
          current={org.slug}
          orgs={orgs.map((o) => ({ slug: o.slug, name: o.name, role: o.role }))}
        />
      }
      links={links}
      footerLinks={[
        { href: "/gate", label: "Gate scanner", icon: <ScanLine /> },
        { href: `/organizers/${org.slug}`, label: "Public profile", icon: <ArrowUpRight /> },
        { href: "/account", label: "Account", icon: <CircleUser /> },
      ]}
      footnote={status.join(" · ")}
    >
      {org.status === "suspended" && (
        <Alert tone="danger" className="mb-6" title="This organization is suspended">
          New sales and publishing are paused. Existing tickets remain valid. Contact Project23
          support.
        </Alert>
      )}
      {org.approval_status === "rejected" && (
        <Alert tone="danger" className="mb-6" title="This organization has been blocked">
          Project23 has blocked this organization from publishing. Contact support if you think this
          is a mistake.
        </Alert>
      )}
      {children}
    </DashboardShell>
  );
}
