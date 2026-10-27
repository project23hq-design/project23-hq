import Link from "next/link";
import { ScanLine } from "lucide-react";
import { formatEventDate } from "@project23/domain";
import { Card, EmptyState } from "@project23/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Gate" };

export default async function GateHome() {
  const { supabase } = await requireUser("/gate");
  const { data } = await supabase.rpc("my_gate_events");
  const events = (data ?? []) as { id: string; title: string; starts_at: string; timezone: string; venue_name: string | null; status: string }[];
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">Choose an event to check in</h1>
      {events.length === 0 ? (
        <div className="mt-6"><EmptyState icon={<ScanLine />} title="No events assigned">An organizer must assign you to an event before you can scan tickets.</EmptyState></div>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((e) => (
            <li key={e.id}><Link href={`/gate/${e.id}`}><Card className="p-4 hover:border-line-strong"><p className="font-semibold">{e.title}</p><p className="text-sm text-fg-muted">{formatEventDate(e.starts_at, e.timezone)}{e.venue_name ? ` · ${e.venue_name}` : ""}</p></Card></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
