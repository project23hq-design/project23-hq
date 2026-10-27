import { redirect } from "next/navigation";
import { confirmPayment } from "@/lib/payments";
import { adminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/log";

/**
 * Paystack redirects here with ?reference=…&trxref=…. The query string is NOT proof of
 * payment: we only use the reference as a lookup key and verify server-to-server.
 */
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const reference = sp.reference ?? sp.trxref;
  let orderId = sp.orderId && /^[0-9a-f-]{36}$/i.test(sp.orderId) ? sp.orderId : undefined;
  if (reference) {
    const { data } = await adminClient().from("payment_attempts").select("order_id").eq("reference", reference).maybeSingle();
    if (data) {
      orderId = data.order_id;
      try { await confirmPayment(reference, "return"); }
      catch (e) { logger({ scope: "payment.return" }).warn("verification deferred to webhook/reconciliation", { error: String(e) }); }
    }
  }
  redirect(orderId ? `/checkout/${orderId}` : "/");
}
