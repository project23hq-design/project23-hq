import Link from "next/link";
import { redirect } from "next/navigation";
import { formatEventDate, formatMoney } from "@project23/domain";
import { Badge, Card } from "@project23/ui";
import { readGuestAccess } from "@/lib/security";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Orders for an email verified via an emailed retrieval link (guest access grant). */
export default async function GuestOrdersPage() {
  const g = await readGuestAccess();
  if (!g) redirect("/orders/lookup");
  const { data: orders } = await adminClient().from("orders")
    .select("id, public_ref, status, total_minor, created_at, events(title, starts_at, timezone)")
    .eq("buyer_email", g.email).in("status", ["paid", "partially_refunded", "refunded", "fulfillment_exception"])
    .order("created_at", { ascending: false }).limit(50);
  const visible = (orders ?? []).filter((o) => g.orderIds.includes("*") || g.orderIds.includes(o.id));
  return (
    <div className="container-page max-w-3xl pt-10">
      <h1 className="text-3xl font-bold">Your orders</h1>
      <p className="mt-1 text-sm text-fg-muted">Signed in by email link as {g.email}. <Link className="text-accent underline" href="/sign-up">Create an account</Link> with this email to keep them in one place.</p>
      <ul className="mt-6 space-y-3">
        {visible.map((o) => {
          const ev = o.events as unknown as { title: string; starts_at: string; timezone: string };
          return (
            <li key={o.id}><Link href={`/orders/${o.id}`}><Card className="flex items-center justify-between gap-4 p-4 hover:border-line-strong">
              <div><p className="font-semibold">{ev.title}</p><p className="text-sm text-fg-muted">{formatEventDate(ev.starts_at, ev.timezone)} · {o.public_ref}</p></div>
              <div className="text-right"><p className="font-medium">{formatMoney(o.total_minor)}</p><Badge tone={o.status === "paid" ? "success" : "warning"}>{o.status.replace("_", " ")}</Badge></div>
            </Card></Link></li>
          );
        })}
      </ul>
    </div>
  );
}
