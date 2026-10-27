import { randomUUID } from "node:crypto";
import { formatDateTime, formatMoney } from "@project23/domain";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Stat,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { paymentProvider } from "@/lib/payments";
import { ActionForm } from "@/components/action-form";
import { requestPayoutAction, setPayoutRecipientAction } from "../actions";
import { BankFields } from "@/components/bank-fields";

export default async function Finance({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { supabase, org } = await requireOrg(slug, ["owner", "finance"]);
  const [{ data: b }, { data: recipient }, { data: payouts }, banks] = await Promise.all([
    supabase.rpc("org_balances", { p_org: org.id }),
    supabase
      .from("payout_recipients")
      .select("*")
      .eq("organization_id", org.id)
      .neq("status", "disabled")
      .maybeSingle(),
    supabase
      .from("payout_requests")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50),
    paymentProvider()
      .listBanks()
      .catch(() => []),
  ]);
  const bal = b as {
    pending_minor: number;
    available_minor: number;
    processing_minor: number;
    held_minor: number;
    paid_out_minor: number;
  };
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Finance</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Pending"
          value={formatMoney(bal.pending_minor)}
          hint="Net proceeds before release (event end + holding period)"
        />
        <Stat
          label="Available"
          value={formatMoney(bal.available_minor)}
          hint={
            bal.available_minor < 0
              ? "Negative: fees owed from door sales or refunds"
              : "Withdrawable"
          }
        />
        <Stat label="Withdrawal processing" value={formatMoney(bal.processing_minor)} />
        <Stat label="On hold" value={formatMoney(bal.held_minor)} hint="Disputed sales" />
        <Stat label="Paid out" value={formatMoney(bal.paid_out_minor)} />
      </div>
      <Alert title="About these balances">
        Balances are Project23&apos;s accounting record of what we owe your organization from online
        ticket sales collected through our Paystack account, after the platform fee, promoter
        commission and refunds. They are not a bank or wallet account. Cash and external POS door
        sales are collected by you directly; any platform fee on them is deducted here.
      </Alert>
      {org.payout_status !== "eligible" && (
        <Alert tone="warning" title="Payouts not yet enabled">
          Project23 enables payouts after verifying your organization and bank account. Sales still
          accrue to your pending balance.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payout bank account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recipient ? (
              <p className="text-sm">
                {recipient.bank_name} ••••{recipient.account_last4} · {recipient.account_name}{" "}
                <Badge tone={recipient.status === "verified" ? "success" : "warning"}>
                  {recipient.status.replace("_", " ")}
                </Badge>
              </p>
            ) : (
              <p className="text-sm text-fg-muted">No bank account on file.</p>
            )}
            {org.role === "owner" ? (
              <details>
                <summary className="cursor-pointer text-sm text-accent">
                  {recipient ? "Change bank account" : "Add bank account"}
                </summary>
                <Alert tone="warning" className="my-3">
                  For security, confirm your password on the{" "}
                  <a className="underline" href="/account/security">
                    Security page
                  </a>{" "}
                  within the last 15 minutes before changing bank details. All owners are notified.
                </Alert>
                <ActionForm action={setPayoutRecipientAction} submitLabel="Save bank account">
                  <input type="hidden" name="org" value={org.slug} />
                  <input type="hidden" name="kind" value="organization" />
                  <BankFields banks={banks} />
                </ActionForm>
              </details>
            ) : (
              <p className="text-xs text-fg-subtle">Only owners can change bank details.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Request a withdrawal</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={requestPayoutAction}
              submitLabel="Request withdrawal"
              resetOnSuccess
            >
              <input type="hidden" name="org" value={org.slug} />
              <input type="hidden" name="kind" value="organization" />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <Field
                label="Amount (₦)"
                htmlFor="amount"
                hint={`Available: ${formatMoney(Math.max(0, bal.available_minor))}. Minimum ₦5,000. Requests are reviewed by Project23 finance.`}
              >
                <Input name="amount" inputMode="decimal" />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawals</CardTitle>
        </CardHeader>
        <CardContent>
          {!payouts?.length ? (
            <p className="text-sm text-fg-muted">No withdrawals yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Amount</Th>
                  <Th>Requested</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-mono text-xs">{p.reference}</Td>
                    <Td className="tabular-nums">{formatMoney(p.amount_minor)}</Td>
                    <Td>{formatDateTime(p.created_at)}</Td>
                    <Td>
                      <Badge
                        tone={
                          p.status === "paid"
                            ? "success"
                            : ["failed", "rejected", "reversed"].includes(p.status)
                              ? "danger"
                              : "info"
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.review_note && <p className="text-xs text-fg-subtle">{p.review_note}</p>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
