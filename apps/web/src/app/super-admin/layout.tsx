import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  Cog,
  Flag,
  LayoutGrid,
  Percent,
  Receipt,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  canAccess,
  ROLE_LABELS,
  type AdminCapability,
  type PlatformRole,
} from "@/lib/admin-access";
import { DashboardShell } from "@/components/dashboard-shell";
import { AdminCommandPalette } from "@/components/admin/command-palette";
import type { NavLink } from "@/components/side-nav";
import { adminSearchAction } from "./actions";

export const metadata = {
  title: { default: "Super admin", template: "%s · Admin · Project23" },
  robots: { index: false },
};
export const dynamic = "force-dynamic";

const NAV: (NavLink & { cap: AdminCapability })[] = [
  { href: "/super-admin", label: "Overview", icon: <LayoutGrid />, exact: true, cap: "overview" },
  { href: "/super-admin/analytics", label: "Analytics", icon: <BarChart3 />, cap: "analytics" },
  { href: "/super-admin/users", label: "Users", icon: <Users />, cap: "users" },
  { href: "/super-admin/events", label: "Events", icon: <CalendarDays />, cap: "events" },
  {
    href: "/super-admin/organizations",
    label: "Organizations",
    icon: <Building2 />,
    cap: "organizations",
  },
  { href: "/super-admin/orders", label: "Orders", icon: <Receipt />, cap: "orders" },
  { href: "/super-admin/finance", label: "Finance", icon: <Wallet />, cap: "finance" },
  { href: "/super-admin/fees", label: "Fees", icon: <Percent />, cap: "fees" },
  { href: "/super-admin/categories", label: "Categories", icon: <Tags />, cap: "categories" },
  { href: "/super-admin/reports", label: "Reports & flags", icon: <Flag />, cap: "reports" },
  { href: "/super-admin/jobs", label: "Jobs", icon: <ServerCog />, cap: "jobs" },
  { href: "/super-admin/audit", label: "Audit log", icon: <ScrollText />, cap: "audit" },
  { href: "/super-admin/staff", label: "Staff", icon: <UserCog />, cap: "staff" },
  { href: "/super-admin/settings", label: "Settings", icon: <Cog />, cap: "settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, roles } = await requirePlatformAdmin();
  const links = NAV.filter((l) => canAccess(roles, l.cap)).map(({ cap: _cap, ...l }) => l);
  return (
    <DashboardShell
      label="Admin"
      context={
        <div className="flex min-w-0 items-center gap-2 lg:grid lg:gap-3">
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 lg:px-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger/15 text-danger">
              <ShieldCheck className="size-4" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-[13px] font-medium">Platform admin</span>
              <span className="block truncate text-[11px] text-fg-muted">
                {roles.map((r) => ROLE_LABELS[r as PlatformRole] ?? r).join(", ")}
              </span>
            </span>
          </div>
          <AdminCommandPalette search={adminSearchAction} />
        </div>
      }
      links={links}
      footerLinks={[{ href: "/", label: "View site", icon: <ArrowUpRight /> }]}
      footnote={
        <>
          <span className="block truncate">{user.email}</span>
          Actions are audited
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
