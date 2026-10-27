import { notFound } from "next/navigation";
import { loadOrderForViewer } from "@/lib/orders";
import { OrderTickets } from "@/components/orders/order-tickets";
import { Alert } from "@project23/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bundle = await loadOrderForViewer(orderId);
  if (!bundle) notFound();
  return (
    <div className="container-page max-w-3xl pt-10">
      <h1 className="text-3xl font-medium">{bundle.event?.title ?? "Your order"}</h1>
      {bundle.event?.status === "cancelled" && (
        <Alert tone="danger" className="mt-4">
          This event was cancelled. Paid orders are refunded automatically.
        </Alert>
      )}
      {bundle.tickets.length > 0 ? (
        <div className="mt-6">
          <OrderTickets bundle={bundle} />
        </div>
      ) : (
        <p className="mt-4 text-fg-muted">
          This order has no tickets (status: {bundle.order.status.replace("_", " ")}).
        </p>
      )}
    </div>
  );
}
