import { randomUUID } from "node:crypto";
import Image from "next/image";
import QRCode from "qrcode";
import { formatBps, formatDateTime, formatEventDate, formatMoney } from "@project23/domain";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Stat, Table, Td, Th, Textarea } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { paymentProvider } from "@/lib/payments";
import { ActionForm } from "@/components/action-form";
import { BankFields } from "@/components/bank-fields";
import { requestPayoutAction, setPayoutRecipientAction, cancelPayoutAction } from "@/app/(dashboard)/organizer/[org]/actions";
import { applyToProgramAction } from "./actions";
import { CopyButton } from "./copy-button";

export const metadata = { title: "Promoter earnings" };
export const dynamic = "force-dynamic";

type Dash = {
  balances: { pending: number; available: number; processing: number; recovery: number };
  held_minor: number; reversed_minor: number; paid_out_minor: number;
  enrollments: { id: string; status: string; program_id: string; program_status: string; event_title: string; event_slug: string; event_starts_at: string; rate_bps: number; needs_terms: boolean; current_version_id: string; link_code: string | null; visits: number; orders: number; admissions: number; earned_minor: number }[];
  commissions: { id: string; event_title: string; sale_ref: string; base_minor: number; rate_bps: number; amount_minor: number; reversed_minor: number; status: string; matures_at: string; created_at: string }[];
  payouts: { id: string; reference: string; amount_minor: number; status: string; created_at: string }[];
};

export default async function PromoterPage() {
  const { supabase, user } = await requireUser("/promoter");
  const [{ data }, { data: programs }, { data: recipient }, banks] = await Promise.all([
    supabase.rpc("promoter_dashboard"),
    supabase.from("public_referral_programs").select("*").order("event_starts_at").limit(30),
    supabase.from("payout_recipients").select("*").eq("user_id", user.id).eq("beneficiary_kind", "promoter").neq("status", "disabled").maybeSingle(),
    paymentProvider().listBanks().catch(() => []),
  ]);
  const d = data as Dash;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const enrolledPrograms = new Set(d.enrollments.map((e) => e.program_id));
  const qrs = await Promise.all(d.enrollments.map((e) => (e.link_code ? QRCode.toDataURL(`${appUrl}/r/${e.link_code}`, { margin: 1, width: 240 }) : null)));
  return (
    <div className="container-page space-y-10 pt-8">
      <div>
        <h1 className="text-3xl font-bold">Promoter earnings</h1>
        <p className="mt-1 max-w-2xl text-fg-muted">Share events with your unique link and earn a commission on verified ticket sales. This is an earnings balance kept in Project23&apos;s ledger — not a bank account or stored-value wallet.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Pending" value={formatMoney(d.balances.pending)} hint="Earned; released after the event + holding period" />
        <Stat label="Available" value={formatMoney(d.balances.available)} hint="Withdrawable" />
        <Stat label="Withdrawal processing" value={formatMoney(d.balances.processing)} />
        <Stat label="Paid out" value={formatMoney(d.paid_out_minor)} />
        <Stat label="Reversed / held" value={formatMoney(d.reversed_minor + d.held_minor)} hint="Refunds, disputes" />
      </div>
      {d.balances.recovery > 0 && <Alert tone="warning" title={`Recovery balance: ${formatMoney(d.balances.recovery)}`}>A refund or chargeback reversed commission you had already been paid. It will be recovered from future earnings before new withdrawals; we never debit your bank account.</Alert>}

      <section>
        <h2 className="mb-4 text-xl font-bold">Your programs</h2>
        {d.enrollments.length === 0 ? <p className="text-fg-muted">You haven&apos;t joined a program yet — browse open programs below.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {d.enrollments.map((e, i) => (
              <Card key={e.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{e.event_title}</p><p className="text-sm text-fg-muted">{formatEventDate(e.event_starts_at)} · {formatBps(e.rate_bps)} commission</p></div>
                  <Badge tone={e.status === "approved" ? "success" : e.status === "pending" ? "info" : "danger"}>{e.status}</Badge>
                </div>
                {e.needs_terms && <Alert tone="warning" className="mt-3">The organizer published new terms. Existing earnings keep your accepted terms; accept the new version below to continue under them.</Alert>}
                {e.link_code && e.status === "approved" && e.program_status === "active" && (
                  <div className="mt-4 flex gap-4">
                    {qrs[i] && <Image src={qrs[i]!} alt={`QR for your ${e.event_title} referral link`} width={96} height={96} unoptimized className="rounded-lg bg-white p-1" />}
                    <div className="min-w-0 space-y-2">
                      <p className="truncate font-mono text-sm">{appUrl}/r/{e.link_code}</p>
                      <CopyButton text={`${appUrl}/r/${e.link_code}`} />
                      <p className="text-xs text-fg-subtle">Marketing link only — not an admission ticket.</p>
                    </div>
                  </div>
                )}
                {e.program_status !== "active" && <p className="mt-3 text-sm text-warning">Program {e.program_status}: new referrals aren&apos;t being attributed.</p>}
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                  <div><dt className="text-xs text-fg-subtle">Visits*</dt><dd className="font-semibold">{e.visits}</dd></div>
                  <div><dt className="text-xs text-fg-subtle">Orders</dt><dd className="font-semibold">{e.orders}</dd></div>
                  <div><dt className="text-xs text-fg-subtle">Admissions</dt><dd className="font-semibold">{e.admissions}</dd></div>
                  <div><dt className="text-xs text-fg-subtle">Earned</dt><dd className="font-semibold">{formatMoney(e.earned_minor)}</dd></div>
                </dl>
              </Card>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-fg-subtle">*Visits are approximate link opens, not unique people. Attribution uses a first-party cookie for the last promoter link clicked within the program window on the same browser; cleared cookies, blocked tracking or switching devices can prevent attribution.</p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Open programs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(programs ?? []).filter((p) => !enrolledPrograms.has(p.id!) || d.enrollments.find((e) => e.program_id === p.id)?.needs_terms).map((p) => (
            <Card key={p.id} className="p-5">
              <p className="font-semibold">{p.event_title}</p>
              <p className="text-sm text-fg-muted">{p.organization_name} · {formatBps(p.rate_bps!)} · {p.attribution_window_days}-day window · {p.enrollment_mode === "open" ? "instant approval" : "organizer approval"}</p>
              <details className="mt-3"><summary className="cursor-pointer text-sm text-accent">Read terms & apply</summary>
                <p className="my-3 whitespace-pre-wrap text-sm text-fg-muted">{p.terms_text}</p>
                <p className="mb-3 text-xs text-fg-subtle">Commission is calculated on the ticket price after discounts, excluding fees. Earnings become available {p.maturity_days_after_event} days after the event ends, if not refunded or disputed.</p>
                <ActionForm action={applyToProgramAction} submitLabel="Apply">
                  <input type="hidden" name="programId" value={p.id!} /><input type="hidden" name="versionId" value={p.version_id!} />
                  <Field label="Tell the organizer how you'll promote (optional)" htmlFor={`note-${p.id}`}><Textarea name="note" rows={2} maxLength={1000} /></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="accept" className="size-4 accent-[var(--accent)]" />I accept these program terms (version {p.version})</label>
                </ActionForm>
              </details>
            </Card>
          ))}
          {!programs?.length && <p className="text-fg-muted">No open programs right now.</p>}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Withdraw</CardTitle></CardHeader><CardContent className="space-y-4">
          {recipient ? <p className="text-sm">{recipient.bank_name} ••••{recipient.account_last4} <Badge tone={recipient.status === "verified" ? "success" : "warning"}>{recipient.status.replace("_", " ")}</Badge></p> : <p className="text-sm text-fg-muted">Add a bank account in your name to withdraw.</p>}
          <ActionForm action={requestPayoutAction} submitLabel="Request withdrawal" resetOnSuccess>
            <input type="hidden" name="kind" value="promoter" /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <Field label="Amount (₦)" htmlFor="amount" hint="Minimum ₦2,000. Confirm your password on the Security page first. Requests are reviewed before payment."><Input name="amount" inputMode="decimal" /></Field>
          </ActionForm>
          <details><summary className="cursor-pointer text-sm text-accent">{recipient ? "Change bank account" : "Add bank account"}</summary>
            <ActionForm action={setPayoutRecipientAction} submitLabel="Save bank account" className="mt-3 grid gap-3"><input type="hidden" name="kind" value="promoter" /><BankFields banks={banks} /></ActionForm>
          </details>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Withdrawals</CardTitle></CardHeader><CardContent>
          {!d.payouts.length ? <p className="text-sm text-fg-muted">None yet.</p> : (
            <ul className="space-y-2 text-sm">{d.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{p.reference}</span><span>{formatMoney(p.amount_minor)}</span>
                <span className="flex items-center gap-2"><Badge tone={p.status === "paid" ? "success" : ["failed", "rejected", "reversed"].includes(p.status) ? "danger" : "info"}>{p.status === "paid" ? "paid (confirmed)" : p.status}</Badge>
                  {p.status === "pending" && <ActionForm action={cancelPayoutAction} submitLabel="Cancel" submitVariant="ghost" inline><input type="hidden" name="payoutId" value={p.id} /></ActionForm>}</span></li>))}
            </ul>
          )}
        </CardContent></Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Commission history</h2>
        {!d.commissions.length ? <p className="text-fg-muted">Commissions appear here after verified, paid orders through your links.</p> : (
          <Table><thead><tr><Th>Sale</Th><Th>Event</Th><Th>Basis</Th><Th>Rate</Th><Th>Earned</Th><Th>Status</Th></tr></thead><tbody>
            {d.commissions.map((c) => (
              <tr key={c.id}><Td className="font-mono text-xs">{c.sale_ref}<p className="text-fg-subtle">{formatDateTime(c.created_at)}</p></Td><Td>{c.event_title}</Td><Td className="tabular-nums">{formatMoney(c.base_minor)}</Td><Td>{formatBps(c.rate_bps)}</Td>
                <Td className="tabular-nums">{formatMoney(c.amount_minor)}{c.reversed_minor > 0 && <p className="text-xs text-danger">−{formatMoney(c.reversed_minor)} reversed</p>}</Td>
                <Td><Badge tone={c.status === "released" ? "success" : c.status === "held" ? "warning" : c.status === "reversed" ? "danger" : "info"}>{c.status === "released" ? "available" : c.status}</Badge>{c.status === "pending" && <p className="text-xs text-fg-subtle">from {formatDateTime(c.matures_at)}</p>}</Td></tr>
            ))}
          </tbody></Table>
        )}
      </section>
    </div>
  );
}
