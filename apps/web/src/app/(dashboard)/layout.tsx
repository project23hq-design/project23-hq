import Link from "next/link";
import { Wordmark } from "@/components/site-header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Project23 home">
            <Wordmark className="text-lg" />
          </Link>
          <nav aria-label="Workspace" className="ml-2 flex gap-1 text-sm">
            <Link
              href="/organizer"
              className="rounded-full px-3 py-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              Organizer
            </Link>
            <Link
              href="/gate"
              className="rounded-full px-3 py-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              Gate
            </Link>
          </nav>
          <Link href="/account" className="ml-auto text-sm text-fg-muted hover:text-fg">
            Account
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
