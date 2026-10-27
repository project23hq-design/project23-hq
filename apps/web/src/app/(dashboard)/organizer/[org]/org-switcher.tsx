"use client";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@project23/ui";

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** Organization picker: avatar initial + name, opens a menu of the user's organizations. */
export function OrgSwitcher({
  current,
  orgs,
}: {
  current: string;
  orgs: { slug: string; name: string; role: string }[];
}) {
  const me = orgs.find((o) => o.slug === current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Organization: ${me?.name ?? current}`}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-2"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-sm font-semibold text-black">
          {initial(me?.name ?? current)}
        </span>
        <span className="hidden min-w-0 flex-1 sm:block">
          <span className="block truncate text-[13px] font-medium">{me?.name ?? current}</span>
          <span className="block text-[11px] capitalize text-fg-muted">{me?.role}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.slug} asChild>
            <Link href={`/organizer/${o.slug}`}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-white/[0.1] text-xs font-semibold">
                {initial(o.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.slug === current && <Check className="size-4" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organizer/new">
            <Plus className="size-4" /> New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
