import Link from "next/link";
import { Ticket } from "lucide-react";
import { formatEventDate } from "@project23/domain";
import { Button, Card, EmptyState } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { EventPoster } from "@/components/poster";

export const metadata = { title: "My tickets" };

export default async function MyTickets() {
  const { supabase } = await requireUser("/account/tickets");
  await supabase.rpc("link_my_orders");
  const { data: orders } = await supabase.from("orders")
    .select("id, public_ref, admissions, status, events!inner(title, slug, starts_at, ends_at, timezone, venue_name, cover_path, category_id)")
    .in("status", ["paid", "partially_refunded"]).order("created_at", { ascending: false }).limit(100);
  const now = Date.now();
  const list = (orders ?? []).map((o) => ({ ...o, ev: o.events as unknown as { title: string; slug: string; starts_at: string; ends_at: string; timezone: string; venue_name: string | null; cover_path: string | null } }));
  const upcoming = list.filter((o) => new Date(o.ev.ends_at).getTime() > now).sort((a, b) => a.ev.starts_at.localeCompare(b.ev.starts_at));
  const past = list.filter((o) => new Date(o.ev.ends_at).getTime() <= now);
  return (
    <div>
      <h1 className="text-3xl font-bold">My tickets</h1>
      {upcoming.length === 0 ? (
        <div className="mt-6"><EmptyState icon={<Ticket />} title="No upcoming tickets" action={<Button asChild><Link href="/explore">Find an event</Link></Button>}>
          Bought as a guest with this email? Tickets are linked automatically once your email is verified.</EmptyState></div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {upcoming.map((o) => (
            <li key={o.id}><Link href={`/account/orders/${o.id}`}><Card className="flex gap-4 p-3 hover:border-line-strong">
              <EventPoster slug={o.ev.slug} title={o.ev.title} coverPath={o.ev.cover_path} variant="square" className="w-24 shrink-0 [&_span]:text-[10px]" sizes="96px" />
              <div className="min-w-0 py-1"><p className="font-semibold">{o.ev.title}</p><p className="text-sm text-fg-muted">{formatEventDate(o.ev.starts_at, o.ev.timezone)}</p>
                <p className="text-sm text-fg-subtle">{o.admissions} admission{o.admissions > 1 ? "s" : ""} · {o.public_ref}</p></div>
            </Card></Link></li>
          ))}
        </ul>
      )}
      {past.length > 0 && <><h2 className="mt-12 text-xl font-bold">Past</h2><ul className="mt-4 space-y-2 text-sm text-fg-muted">{past.map((o) => <li key={o.id}><Link className="hover:text-fg" href={`/account/orders/${o.id}`}>{o.ev.title} · {formatEventDate(o.ev.starts_at, o.ev.timezone)}</Link></li>)}</ul></>}
    </div>
  );
}
