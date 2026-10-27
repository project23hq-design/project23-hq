import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Owner/manager attendee export. Authorization comes from RLS on the user's own session. */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("id, slug, organization_id").eq("id", eventId).maybeSingle();
  if (!ev) return new NextResponse("Not found", { status: 404 });
  const { data: role } = await supabase.from("memberships").select("role").eq("organization_id", ev.organization_id).maybeSingle();
  if (!role || !["owner", "manager"].includes(role.role)) return new NextResponse("Forbidden", { status: 403 });
  const { data: tickets } = await supabase.from("tickets").select("public_ref, status, attendee_name, first_checked_in_at, admission_number, order_id, ticket_types(name)").eq("event_id", eventId).limit(20000);
  const orderIds = [...new Set((tickets ?? []).map((t) => t.order_id))];
  const { data: orders } = orderIds.length ? await supabase.from("orders").select("id, public_ref, buyer_name, buyer_email, buyer_phone, channel").in("id", orderIds) : { data: [] };
  const rows = [["ticket_ref", "ticket_type", "status", "holder_name", "buyer_email", "buyer_phone", "order_ref", "channel", "checked_in_at"].join(",")];
  for (const t of tickets ?? []) {
    const o = orders?.find((x) => x.id === t.order_id);
    rows.push([t.public_ref, (t.ticket_types as unknown as { name: string })?.name, t.status, t.attendee_name ?? o?.buyer_name, o?.buyer_email, o?.buyer_phone, o?.public_ref, o?.channel, t.first_checked_in_at].map(cell).join(","));
  }
  return new NextResponse(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${ev.slug}-attendees.csv"`, "Cache-Control": "private, no-store" } });
}
