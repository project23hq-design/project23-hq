import Image from "next/image";
import { Download } from "lucide-react";
import { formatEventRange, formatMoney } from "@project23/domain";
import { Badge, Button } from "@project23/ui";
import type { loadOrderForViewer } from "@/lib/orders";
import { ticketQrs } from "@/lib/orders";

type Bundle = NonNullable<Awaited<ReturnType<typeof loadOrderForViewer>>>;

const STATUS: Record<string, { label: string; tone: "success" | "danger" | "neutral" }> = {
  valid: { label: "Valid", tone: "success" },
  refunded: { label: "Refunded", tone: "danger" },
  void: { label: "Void", tone: "danger" },
};

/** Ticket wallet for an order: one card per admission with its own QR code. */
export async function OrderTickets({ bundle }: { bundle: Bundle }) {
  const { order, items, tickets, event } = bundle;
  const qrs = await ticketQrs(tickets);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">
            Order <span className="font-mono">{order.public_ref}</span> · {order.buyer_email}
          </p>
          {event && (
            <p className="text-sm text-fg-muted">
              {formatEventRange(event.starts_at!, event.ends_at!, event.timezone!)}
            </p>
          )}
        </div>
        <Button asChild variant="secondary">
          <a href={`/api/orders/${order.id}/tickets.pdf`}>
            <Download /> Download all (PDF)
          </a>
        </Button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {tickets.map((t, i) => {
          const item = items.find((x) => x.id === t.order_item_id)!;
          const s = STATUS[t.status] ?? STATUS.void!;
          return (
            <li key={t.id} className="overflow-hidden rounded-2xl border border-line bg-surface-1">
              <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-3">
                <div>
                  <p className="font-semibold">{item.ticket_type_name}</p>
                  {item.admissions_per_unit > 1 && (
                    <p className="text-xs text-fg-muted">
                      Seat {t.admission_number} of {item.admissions_per_unit} · unit {t.unit_number}
                    </p>
                  )}
                </div>
                <Badge tone={t.first_checked_in_at && t.status === "valid" ? "info" : s.tone}>
                  {t.first_checked_in_at && t.status === "valid" ? "Checked in" : s.label}
                </Badge>
              </div>
              <div className="flex flex-col items-center gap-3 p-5">
                {qrs[i] ? (
                  <Image
                    src={qrs[i]!}
                    alt={`QR code for ticket ${t.public_ref}`}
                    width={200}
                    height={200}
                    unoptimized
                    className="rounded-xl bg-white p-2"
                  />
                ) : (
                  <div className="flex size-[200px] items-center justify-center rounded-xl bg-surface-2 text-sm text-fg-muted">
                    No longer valid
                  </div>
                )}
                <p className="font-mono text-sm">{t.public_ref}</p>
                <a href={`/api/tickets/${t.id}/pdf`} className="text-sm text-brand hover:underline">
                  Download PDF
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-subtle">
        Each QR admits one person once. Screenshots can be copied, so don&apos;t share your codes —
        the first scan wins. Total paid: {formatMoney(order.total_minor)}.
      </p>
    </div>
  );
}
