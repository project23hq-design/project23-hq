import Link from "next/link";
import { Menu, Search, Ticket, UserRound } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger } from "@project23/ui";
import { getSession } from "@/lib/auth";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-display text-xl font-extrabold tracking-tight ${className ?? ""}`}>
      project<span className="text-accent">23</span>
    </span>
  );
}

export async function SiteHeader() {
  const { user } = await getSession();
  const links = [
    { href: "/explore", label: "Explore" },
    { href: "/project23", label: "Project23 Events" },
    { href: "/organizer", label: "Sell tickets" },
  ];
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line/60 bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" aria-label="Project23 home" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring"><Wordmark /></Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Search events"><Link href="/explore"><Search /></Link></Button>
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/account/tickets"><Ticket /> My tickets</Link></Button>
              <Button asChild variant="secondary" size="icon" aria-label="Account"><Link href="/account"><UserRound /></Link></Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/sign-in">Log in</Link></Button>
              <Button asChild size="sm"><Link href="/sign-up">Sign up</Link></Button>
            </>
          )}
          <Dialog>
            <DialogTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu /></Button></DialogTrigger>
            <DialogContent title="Menu" side="right">
              <nav aria-label="Mobile" className="grid gap-1">
                {[...links, { href: "/orders/lookup", label: "Find my tickets" }, { href: "/promoter", label: "Promoter earnings" }, { href: "/help", label: "Help" }].map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-surface-2">{l.label}</Link>
                ))}
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const cols = [
    { title: "Discover", links: [["/explore", "Explore events"], ["/explore?city=osogbo", "Osogbo"], ["/explore?city=ile-ife", "Ile-Ife"], ["/project23", "Project23 Events"]] },
    { title: "Organizers", links: [["/organizer", "Sell tickets"], ["/promoter", "Promoter program"], ["/legal/organizer-terms", "Organizer terms"]] },
    { title: "Support", links: [["/help", "Help centre"], ["/orders/lookup", "Find my tickets"], ["/contact", "Contact"], ["/legal/refund-policy", "Refund policy"]] },
    { title: "Company", links: [["/about", "About"], ["/legal/terms", "Terms"], ["/legal/privacy", "Privacy"]] },
  ];
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-fg-muted">Events across Osun State and Nigeria. Prices in naira; times shown in West Africa Time unless stated.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map(([href, label]) => (
                <li key={href}><Link href={href!} className="text-sm text-fg-muted hover:text-fg">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-page border-t border-line py-6 text-xs text-fg-subtle">© {new Date().getFullYear()} Project23. Event listings are provided by organizers.</div>
    </footer>
  );
}
