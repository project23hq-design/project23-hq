import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, Card, EmptyState } from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { PageHeader, SectionTitle } from "@/components/dashboard-shell";
import {
  WORKSPACE_EVENT_COLUMNS,
  WorkspaceEventRow,
  type WorkspaceEvent,
} from "@/components/workspace-event-row";

export default async function OrgEvents({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug, ["owner", "manager", "finance"]);
  const { data } = await supabase
    .from("events")
    .select(WORKSPACE_EVENT_COLUMNS)
    .eq("organization_id", org.id)
    .order("starts_at", { ascending: false });
  const events = (data ?? []) as unknown as WorkspaceEvent[];
  const upcoming = events
    .filter((e) => new Date(e.ends_at) >= new Date())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => new Date(e.ends_at) < new Date());
  const href = (e: WorkspaceEvent) => `/organizer/${org.slug}/events/${e.id}`;
  return (
    <div className="space-y-10">
      <PageHeader
        title="Events"
        actions={
          org.role !== "finance" && (
            <Button asChild size="sm" className="h-9 px-4">
              <Link href={`/organizer/${org.slug}/events/new`}>
                <Plus className="size-4" /> Create event
              </Link>
            </Button>
          )
        }
      />
      {!events.length ? (
        <Card>
          <EmptyState title="No events yet">
            Create your first event — it&apos;s saved as a draft until you publish it.
          </EmptyState>
        </Card>
      ) : (
        <>
          <section>
            <SectionTitle>
              Upcoming <span className="text-fg-muted">{upcoming.length}</span>
            </SectionTitle>
            {upcoming.length ? (
              <div className="-mx-2 grid gap-1">
                {upcoming.map((e) => (
                  <WorkspaceEventRow key={e.id} e={e} href={href(e)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Nothing scheduled.</p>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <SectionTitle>
                Past <span className="text-fg-muted">{past.length}</span>
              </SectionTitle>
              <div className="-mx-2 grid gap-1">
                {past.map((e) => (
                  <WorkspaceEventRow key={e.id} e={e} href={href(e)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
