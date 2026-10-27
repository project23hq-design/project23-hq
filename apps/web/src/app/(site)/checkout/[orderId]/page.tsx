import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatMoney } from "@project23/domain";
import { Alert, Button, Card } from "@project23/ui";
import { loadOrderForViewer } from "@/lib/orders";
import { OrderTickets } from "@/components/orders/order-tickets";
import { PayButton, HoldCountdown, AutoRefresh } from "./client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bundle = await loadOrderForViewer(orderId);
  if (!bundle) notFound();
  const { order, items, event, lastAttempt } = bundle;
  const holdActive =
    order.status === "pending_payment" &&
    order.hold_expires_at &&
    new Date(order.hold_expires_at) > new Date();
  const paidStates = ["paid", "partially_refunded", "refunded"];

  return (
    <div className="container-page max-w-3xl pt-8">
      <p className="text-sm text-fg-muted">
        <Link href={event ? `/events/${event.slug}` : "/"} className="hover:underline">
          {event?.title ?? "Event"}
        </Link>
      </p>

      {paidStates.includes(order.status) && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <CheckCircle2 className="size-8 text-success" aria-hidden />
            <h1 className="text-3xl font-bold">You&apos;re in!</h1>
          </div>
          <p className="mt-2 text-fg-muted">
            We&apos;ve emailed your tickets to{" "}
            <strong className="text-fg">{order.buyer_email}</strong>. You can also show the QR codes
            below at the gate.
          </p>
          <div className="mt-8">
            <OrderTickets bundle={bundle} />
          </div>
        </>
      )}

      {order.status === "pending_payment" && (
        <>
          <h1 className="mt-2 text-3xl font-bold">Complete your order</h1>
          {holdActive ? (
            <HoldCountdown until={order.hold_expires_at!} />
          ) : (
            <Alert tone="warning" className="mt-4">
              Your hold has expired. If you already paid, we&apos;ll confirm it shortly; otherwise
              please start again.
            </Alert>
          )}
          {lastAttempt?.status === "initialized" && <AutoRefresh seconds={5} />}
          {lastAttempt?.status === "initialized" && (
            <Alert className="mt-4" title="Waiting for payment confirmation">
              If you completed payment, this page updates automatically once the payment provider
              confirms it. Don&apos;t pay twice.
            </Alert>
          )}
          {lastAttempt && ["failed", "abandoned"].includes(lastAttempt.status) && (
            <Alert tone="warning" className="mt-4" title="Payment not completed">
              Your last payment attempt didn&apos;t go through. You can try again while your tickets
              are held.
            </Alert>
          )}
          <Summary items={items} order={order} />
          {holdActive && (
            <div className="mt-6">
              <PayButton
                orderId={order.id}
                label={`Pay ${formatMoney(order.total_minor)} securely`}
              />
            </div>
          )}
          <p className="mt-3 text-center text-xs text-fg-subtle">
            Payments are processed by Paystack. Project23 never sees or stores your card details.
          </p>
        </>
      )}

      {(order.status === "expired" || order.status === "cancelled") && (
        <Card className="mt-6 p-6">
          <div className="flex items-center gap-3">
            <Clock className="size-6 text-warning" aria-hidden />
            <h1 className="text-2xl font-bold">
              This order {order.status === "expired" ? "expired" : "was cancelled"}
            </h1>
          </div>
          <p className="mt-2 text-fg-muted">
            The tickets were released. If money left your account for this order, it will be matched
            automatically: either your tickets are issued or you&apos;re refunded in full.
          </p>
          {event && (
            <Button asChild className="mt-4">
              <Link href={`/events/${event.slug}`}>Start a new order</Link>
            </Button>
          )}
        </Card>
      )}

      {order.status === "fulfillment_exception" && (
        <Card className="mt-6 p-6">
          <div className="flex items-center gap-3">
            <XCircle className="size-6 text-danger" aria-hidden />
            <h1 className="text-2xl font-bold">We couldn&apos;t issue your tickets</h1>
          </div>
          <p className="mt-2 text-fg-muted">
            Your payment arrived after the tickets became unavailable. No tickets were issued and a
            full refund of {formatMoney(order.total_minor)} has been started automatically.
            Reference: <span className="font-mono">{order.public_ref}</span>.
          </p>
        </Card>
      )}
    </div>
  );
}

function Summary({
  items,
  order,
}: {
  items: {
    id: string;
    ticket_type_name: string;
    quantity: number;
    unit_price_minor: number;
    admissions_per_unit: number;
  }[];
  order: {
    subtotal_minor: number;
    discount_minor: number;
    buyer_fee_minor: number;
    total_minor: number;
    promo_code: string | null;
  };
}) {
  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-3 font-semibold">Order summary</h2>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-4">
            <span>
              {i.quantity} × {i.ticket_type_name}
              {i.admissions_per_unit > 1 ? ` (admits ${i.admissions_per_unit})` : ""}
            </span>
            <span className="tabular-nums">{formatMoney(i.unit_price_minor * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        {order.discount_minor > 0 && (
          <div className="flex justify-between text-success">
            <dt>Discount {order.promo_code ? `(${order.promo_code})` : ""}</dt>
            <dd>−{formatMoney(order.discount_minor)}</dd>
          </div>
        )}
        {order.buyer_fee_minor > 0 && (
          <div className="flex justify-between text-fg-muted">
            <dt>Booking fee</dt>
            <dd>{formatMoney(order.buyer_fee_minor)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(order.total_minor)}</dd>
        </div>
      </dl>
    </Card>
  );
}
