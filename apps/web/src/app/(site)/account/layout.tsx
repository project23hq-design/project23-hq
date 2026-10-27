import Link from "next/link";
import { requireUser } from "@/lib/auth";

const NAV = [
  ["/account", "Overview"],
  ["/account/tickets", "Tickets"],
  ["/account/orders", "Orders"],
  ["/account/saved", "Saved"],
  ["/promoter", "Promoter"],
  ["/account/security", "Security"],
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/account");
  return (
    <div className="container-page pt-8">
      <nav
        aria-label="Account"
        className="scrollbar-none -mx-4 mb-8 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {NAV.map(([href, label]) => (
          <Link
            key={href}
            href={href!}
            className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {label}
          </Link>
        ))}
        <form action="/auth/sign-out" method="post" className="ml-auto shrink-0">
          <button className="rounded-full px-4 py-2 text-sm text-fg-subtle hover:text-fg">
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
