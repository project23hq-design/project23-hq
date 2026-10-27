import { formatDateTime, formatMoney } from "@project23/domain";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const clean = (q ?? "").replace(/[^A-Za-z0-9@._\-]/g, "");
  const { data: orders } =
    clean.length >= 3
      ? await supabase
          .from("orders")
          .select("*, events(title)")
          .or(`public_ref.ilike.%${clean}%,buyer_email.ilike.%${clean}%`)
          .order("created_at", { ascending: false })
          .limit(20)
      : await supabase
          .from("orders")
          .select("*, events(title)")
          .in("status", ["fulfillment_exception"])
          .order("created_at", { ascending: false })
          .limit(20);
  const first = orders?.[0];
  const [attempts, tickets, ledger, audit, refunds] = first
    ? await Promise.all([
        supabase.from("payment_attempts").select("*").eq("order_id", first.id).order("created_at"),
        supabase
          .from("tickets")
          .select("public_ref, status, first_checked_in_at")
          .eq("order_id", first.id),
        supabase.rpc("admin_ledger", { p_order: first.id }),
        supabase
          .from("audit_logs")
          .select("action, reason, created_at")
          .eq("entity_id", first.id)
          .order("created_at"),
        supabase
          .from("refund_requests")
          .select("status, amount_minor, kind, created_at")
          .eq("order_id", first.id),
      ])
    : [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-medium">Order lookup</h1>
      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Order ref or buyer email"
          className="max-w-sm"
        />
        <a className="self-center text-sm text-accent" href="/api/admin/export/orders.csv">
          Export orders CSV
        </a>
      </form>
      {!q && (
        <p className="text-sm text-fg-muted">
          Showing fulfillment exceptions. Search to look up any order.
        </p>
      )}
      <Table>
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Event</Th>
            <Th>Buyer</Th>
            <Th>Total</Th>
            <Th>Fee / promoter / organizer</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {orders?.map((o) => (
            <tr key={o.id}>
              <Td className="font-mono text-xs">
                {o.public_ref}
                <p className="text-fg-subtle">{formatDateTime(o.created_at)}</p>
              </Td>
              <Td>{(o.events as unknown as { title: string })?.title}</Td>
              <Td>{o.buyer_email}</Td>
              <Td>{formatMoney(o.total_minor)}</Td>
              <Td className="text-xs">
                {formatMoney(o.platform_fee_minor + o.buyer_fee_minor)} /{" "}
                {formatMoney(o.promoter_commission_minor)} / {formatMoney(o.organizer_net_minor)}
              </Td>
              <Td>
                <Badge>{o.status}</Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {first && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline · {first.public_ref}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>
              Created {formatDateTime(first.created_at)} · paid{" "}
              {first.paid_at ? formatDateTime(first.paid_at) : "—"} · fulfilled{" "}
              {first.fulfilled_at ? formatDateTime(first.fulfilled_at) : "—"}
              {first.exception_reason ? ` · exception: ${first.exception_reason}` : ""}
            </p>
            <div>
              <p className="font-semibold">Fee snapshot</p>
              <pre className="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">
                {JSON.stringify(first.fee_snapshot, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold">Payment attempts</p>
              <ul>
                {attempts?.data?.map((a) => (
                  <li key={a.id} className="font-mono text-xs">
                    {a.reference} · {a.provider}/{a.environment} · {a.status} ·{" "}
                    {formatMoney(a.amount_minor)}
                    {a.failure_reason ? ` · ${a.failure_reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">Tickets</p>
              <p className="text-xs">
                {tickets?.data
                  ?.map((t) => `${t.public_ref}:${t.status}${t.first_checked_in_at ? "✓" : ""}`)
                  .join("  ")}
              </p>
            </div>
            <div>
              <p className="font-semibold">Refunds</p>
              <p className="text-xs">
                {refunds?.data
                  ?.map((r) => `${r.kind}/${r.status} ${formatMoney(r.amount_minor)}`)
                  .join(" · ") || "—"}
              </p>
            </div>
            <div>
              <p className="font-semibold">Ledger</p>
              <pre className="max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">
                {JSON.stringify(ledger?.data, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold">Audit</p>
              <p className="text-xs">
                {audit?.data
                  ?.map((a) => `${a.action}${a.reason ? ` (${a.reason})` : ""}`)
                  .join(" · ") || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
