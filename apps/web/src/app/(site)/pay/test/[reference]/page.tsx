import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { formatMoney } from "@project23/domain";
import { Alert, Button, Card } from "@project23/ui";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { simulateTestPaymentAction } from "../../../checkout/actions";

/** Hosted page of the LOCAL TEST payment provider. Unreachable unless PAYMENT_PROVIDER=test outside production. */
export default async function TestPaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  if (env().APP_ENV === "production" || env().PAYMENT_PROVIDER !== "test") notFound();
  const { reference } = await params;
  const { data } = await adminClient().rpc("test_provider_get", { p_reference: reference });
  if (!data) notFound();
  const t = data as { amount_minor: number; email: string; status: string };
  return (
    <div className="container-page flex justify-center py-16">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="flex items-center gap-3">
          <FlaskConical className="size-6 text-warning" aria-hidden />
          <h1 className="text-xl font-bold">Test payment</h1>
        </div>
        <Alert tone="warning" title="Simulated provider">
          No money moves. This page stands in for Paystack&apos;s hosted checkout during local
          development and automated tests.
        </Alert>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Amount</dt>
            <dd className="font-semibold">{formatMoney(Number(t.amount_minor))}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Email</dt>
            <dd>{t.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Reference</dt>
            <dd className="font-mono text-xs">{reference}</dd>
          </div>
        </dl>
        {t.status !== "pending" ? (
          <Alert>This test transaction is already {t.status}.</Alert>
        ) : (
          <div className="grid gap-2">
            <form action={simulateTestPaymentAction.bind(null, reference, "success")}>
              <Button className="w-full" size="lg">
                Simulate successful payment
              </Button>
            </form>
            <form action={simulateTestPaymentAction.bind(null, reference, "failed")}>
              <Button className="w-full" variant="secondary">
                Simulate declined card
              </Button>
            </form>
            <form action={simulateTestPaymentAction.bind(null, reference, "abandoned")}>
              <Button className="w-full" variant="ghost">
                Cancel payment
              </Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
