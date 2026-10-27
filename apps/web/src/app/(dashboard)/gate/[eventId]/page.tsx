import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { GateConsole } from "./console";

export const metadata = { title: "Gate scanner", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function GateEvent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase } = await requireUser(`/gate/${eventId}`);
  const { data } = await supabase.rpc("my_gate_events");
  const ev = (
    (data ?? []) as {
      id: string;
      title: string;
      can_door_sell: boolean;
      can_issue_comps: boolean;
      can_override_reentry: boolean;
    }[]
  ).find((e) => e.id === eventId);
  if (!ev) notFound();
  // Door/comp ticket types (including hidden/complimentary) — authorized in the RPC.
  const { data: types } =
    ev.can_door_sell || ev.can_issue_comps
      ? await supabase.rpc("gate_ticket_types", { p_event: eventId })
      : { data: [] };
  return <GateConsole event={ev} ticketTypes={types ?? []} />;
}
