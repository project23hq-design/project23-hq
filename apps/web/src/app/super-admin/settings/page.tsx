import { Badge, Card, CardContent, Input, Table, Td, Th } from "@project23/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { ActionForm } from "@/components/action-form";
import { automaticPayoutsAction, settingAction } from "../actions";

const PAYOUT_SWITCH = "paystack_transfers_enabled";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { supabase } = await requirePlatformAdmin("settings");
  const { data } = await supabase.from("platform_settings").select("*").order("key");
  const automatic = data?.find((s) => s.key === PAYOUT_SWITCH)?.value === true;
  const provider = env().PAYMENT_PROVIDER;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">Platform settings</h1>
      <p className="text-sm text-fg-muted">
        Changes are audited with the old and new values. Values are JSON. Staff platform roles are
        provisioned out-of-band (see docs/operations.md), never through this UI or signup.
      </p>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-medium">Automatic Paystack payouts</h2>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                {automatic
                  ? "Approved organizer and promoter payouts are sent automatically through Paystack Transfers."
                  : "Finance pays approved payouts from the bank and records the transfer reference. Bank accounts are still checked against Paystack's account-name lookup."}
              </p>
            </div>
            <Badge tone={automatic ? "success" : "warning"}>
              {automatic ? "On" : "Off (manual)"}
            </Badge>
          </div>
          {!automatic && (
            <p className="text-xs text-fg-subtle">
              Turn this on only after Paystack has enabled Transfers for the business (a
              &quot;Registered&quot; account), and the Paystack balance can cover payouts.
              {provider !== "paystack" &&
                ` This site is currently using the "${provider}" payment provider, so no real transfers would be made.`}
            </p>
          )}
          <ActionForm
            action={automaticPayoutsAction}
            submitLabel={automatic ? "Turn off" : "Turn on"}
            submitVariant={automatic ? "secondary" : "primary"}
            inline
          >
            <input type="hidden" name="enabled" value={automatic ? "false" : "true"} />
            <Input
              name="reason"
              placeholder="Reason (audited)"
              required
              minLength={3}
              className="h-9 w-56"
            />
          </ActionForm>
        </CardContent>
      </Card>
      <Table>
        <thead>
          <tr>
            <Th>Key</Th>
            <Th>Description</Th>
            <Th>Value</Th>
          </tr>
        </thead>
        <tbody>
          {data
            ?.filter((s) => s.key !== PAYOUT_SWITCH)
            .map((s) => (
              <tr key={s.key}>
                <Td className="font-mono text-xs">{s.key}</Td>
                <Td className="text-xs text-fg-muted">{s.description}</Td>
                <Td>
                  <ActionForm
                    action={settingAction}
                    submitLabel="Save"
                    submitVariant="secondary"
                    inline
                  >
                    <input type="hidden" name="key" value={s.key} />
                    <Input
                      name="value"
                      defaultValue={JSON.stringify(s.value)}
                      className="h-9 w-40 font-mono"
                    />
                    <Input name="reason" placeholder="Reason" required className="h-9 w-32" />
                  </ActionForm>
                </Td>
              </tr>
            ))}
        </tbody>
      </Table>
    </div>
  );
}
