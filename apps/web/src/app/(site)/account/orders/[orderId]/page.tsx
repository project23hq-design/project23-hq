import { notFound } from "next/navigation";
import { formatMoney } from "@project23/domain";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { loadOrderForViewer } from "@/lib/orders";
import { OrderTickets } from "@/components/orders/order-tickets";
import { RefundRequestForm, ResendButton } from "../../forms";

export default async function AccountOrder({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { supabase } = await requireUser(`/account/orders/${orderId}`);
  const bundle = await loadOrderForViewer(orderId);
  if (!bundle) notFound();
  const { data: refunds } = await supabase
    .from("refund_requests")
    .select("id, status, amount_minor, reason, review_note, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  const open = refunds?.find((r) => ["requested", "approved", "processing"].includes(r.status));
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-medium">{bundle.event?.title}</h1>
      <div className="mt-3">
        <ResendButton orderId={orderId} />
      </div>
      <div className="mt-8">
        <OrderTickets bundle={bundle} />
      </div>
      <Card className="mt-10">
        <CardHeader>
          <CardTitle>Refunds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {refunds?.map((r) => (
            <Alert
              key={r.id}
              tone={
                r.status === "completed" ? "success" : r.status === "rejected" ? "danger" : "info"
              }
              title={`${r.status[0]!.toUpperCase()}${r.status.slice(1)} · ${formatMoney(r.amount_minor)}`}
            >
              {r.reason}
              {r.review_note ? ` — Organizer note: ${r.review_note}` : ""}
            </Alert>
          ))}
          {!open &&
            ["paid", "partially_refunded"].includes(bundle.order.status) &&
            bundle.order.total_minor > 0 && <RefundRequestForm orderId={orderId} />}
        </CardContent>
      </Card>
    </div>
  );
}
