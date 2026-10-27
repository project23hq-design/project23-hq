import { formatDateTime, formatMoney } from "@project23/domain";
import {
  Alert,
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
import { ActionForm } from "@/components/action-form";
import { payoutDecisionAction, refundDecisionAction, settlementAction } from "../actions";

export default async function AdminFinance() {
  const { supabase } = await requirePlatformAdmin();
  const [{ data: payouts }, { data: refunds }, { data: disputes }] = await Promise.all([
    supabase
      .from("payout_requests")
      .select(
        "*, payout_recipients(bank_name, account_last4, account_name, status), organizations(name)",
      )
      .in("status", ["pending", "approved", "processing", "paid"])
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("refund_requests")
      .select("*, orders(public_ref, buyer_email)")
      .in("status", ["requested", "failed", "processing"])
      .order("created_at"),
    supabase
      .from("disputes")
      .select("*, orders(public_ref)")
      .order("opened_at", { ascending: false })
      .limit(20),
  ]);
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Finance</h1>
      <Alert title="Settlement model">
        Buyers pay Project23&apos;s Paystack account. Organizer and promoter balances are ledger
        liabilities settled by approved payouts (Paystack Transfers when available, otherwise manual
        bank transfer with a recorded reference). A request is never shown as paid until confirmed.
      </Alert>
      <section>
        <h2 className="mb-4 text-base font-medium">Payout queue</h2>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Beneficiary</Th>
              <Th>Amount</Th>
              <Th>Recipient</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {payouts?.map((p) => {
              const r = p.payout_recipients as unknown as {
                bank_name: string;
                account_last4: string;
                account_name: string;
                status: string;
              };
              const next =
                p.status === "pending"
                  ? [
                      ["approved", "Approve"],
                      ["rejected", "Reject"],
                    ]
                  : p.status === "approved" || p.status === "processing"
                    ? [
                        ["paid", "Mark paid"],
                        ["failed", "Mark failed"],
                      ]
                    : [["reversed", "Mark reversed"]];
              return (
                <tr key={p.id} className="align-top">
                  <Td className="font-mono text-xs">
                    {p.reference}
                    <p className="text-fg-subtle">{formatDateTime(p.created_at)}</p>
                  </Td>
                  <Td>
                    {p.beneficiary_kind === "organization"
                      ? (p.organizations as unknown as { name: string })?.name
                      : "Promoter"}
                    <p className="text-xs text-fg-subtle">
                      {p.beneficiary_kind} · {p.settlement_method}
                    </p>
                  </Td>
                  <Td className="tabular-nums">{formatMoney(p.amount_minor)}</Td>
                  <Td className="text-xs">
                    {r?.bank_name} ••••{r?.account_last4}
                    <br />
                    {r?.account_name}{" "}
                    <Badge tone={r?.status === "verified" ? "success" : "warning"}>
                      {r?.status}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge>{p.status}</Badge>
                  </Td>
                  <Td>
                    <div className="grid gap-2">
                      {next.map(([to, label]) => (
                        <ActionForm
                          key={to}
                          action={payoutDecisionAction}
                          submitLabel={label!}
                          submitVariant={
                            to === "approved" || to === "paid" ? "primary" : "secondary"
                          }
                          inline
                        >
                          <input type="hidden" name="payoutId" value={p.id} />
                          <input type="hidden" name="to" value={to} />
                          {to === "paid" && p.settlement_method === "manual_bank" && (
                            <Input
                              name="externalRef"
                              placeholder="Bank transfer ref"
                              className="h-9 w-36"
                              required
                            />
                          )}
                          {["rejected", "failed", "reversed"].includes(to!) && (
                            <Input name="note" placeholder="Reason" className="h-9 w-36" required />
                          )}
                        </ActionForm>
                      ))}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
      <section>
        <h2 className="mb-4 text-base font-medium">Refunds needing attention</h2>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Kind</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Reason</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {refunds?.map((r) => (
              <tr key={r.id}>
                <Td className="font-mono text-xs">
                  {(r.orders as unknown as { public_ref: string }).public_ref}
                </Td>
                <Td>
                  {r.kind} / {r.requester_kind}
                </Td>
                <Td>{formatMoney(r.amount_minor)}</Td>
                <Td>
                  <Badge>{r.status}</Badge>
                </Td>
                <Td className="max-w-56 text-xs">{r.reason}</Td>
                <Td>
                  {r.status === "failed" ? (
                    <ActionForm action={refundDecisionAction} submitLabel="Retry" inline>
                      <input type="hidden" name="refundId" value={r.id} />
                      <input type="hidden" name="op" value="retry" />
                    </ActionForm>
                  ) : r.status === "requested" ? (
                    <ActionForm action={refundDecisionAction} submitLabel="Approve" inline>
                      <input type="hidden" name="refundId" value={r.id} />
                      <input type="hidden" name="op" value="approve" />
                      <Input name="note" placeholder="Note" className="h-9 w-28" />
                    </ActionForm>
                  ) : (
                    <span className="text-xs text-fg-subtle">awaiting provider</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record Paystack settlement to bank</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={settlementAction} submitLabel="Record settlement" resetOnSuccess>
              <Input name="amount" placeholder="Amount (₦)" />
              <Input name="reference" placeholder="Settlement reference" required />
              <Input name="note" placeholder="Note" />
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Disputes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {!disputes?.length ? (
              <p className="text-fg-muted">No disputes.</p>
            ) : (
              <ul className="space-y-1">
                {disputes.map((d) => (
                  <li key={d.id}>
                    {(d.orders as unknown as { public_ref: string }).public_ref} · {d.status} ·{" "}
                    {formatMoney(d.amount_minor)} · {d.reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-fg-subtle">
              Disputes arrive by Paystack webhook. Open disputes hold related organizer/promoter
              earnings; lost disputes reverse them.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
