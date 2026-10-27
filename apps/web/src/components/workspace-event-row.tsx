import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCardDate } from "@project23/domain";
import { cn } from "@project23/ui";
import { EventPoster } from "./poster";

export type WorkspaceEvent = {
  id: string;
  title: string;
  slug: string;
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  admissions_sold: number;
  capacity: number;
  cover_path: string | null;
  venue_name: string | null;
  moderation_status?: string | null;
  categories?: { slug: string } | { slug: string }[] | null;
};

/** Columns needed to render a WorkspaceEventRow. */
export const WORKSPACE_EVENT_COLUMNS =
  "id, title, slug, status, moderation_status, starts_at, ends_at, timezone, admissions_sold, capacity, cover_path, venue_name, categories(slug)";

const STATUS: Record<string, { label: string; dot: string }> = {
  published: { label: "Live", dot: "bg-success" },
  pending_review: { label: "Pending review", dot: "bg-info" },
  paused: { label: "Paused", dot: "bg-warning" },
  cancelled: { label: "Cancelled", dot: "bg-danger" },
  draft: { label: "Draft", dot: "bg-fg-subtle" },
  completed: { label: "Ended", dot: "bg-fg-subtle" },
  archived: { label: "Archived", dot: "bg-fg-subtle" },
};

export function StatusDot({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), dot: "bg-fg-subtle" };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

/** Event list row: square flyer, title, date + venue, sold meter, status. */
export function WorkspaceEventRow({ e, href }: { e: WorkspaceEvent; href: string }) {
  const cat = Array.isArray(e.categories) ? e.categories[0]?.slug : e.categories?.slug;
  const pct =
    e.capacity > 0 ? Math.min(100, Math.round((e.admissions_sold / e.capacity) * 100)) : 0;
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-white/[0.035] sm:gap-5"
    >
      <EventPoster
        slug={e.slug}
        title={e.title}
        coverPath={e.cover_path}
        category={cat}
        startsAt={e.starts_at}
        timezone={e.timezone}
        venue={e.venue_name}
        shape="square"
        sizes="64px"
        className="w-14 shrink-0 sm:w-16"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{e.title}</p>
        <p className="mt-1 truncate text-xs text-fg-muted">
          {formatCardDate(e.starts_at, e.ends_at, e.timezone)}
          {e.venue_name ? ` · ${e.venue_name}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-3 sm:hidden">
          <StatusDot status={e.status} />
          <span className="text-xs tabular-nums text-fg-muted">
            {e.admissions_sold}/{e.capacity} sold
          </span>
        </div>
      </div>
      <div className="hidden w-40 shrink-0 sm:block">
        <div className="flex justify-between text-xs tabular-nums text-fg-muted">
          <span>Sold</span>
          <span>
            <span className="text-fg">{e.admissions_sold}</span> / {e.capacity}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-zinc-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="hidden w-28 shrink-0 sm:block">
        <StatusDot status={e.status} />
        {e.moderation_status === "changes_requested" && (
          <p className="mt-1 text-[11px] text-warning">Changes requested</p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-colors group-hover:text-fg" />
    </Link>
  );
}
