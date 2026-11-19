"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Receipt, Search, User } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@project23/ui";
import { formatMoney } from "@project23/domain";
import type { AdminSearchResults } from "@/app/super-admin/actions";

type Item = { href: string; title: string; meta: string; icon: React.ReactNode; group: string };

function toItems(r: AdminSearchResults): Item[] {
  return [
    ...r.users.map((u) => ({
      href: `/super-admin/users/${u.id}`,
      title: u.full_name || u.email,
      meta: u.full_name ? u.email : "User",
      icon: <User />,
      group: "Users",
    })),
    ...r.orders.map((o) => ({
      href: `/super-admin/orders?q=${encodeURIComponent(o.public_ref)}`,
      title: o.public_ref,
      meta: `${o.buyer_email} · ${o.status.replace(/_/g, " ")} · ${formatMoney(o.total_minor)}`,
      icon: <Receipt />,
      group: "Orders",
    })),
    ...r.events.map((e) => ({
      href: `/super-admin/events/${e.id}`,
      title: e.title,
      meta: `${e.status} · /${e.slug}`,
      icon: <CalendarDays />,
      group: "Events",
    })),
    ...r.organizations.map((o) => ({
      href: `/super-admin/organizations/${o.id}`,
      title: o.name,
      meta: `/${o.slug}${o.status === "suspended" ? " · suspended" : ""}`,
      icon: <Building2 />,
      group: "Organizations",
    })),
  ];
}

let hotkeyClaimed = false;

/** ⌘K / Ctrl+K search across users, orders, events and organizations. */
export function AdminCommandPalette({
  search,
}: {
  search: (q: string) => Promise<AdminSearchResults | null>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ term: string; items: Item[]; failed: boolean } | null>(
    null,
  );
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const term = q.trim();
  // Only show results for the term currently typed (never stale ones).
  const current = term.length >= 2 && result?.term === term ? result : null;
  const items = current?.items ?? [];
  const failed = current?.failed ?? false;

  useEffect(() => {
    // The shell renders this twice (desktop sidebar + mobile header); only one copy may
    // own the shortcut, or ⌘K would open two dialogs.
    if (hotkeyClaimed) return;
    hotkeyClaimed = true;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      hotkeyClaimed = false;
    };
  }, []);

  useEffect(() => {
    if (term.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        const r = await search(term);
        if (n !== seq.current) return;
        setResult({ term, items: r ? toItems(r) : [], failed: !r });
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [term, search]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    setQ("");
    router.push(item.href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-[13px] text-fg-muted hover:text-fg lg:w-full"
          aria-label="Search the admin area"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden lg:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-white/10 px-1.5 text-[10px] text-fg-subtle lg:inline">
            ⌘K
          </kbd>
        </button>
      </DialogTrigger>
      <DialogContent title="Search the admin area" className="max-w-xl">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3">
          <Search className="size-4 text-fg-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="Users, order refs, events, organizations"
            aria-label="Search"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="admin-search-results"
            aria-activedescendant={items[active] ? `admin-search-${active}` : undefined}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
          {pending && <span className="text-xs text-fg-subtle">Searching…</span>}
        </div>
        <ul
          id="admin-search-results"
          role="listbox"
          className="-mx-2 mt-2 max-h-[60vh] overflow-y-auto"
        >
          {term.length < 2 && (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">
              Type at least 2 characters.
            </li>
          )}
          {failed && (
            <li className="px-3 py-6 text-center text-sm text-danger">Search failed. Try again.</li>
          )}
          {term.length >= 2 && current && !pending && !failed && items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">No matches.</li>
          )}
          {items.map((item, i) => {
            const header = i === 0 || items[i - 1]?.group !== item.group;
            return (
              <li key={item.href + i} role="none">
                {header && (
                  <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
                    {item.group}
                  </p>
                )}
                <button
                  id={`admin-search-${i}`}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle ${i === active ? "bg-white/[0.07]" : ""}`}
                >
                  {item.icon}
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{item.title}</span>
                    <span className="block truncate text-xs text-fg-muted">{item.meta}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
