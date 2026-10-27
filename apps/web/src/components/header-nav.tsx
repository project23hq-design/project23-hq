"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Active link white, others zinc-400 — 12px medium, like the reference. */
export function HeaderNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <>
      {links.map((l) => {
        const active =
          path === l.href ||
          (l.href === "/explore" && path === "/") ||
          (l.href !== "/" && path.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors ${active ? "text-fg" : "text-fg-muted hover:text-fg"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
