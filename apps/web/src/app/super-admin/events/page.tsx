import Link from "next/link";
import { formatEventRange } from "@project23/domain";
import { Badge, Card, Input, Select, Table, Td, Th, Textarea } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { adminCancelEventAction, featureEventAction, moderateEventAction } from "../actions";

export default async function AdminEvents() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: queue }, { data: live }, { data: p23 }] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, slug, summary, description_html, starts_at, ends_at, timezone, venue_name, capacity, organizations(name, approval_status), ticket_types(name, price_minor, quantity_total)",
      )
      .eq("status", "pending_review")
      .order("created_at"),
    supabase
      .from("events")
      .select(
        "id, title, slug, status, starts_at, is_featured, featured_rank, admissions_sold, organizations(name, is_first_party)",
      )
      .in("status", ["published", "paused"])
      .order("starts_at")
      .limit(100),
    supabase.from("organizations").select("slug").eq("is_first_party", true).maybeSingle(),
  ]);
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Events</h1>
        {p23 && (
          <Link className="text-sm text-accent" href={`/organizer/${p23.slug}/events/new`}>
            + Create a Project23 event (shared engine; requires Project23 org membership)
          </Link>
        )}
      </div>
      <section>
        <h2 className="mb-4 text-base font-medium">Review queue ({queue?.length ?? 0})</h2>
        <div className="space-y-4">
          {queue?.map((e) => {
            const org = e.organizations as unknown as { name: string; approval_status: string };
            return (
              <Card key={e.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{e.title}</p>
                    <p className="text-sm text-fg-muted">
                      {org.name}{" "}
                      {org.approval_status !== "approved" && (
                        <Badge tone="warning">org {org.approval_status}</Badge>
                      )}{" "}
                      · {formatEventRange(e.starts_at, e.ends_at, e.timezone)} · {e.venue_name} ·
                      cap {e.capacity}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-sm">{e.summary}</p>
                <div
                  className="prose-event mt-2 max-h-40 overflow-auto text-sm"
                  dangerouslySetInnerHTML={{ __html: e.description_html ?? "" }}
                />
                <p className="mt-2 text-xs text-fg-subtle">
                  Tickets:{" "}
                  {(
                    e.ticket_types as unknown as {
                      name: string;
                      price_minor: number;
                      quantity_total: number;
                    }[]
                  )
                    .map((t) => `${t.name} ₦${t.price_minor / 100} ×${t.quantity_total}`)
                    .join(" · ")}
                </p>
                <ActionForm
                  action={moderateEventAction}
                  submitLabel="Submit decision"
                  className="mt-4 grid gap-2 sm:grid-cols-[180px_1fr_auto]"
                >
                  <input type="hidden" name="eventId" value={e.id} />
                  <Select name="decision">
                    <option value="approve">Approve & publish</option>
                    <option value="changes_requested">Request changes</option>
                    <option value="reject">Reject</option>
                  </Select>
                  <Textarea
                    name="notes"
                    rows={1}
                    placeholder="Notes to organizer (required for changes/reject)"
                  />
                </ActionForm>
              </Card>
            );
          })}
          {!queue?.length && <p className="text-fg-muted">Nothing waiting for review.</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-base font-medium">Live events</h2>
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
                  <Link className="hover:text-accent" href={`/events/${e.slug}`}>
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
                  <details>
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
