import Link from "next/link";
import { formatEventDate } from "@project23/domain";
import { Badge, Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { canAccess } from "@/lib/admin-access";
import { PageHeader, TabLinks } from "@/components/dashboard-shell";
import { Pagination, pageRange } from "@/components/admin/pagination";
import {
  CancelControl,
  FeatureControl,
  PauseControl,
} from "@/components/admin/moderation-controls";

export const metadata = { title: "Events" };

const FILTERS = [
  ["live", "Live"],
  ["featured", "Featured"],
  ["draft", "Drafts"],
  ["past", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All"],
] as const;

export default async function AdminEvents({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[^\w\s&'-]/g, "").trim();
  const filter = FILTERS.some(([k]) => k === sp.filter) ? sp.filter! : "live";
  const { page, from, to } = pageRange(sp.page);
  const { supabase, roles } = await requirePlatformAdmin("events");
  const canManage = canAccess(roles, "events.manage");
  const canCancel = canAccess(roles, "events.cancel");

  let query = supabase
    .from("events")
    .select(
      "id, title, slug, status, starts_at, timezone, is_featured, featured_rank, admissions_sold, capacity, organization_id, organizations(name, is_first_party)",
      { count: "exact" },
    )
    .range(from, to);
  if (filter === "live") query = query.in("status", ["published", "paused"]).order("starts_at");
  else if (filter === "featured")
    query = query.eq("is_featured", true).order("featured_rank", { nullsFirst: false });
  else if (filter === "draft")
    query = query.eq("status", "draft").order("created_at", { ascending: false });
  else if (filter === "past")
    query = query.in("status", ["completed", "archived"]).order("starts_at", { ascending: false });
  else if (filter === "cancelled")
    query = query.eq("status", "cancelled").order("starts_at", { ascending: false });
  else query = query.order("starts_at", { ascending: false });
  if (q) query = query.ilike("title", `%${q}%`);

  const [{ data: events, count }, { data: p23 }] = await Promise.all([
    query,
    supabase.from("organizations").select("slug").eq("is_first_party", true).maybeSingle(),
  ]);
  const href = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "live") p.set("filter", f);
    const s = p.toString();
    return `/super-admin/events${s ? `?${s}` : ""}`;
  };
  const showControls = canManage && (filter === "live" || filter === "featured");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Events"
        description="Organizers publish events themselves. Pause takes an event off sale; Cancel refunds every buyer."
        actions={
          p23 && (
            <Link className="text-sm text-brand" href={`/organizer/${p23.slug}/events/new`}>
              + Create a Project23 event
            </Link>
          )
        }
        className="mb-2"
      />
      <form className="flex flex-wrap gap-2">
        {filter !== "live" && <input type="hidden" name="filter" value={filter} />}
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search events by title"
          aria-label="Search events"
          className="max-w-sm"
        />
      </form>
      <TabLinks
        label="Filter events"
        links={FILTERS.map(([k, label]) => ({ href: href(k), label, active: k === filter }))}
      />
      <div>
        <Table>
          <thead>
            <tr>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th className="text-right">Sold</Th>
              {showControls && <Th>Featured</Th>}
              {showControls && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {events?.map((e) => {
              const org = e.organizations as unknown as { name: string; is_first_party: boolean };
              const live = e.status === "published" || e.status === "paused";
              return (
                <tr key={e.id} className="align-top">
                  <Td>
                    <Link
                      className="font-medium hover:text-brand"
                      href={`/super-admin/events/${e.id}`}
                    >
                      {e.title}
                    </Link>
                    <p className="text-xs text-fg-subtle">
                      <Link
                        className="hover:text-fg"
                        href={`/super-admin/organizations/${e.organization_id}`}
                      >
                        {org.name}
                      </Link>{" "}
                      · {formatEventDate(e.starts_at, e.timezone)}
                    </p>
                  </Td>
                  <Td className="space-x-1">
                    <Badge
                      tone={
                        e.status === "published"
                          ? "success"
                          : e.status === "cancelled"
                            ? "danger"
                            : e.status === "paused"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {e.status.replace(/_/g, " ")}
                    </Badge>
                    {e.is_featured && (
                      <Badge tone="info">
                        featured{e.featured_rank ? ` #${e.featured_rank}` : ""}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {e.admissions_sold} / {e.capacity}
                  </Td>
                  {showControls && (
                    <Td>
                      {live && (
                        <FeatureControl
                          eventId={e.id}
                          featured={e.is_featured}
                          rank={e.featured_rank}
                        />
                      )}
                    </Td>
                  )}
                  {showControls && (
                    <Td className="space-y-2">
                      {live && <PauseControl eventId={e.id} status={e.status} />}
                      {live && canCancel && <CancelControl eventId={e.id} />}
                    </Td>
                  )}
                </tr>
              );
            })}
            {events?.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-10 text-center text-fg-muted">
                  No events match.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/super-admin/events"
          params={{ q: q || undefined, filter: filter === "live" ? undefined : filter }}
          page={page}
          total={count ?? 0}
        />
      </div>
    </div>
  );
}
