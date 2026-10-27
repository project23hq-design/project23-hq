import Link from "next/link";
import { formatMoney } from "@project23/domain";
import { Alert, Card, CardContent, CardHeader, CardTitle, Stat } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";

const LABELS: Record<string, string> = {
  "provider_clearing:platform": "Held at Paystack (clearing)",
  "bank:platform": "Platform bank (net of manual payouts)",
  "platform_revenue:platform": "Platform fee revenue",
  "buyer_fee_revenue:platform": "Buyer booking fees",
  "processor_fees:platform": "Processor fees (expense)",
  "refunds_payable:platform": "Refunds approved, not yet settled",
  "unallocated_receipts:platform": "Unallocated receipts (exceptions to refund)",
  "org_pending:organization": "Organizer liability — pending",
  "org_available:organization": "Organizer liability — available",
  "org_payout_locked:organization": "Organizer payouts processing",
  "promoter_pending:promoter": "Promoter liability — pending",
  "promoter_available:promoter": "Promoter liability — available",
  "promoter_locked:promoter": "Promoter payouts processing",
  "promoter_recovery:promoter": "Recoverable from promoters (post-payout reversals)",
};

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = Math.min(365, Math.max(1, Number((await searchParams).days ?? 30)));
  const { supabase } = await requirePlatformAdmin();
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const [{ data: o }, { data: rec }] = await Promise.all([
    supabase.rpc("admin_overview", { p_from: from.toISOString(), p_to: to.toISOString() }),
    supabase.rpc("run_reconciliation"),
  ]);
  const ov = o as { [k: string]: number } & {
    balances: Record<string, number>;
    gross_collected_minor: number;
    platform_fee_minor: number;
    refunds_minor: number;
  };
  const r = rec as Record<string, unknown[] | number>;
  const issues = [
    "stale_payment_attempts",
    "paid_orders_without_ledger",
    "paid_orders_ticket_mismatch",
    "refunds_stuck",
    "payouts_processing",
    "negative_org_available",
  ].filter((k) => Array.isArray(r[k]) && (r[k] as unknown[]).length > 0);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">
          Operations overview
        </h1>
        <div className="flex gap-1 text-sm">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/super-admin?days=${d}`}
              className={`inline-flex h-8 items-center rounded-full px-3.5 text-xs font-medium ${d === days ? "bg-white/[0.1] text-fg" : "text-fg-muted hover:text-fg"}`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>
      <p className="text-sm text-fg-muted">
        Period: last {days} days · Currency: NGN · Sales figures are order-based; balances below are
        ledger-based (all-time).
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid orders" value={ov.orders_paid} />
        <Stat label="Collected via Paystack" value={formatMoney(ov.gross_collected_minor)} />
        <Stat
          label="Platform fees earned"
          value={formatMoney(ov.platform_fee_minor)}
          hint="Platform + buyer fees on orders paid in period"
        />
        <Stat label="Refunds" value={formatMoney(ov.refunds_minor)} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events to review" value={ov.pending_events} />
        <Stat label="Payout queue" value={ov.payout_queue} />
        <Stat label="Open refund requests" value={ov.open_refund_requests} />
        <Stat label="Open disputes" value={ov.open_disputes} />
        <Stat label="Fulfillment exceptions" value={ov.fulfillment_exceptions} />
        <Stat label="Payment mismatches" value={ov.payment_mismatches} />
        <Stat label="Dead jobs" value={ov.dead_jobs} />
        <Stat label="Referral flags" value={ov.open_referral_flags} />
      </div>
      {issues.length > 0 ? (
        <Alert tone="warning" title="Reconciliation issues">
          {issues.map((k) => `${k.replace(/_/g, " ")}: ${(r[k] as unknown[]).length}`).join(" · ")}
        </Alert>
      ) : (
        <Alert tone="success">No reconciliation exceptions detected.</Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Ledger balances (NGN, all-time)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-1 text-sm md:grid-cols-2">
            {Object.entries(ov.balances ?? {})
              .sort()
              .map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line py-1.5">
                  <dt className="text-fg-muted">{LABELS[k] ?? k}</dt>
                  <dd className="tabular-nums">{formatMoney(v)}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-xs text-fg-subtle">
            Internal balances are accounting records of obligations, not a regulated wallet or
            escrow. Compare &quot;Held at Paystack&quot; with the Paystack dashboard balance and
            record settlements to bank on the Finance page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
