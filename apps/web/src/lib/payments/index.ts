import "server-only";
import { randomToken } from "@project23/domain/server";
import { env } from "../env";
import { adminClient } from "../supabase/admin";
import { logger } from "../log";
import { issueTicketCredentials } from "../tickets";
import { PaystackProvider } from "./paystack";
import { TestPaymentProvider } from "./test-provider";
import type { PaymentProvider } from "./types";

let provider: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.PAYMENT_PROVIDER === "paystack"
      ? new PaystackProvider(e.PAYSTACK_SECRET_KEY!)
      : new TestPaymentProvider(e.TEST_PROVIDER_SECRET!, e.NEXT_PUBLIC_APP_URL);
  return provider;
}

/**
 * Create a payment attempt with a fresh unique reference and get the hosted payment URL.
 * Retries create a new attempt (new reference); the engine refunds any second capture.
 */
export async function startPayment(
  orderId: string,
): Promise<{ authorizationUrl: string; reference: string }> {
  const db = adminClient();
  const p = paymentProvider();
  const log = logger({ orderId, scope: "payment.start" });
  const { data: order, error: oErr } = await db
    .from("orders")
    .select("id, buyer_email, total_minor, currency, public_ref, event_id")
    .eq("id", orderId)
    .single();
  if (oErr || !order) throw new Error("order_not_found");

  // Reuse a recent initialized attempt to avoid creating duplicate provider transactions on double-clicks.
  const { data: recent } = await db
    .from("payment_attempts")
    .select("reference, authorization_url, created_at")
    .eq("order_id", orderId)
    .eq("status", "initialized")
    .not("authorization_url", "is", null)
    .gt("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent?.[0]?.authorization_url)
    return { authorizationUrl: recent[0].authorization_url, reference: recent[0].reference };

  const reference = `P23_${order.public_ref.replace("P23-", "")}_${randomToken(6)}`;
  const { error } = await db.rpc("payment_attempt_create", {
    p_order: orderId,
    p_provider: p.name,
    p_environment: p.environment,
    p_reference: reference,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const { authorizationUrl } = await p.initialize({
    reference,
    amountMinor: order.total_minor,
    currency: order.currency,
    email: order.buyer_email,
    callbackUrl: `${env().NEXT_PUBLIC_APP_URL}/checkout/return?orderId=${orderId}`,
    metadata: { order_id: orderId, order_ref: order.public_ref },
  });
  await db.rpc("payment_attempt_set_url", { p_reference: reference, p_url: authorizationUrl });
  log.info("payment initialized", { reference, provider: p.name });
  return { authorizationUrl, reference };
}

/**
 * The single convergence point for webhook, return-page and reconciliation paths: fetch
 * the transaction from the provider server-to-server, then hand verified values to the
 * idempotent database fulfillment function.
 */
export async function confirmPayment(
  reference: string,
  source: "webhook" | "return" | "reconcile",
) {
  const log = logger({ reference, source, scope: "payment.confirm" });
  const p = paymentProvider();
  const tx = await p.verify(reference);
  if (!tx) {
    log.warn("provider has no transaction for reference");
    return { outcome: "unknown_reference" as const };
  }
  if (tx.status === "pending") return { outcome: "pending" as const };
  const { data, error } = await adminClient().rpc("payment_confirm", {
    p_reference: tx.reference,
    p_status: tx.status,
    p_amount_minor: tx.amountMinor,
    p_currency: tx.currency,
    p_provider_tx_id: tx.transactionId,
    p_fees_minor: tx.feesMinor ?? 0,
    p_environment: tx.environment,
    p_channel: tx.channel ?? undefined,
  });
  if (error) {
    log.error("payment_confirm failed", { error: error.message });
    throw new Error(error.message);
  }
  const result = data as { outcome: string; order_id?: string; order_status?: string };
  if (
    result.order_id &&
    (result.outcome === "fulfilled" || result.outcome === "already_fulfilled")
  ) {
    await issueTicketCredentials(result.order_id).catch((e) =>
      log.error("credential issue failed (job will retry)", { error: String(e) }),
    );
  }
  log.info("payment confirmed", { outcome: result.outcome, orderId: result.order_id });
  return result as { outcome: string; order_id?: string; order_status?: string };
}
