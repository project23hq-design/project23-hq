import { computeQuote, formatBps, formatDateTime, formatMoney } from "@project23/domain";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Table,
  Td,
  Th,
} from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { feePolicyAction } from "../actions";

export default async function Fees() {
  const { supabase } = await requirePlatformAdmin();
  const { data: policies } = await supabase
    .from("fee_policies")
    .select("*")
    .order("effective_from", { ascending: false })
    .limit(50);
  const current = policies?.find(
    (p) => p.scope === "platform" && new Date(p.effective_from) <= new Date(),
  );
  const preview = current
    ? computeQuote(
        [{ ticketTypeId: "x", unitPriceMinor: 1_000_000, quantity: 1, admissionsPerUnit: 1 }],
        {
          platformFeeBps: current.platform_fee_bps,
          platformFixedMinor: current.platform_fixed_minor,
          buyerFeeBps: current.buyer_fee_bps,
          buyerFixedMinor: current.buyer_fixed_minor,
        },
        { promoterRateBps: 1000 },
      )
    : null;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Fee policies</h1>
      <Alert title="Precedence & history">
        Event override → organization override → platform default. Policies are versioned and
        insert-only; each order snapshots the policy in effect when it was created, so changes never
        rewrite past orders. Processor fees are recorded from Paystack&apos;s verify response and
        borne by the platform at launch.
      </Alert>
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Current default · preview</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            ₦10,000 ticket with a 10% promoter: buyer pays {formatMoney(preview.totalMinor)} ·
            Project23 {formatMoney(preview.platformFeeMinor + preview.buyerFeeMinor)} · promoter{" "}
            {formatMoney(preview.commissionMinor)} · organizer{" "}
            {formatMoney(preview.organizerNetMinor)} (before processor fees/taxes)
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>New policy version</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={feePolicyAction} submitLabel="Create policy version">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Scope" htmlFor="scope">
                <Select name="scope">
                  <option value="platform">Platform default</option>
                  <option value="organization">Organization override</option>
                  <option value="event">Event override</option>
                </Select>
              </Field>
              <Field label="Organization id (override)" htmlFor="orgId">
                <Input name="orgId" />
              </Field>
              <Field label="Event id (override)" htmlFor="eventId">
                <Input name="eventId" />
              </Field>
              <Field
                label="Platform fee (%)"
                htmlFor="platformPercent"
                hint="Deducted from organizer proceeds"
              >
                <Input name="platformPercent" inputMode="decimal" defaultValue="5" />
              </Field>
              <Field label="Platform fixed (₦ per paid admission)" htmlFor="platformFixed">
                <Input name="platformFixed" defaultValue="0" />
              </Field>
              <Field label="Fee refundable on refunds" htmlFor="refundable">
                <Select name="refundable">
                  <option value="true">Yes</option>
                  <option value="false">No (organizer bears)</option>
                </Select>
              </Field>
              <Field
                label="Buyer booking fee (%)"
                htmlFor="buyerPercent"
                hint="Shown to buyers before paying"
              >
                <Input name="buyerPercent" defaultValue="0" />
              </Field>
              <Field label="Buyer fixed (₦ per order)" htmlFor="buyerFixed">
                <Input name="buyerFixed" defaultValue="0" />
              </Field>
              <Field label="Effective from (WAT)" htmlFor="effectiveLocal">
                <Input type="datetime-local" name="effectiveLocal" />
              </Field>
            </div>
            <Field label="Note (audited)" htmlFor="note">
              <Input name="note" required />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
      <Table>
        <thead>
          <tr>
            <Th>Scope</Th>
            <Th>Target</Th>
            <Th>Platform</Th>
            <Th>Buyer fee</Th>
            <Th>Effective</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody>
          {policies?.map((p) => (
            <tr key={p.id}>
              <Td>{p.scope}</Td>
              <Td className="font-mono text-xs">{p.organization_id ?? p.event_id ?? "—"}</Td>
              <Td>
                {formatBps(p.platform_fee_bps)}
                {p.platform_fixed_minor ? ` + ${formatMoney(p.platform_fixed_minor)}` : ""}
              </Td>
              <Td>
                {formatBps(p.buyer_fee_bps)}
                {p.buyer_fixed_minor ? ` + ${formatMoney(p.buyer_fixed_minor)}` : ""}
              </Td>
              <Td>{formatDateTime(p.effective_from)}</Td>
              <Td className="text-xs">{p.note}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
