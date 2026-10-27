import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { Wordmark } from "@/components/site-header";

export const metadata = { title: "Super admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const NAV = [
  ["", "Overview"],
  ["/events", "Events"],
  ["/organizations", "Organizations"],
  ["/orders", "Orders"],
  ["/finance", "Finance"],
  ["/fees", "Fees"],
  ["/reports", "Reports & flags"],
  ["/jobs", "Jobs"],
  ["/audit", "Audit log"],
  ["/settings", "Settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, roles } = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-danger/30 bg-bg/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Link href="/">
            <Wordmark className="text-lg" />
          </Link>
          <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">
            <ShieldCheck className="size-3.5" />
            Platform admin · {roles.join(", ")}
          </span>
          <span className="ml-auto truncate text-xs text-fg-muted">
            {user.email} · MFA verified · actions are audited
          </span>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[200px_1fr]">
        <nav
          aria-label="Admin"
          className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0"
        >
          {NAV.map(([h, l]) => (
            <Link
              key={h}
              href={`/super-admin${h}`}
              className="shrink-0 rounded-xl px-3 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {l}
            </Link>
          ))}
        </nav>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
