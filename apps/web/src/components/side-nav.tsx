"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@project23/ui";

export type NavLink = { href: string; label: string; icon?: React.ReactNode; exact?: boolean };

const isActive = (path: string, l: NavLink) =>
  l.exact ? path === l.href : path === l.href || path.startsWith(`${l.href}/`);

/** Sidebar links (desktop) — 13px, icon left, active row filled. */
export function SideNav({ links, label }: { links: NavLink[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="grid gap-0.5">
      {links.map((l) => {
        const active = isActive(path, l);
        return (
          <Link
            key={l.href + l.label}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
              active
                ? "bg-brand-soft text-fg [&_svg]:text-brand"
                : "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
            )}
          >
            {l.icon}
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: the same links as a horizontally scrolling row of pills. */
export function PillNav({ links, label }: { links: NavLink[]; label: string }) {
  const path = usePathname();
  return (
    <nav
      aria-label={label}
      className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden"
    >
      {links.map((l) => {
        const active = isActive(path, l);
        return (
          <Link
            key={l.href + l.label}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-colors",
              active ? "bg-accent text-accent-fg" : "bg-white/[0.06] text-fg-muted hover:text-fg",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
