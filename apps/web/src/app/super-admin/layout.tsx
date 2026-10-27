import {
  ArrowUpRight,
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
  Wallet,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata = { title: "Super admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/super-admin", label: "Overview", icon: <LayoutGrid />, exact: true },
  { href: "/super-admin/events", label: "Events", icon: <CalendarDays /> },
  { href: "/super-admin/organizations", label: "Organizations", icon: <Building2 /> },
  { href: "/super-admin/orders", label: "Orders", icon: <Receipt /> },
  { href: "/super-admin/finance", label: "Finance", icon: <Wallet /> },
  { href: "/super-admin/fees", label: "Fees", icon: <Percent /> },
  { href: "/super-admin/reports", label: "Reports & flags", icon: <Flag /> },
  { href: "/super-admin/jobs", label: "Jobs", icon: <ServerCog /> },
  { href: "/super-admin/audit", label: "Audit log", icon: <ScrollText /> },
  { href: "/super-admin/settings", label: "Settings", icon: <Cog /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, roles } = await requirePlatformAdmin();
  return (
    <DashboardShell
      label="Admin"
      context={
        <div className="flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 lg:px-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger/15 text-danger">
            <ShieldCheck className="size-4" />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block text-[13px] font-medium">Platform admin</span>
            <span className="block truncate text-[11px] text-fg-muted">{roles.join(", ")}</span>
          </span>
        </div>
      }
      links={NAV}
      footerLinks={[{ href: "/", label: "View site", icon: <ArrowUpRight /> }]}
      footnote={
        <>
          <span className="block truncate">{user.email}</span>
          MFA verified · actions are audited
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
