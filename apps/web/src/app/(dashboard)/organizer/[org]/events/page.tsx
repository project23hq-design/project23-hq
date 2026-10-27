import Link from "next/link";
import { formatEventDate } from "@project23/domain";
import { Badge, Button, EmptyState, Table, Td, Th } from "@project23/ui";
import { requireOrg } from "@/lib/auth";

const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = { published: "success", pending_review: "info", paused: "warning", cancelled: "danger", draft: "neutral" };

export default async function OrgEvents({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug, ["owner", "manager", "finance"]);
  const { data: events } = await supabase.from("events").select("id, title, slug, status, moderation_status, starts_at, timezone, admissions_sold, capacity").eq("organization_id", org.id).order("starts_at", { ascending: false });
  return (
    <div>
      <div className="mb-6 flex items-center justify-between"><h1 className="text-3xl font-bold">Events</h1>
        {org.role !== "finance" && <Button asChild><Link href={`/organizer/${org.slug}/events/new`}>Create event</Link></Button>}</div>
      {!events?.length ? <EmptyState title="No events yet" /> : (
        <Table><thead><tr><Th>Event</Th><Th>Date</Th><Th>Sold</Th><Th>Status</Th></tr></thead><tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <Td><Link className="font-medium hover:text-accent" href={`/organizer/${org.slug}/events/${e.id}`}>{e.title}</Link></Td>
              <Td className="text-fg-muted">{formatEventDate(e.starts_at, e.timezone)}</Td>
              <Td className="tabular-nums">{e.admissions_sold} / {e.capacity}</Td>
              <Td><Badge tone={TONE[e.status] ?? "neutral"}>{e.status.replace("_", " ")}</Badge>{e.moderation_status === "changes_requested" && <Badge tone="warning" className="ml-1">changes requested</Badge>}</Td>
            </tr>
          ))}
        </tbody></Table>
      )}
    </div>
  );
}
