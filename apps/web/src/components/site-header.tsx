import Link from "next/link";
import { Menu } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@project23/ui";
import { getSession } from "@/lib/auth";
import { HeaderNav } from "./header-nav";
import { Wordmark } from "./wordmark";

/** 64px transparent header: wordmark left, 12px text links + "Create event" pill right. */
export async function SiteHeader() {
  const { user } = await getSession();
  const links = [
    { href: "/explore", label: "Events" },
    { href: "/project23", label: "Project23" },
    { href: "/help", label: "Help" },
    user ? { href: "/account", label: "Account" } : { href: "/sign-in", label: "Login" },
  ];
  return (
    <header className="no-print relative z-40">
      <div className="flex h-16 items-center px-4 md:px-10">
        <Link
          href="/"
          aria-label="Project23 home"
          className="rounded focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Wordmark priority />
        </Link>
        <nav aria-label="Main" className="ml-auto hidden items-center md:flex">
          <HeaderNav links={links} />
          <Link
            href="/organizer"
            className="ml-3 inline-flex h-8 items-center rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-fg hover:bg-accent-hover"
          >
            Create event
          </Link>
        </nav>
        <Dialog>
          <DialogTrigger asChild>
            <button
              className="ml-auto inline-flex size-9 items-center justify-center rounded-full text-fg hover:bg-white/[0.06] md:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
          </DialogTrigger>
          <DialogContent title="Menu" side="right">
            <nav aria-label="Mobile" className="grid gap-1 text-base">
              {[
                ...links,
                { href: "/account/tickets", label: "My tickets" },
                { href: "/orders/lookup", label: "Find my tickets" },
                { href: "/promoter", label: "Promote events" },
                { href: "/organizer", label: "Create event" },
              ].map((l) => (
                <Link
                  key={l.href + l.label}
                  href={l.href}
                  className="rounded-lg px-3 py-2.5 hover:bg-white/[0.06]"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const links = [
    ["/about", "About"],
    ["/help", "Help"],
    ["/contact", "Contact"],
    ["/orders/lookup", "Find my tickets"],
    ["/promoter", "Promoters"],
    ["/legal/terms", "Terms"],
    ["/legal/privacy", "Privacy"],
    ["/legal/refund-policy", "Refunds"],
  ];
  return (
    <footer className="no-print mt-32 border-t border-white/[0.05]">
      <div className="flex flex-col gap-4 px-4 py-8 text-xs text-fg-muted sm:flex-row sm:items-center md:px-10">
        <Wordmark className="h-6" />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 sm:ml-auto">
          {links.map(([href, label]) => (
            <Link key={href} href={href!} className="hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
