import Link from "next/link";
import { Input, Select, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { adminCancelEventAction, adminEventStatusAction, featureEventAction } from "../actions";

export default async function AdminEvents({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? "").replace(/[^\w\s&'-]/g, "").trim();
  const { supabase } = await requirePlatformAdmin();
  let liveQuery = supabase
    .from("events")
    .select(
      "id, title, slug, status, starts_at, is_featured, featured_rank, admissions_sold, organizations(name, is_first_party)",
    )
    .in("status", ["published", "paused"])
    .order("starts_at")
    .limit(100);
  if (q) liveQuery = liveQuery.ilike("title", `%${q}%`);
  const [{ data: live }, { data: p23 }] = await Promise.all([
    liveQuery,
    supabase.from("organizations").select("slug").eq("is_first_party", true).maybeSingle(),
  ]);
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Events</h1>
        {p23 && (
          <Link className="text-sm text-brand" href={`/organizer/${p23.slug}/events/new`}>
            + Create a Project23 event (shared engine; requires Project23 org membership)
          </Link>
        )}
      </div>
      <section>
        <h2 className="mb-1 text-base font-medium">Live events</h2>
        <p className="mb-4 text-sm text-fg-muted">
          Organizers publish events themselves. Pause takes an event off sale; Cancel refunds every
          buyer.
        </p>
        <form className="mb-4">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search events by title"
            aria-label="Search events"
            className="max-w-sm"
          />
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Event</Th>
              <Th>Sold</Th>
              <Th>Featured</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {live?.map((e) => (
              <tr key={e.id}>
                <Td>
                  <Link className="hover:text-brand" href={`/events/${e.slug}`}>
                    {e.title}
                  </Link>
                  <p className="text-xs text-fg-subtle">
                    {(e.organizations as unknown as { name: string }).name} · {e.status}
                  </p>
                </Td>
                <Td>{e.admissions_sold}</Td>
                <Td>
                  <ActionForm
                    action={featureEventAction}
                    submitLabel={e.is_featured ? "Update" : "Feature"}
                    submitVariant="secondary"
                    inline
                  >
                    <input type="hidden" name="eventId" value={e.id} />
                    <Select
                      name="featured"
                      defaultValue={String(e.is_featured)}
                      className="h-9 w-24"
                    >
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </Select>
                    <Input
                      name="rank"
                      type="number"
                      defaultValue={e.featured_rank ?? ""}
                      placeholder="Rank"
                      className="h-9 w-20"
                    />
                  </ActionForm>
                </Td>
                <Td>
                  <ActionForm
                    action={adminEventStatusAction}
                    submitLabel={e.status === "paused" ? "Resume" : "Pause"}
                    submitVariant="secondary"
                    inline
                    confirm={e.status === "paused" ? undefined : "Pause sales and hide this event?"}
                  >
                    <input type="hidden" name="eventId" value={e.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={e.status === "paused" ? "published" : "paused"}
                    />
                  </ActionForm>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-danger">Cancel</summary>
                    <ActionForm
                      action={adminCancelEventAction}
                      submitLabel="Cancel & refund all"
                      submitVariant="danger"
                      className="mt-2 grid w-64 gap-2"
                      confirm="Cancel this event and refund every buyer?"
                    >
                      <input type="hidden" name="eventId" value={e.id} />
                      <Input name="reason" placeholder="Reason" required />
                    </ActionForm>
                  </details>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
