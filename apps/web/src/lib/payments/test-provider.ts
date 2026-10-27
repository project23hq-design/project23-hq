import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@project23/domain/server";
import { adminClient } from "../supabase/admin";
import type { PaymentProvider, VerifiedTransaction, WebhookEvent } from "./types";

/**
 * Deterministic local provider. No money moves. The hosted "payment page" is
 * /pay/test/[reference] and is visibly labelled. Webhooks are signed with
 * TEST_PROVIDER_SECRET using the same HMAC-SHA512 scheme as Paystack so the
 * webhook route exercises identical verification code.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = "test" as const;
  readonly environment = "test" as const;

  constructor(private readonly secret: string, private readonly appUrl: string) {}

  sign(rawBody: string) {
    return createHmac("sha512", this.secret).update(rawBody, "utf8").digest("hex");
  }

  async initialize(input: Parameters<PaymentProvider["initialize"]>[0]) {
    const { error } = await adminClient().rpc("test_provider_upsert", {
      p_reference: input.reference, p_amount: input.amountMinor, p_currency: input.currency, p_email: input.email, p_status: "pending",
    });
    if (error) throw new Error(`test_initialize_failed:${error.message}`);
    return { authorizationUrl: `${this.appUrl}/pay/test/${encodeURIComponent(input.reference)}` };
  }

  async verify(reference: string): Promise<VerifiedTransaction | null> {
    const { data } = await adminClient().rpc("test_provider_get", { p_reference: reference });
    if (!data) return null;
    const t = data as { reference: string; status: string; amount_minor: number; currency: string; transaction_id: string };
    return {
      reference: t.reference,
      status: t.status as VerifiedTransaction["status"],
      amountMinor: Number(t.amount_minor), currency: t.currency, transactionId: t.transaction_id,
      feesMinor: 0, channel: "test", environment: "test",
    };
  }

  /** Simulate the customer's action on the hosted page. */
  async simulate(reference: string, status: "success" | "failed" | "abandoned") {
    const { data, error } = await adminClient().rpc("test_provider_get", { p_reference: reference });
    if (error || !data) throw new Error("unknown_reference");
    const t = data as { amount_minor: number; currency: string; email: string; status: string };
    if (t.status !== "pending") return;
    await adminClient().rpc("test_provider_upsert", {
      p_reference: reference, p_amount: t.amount_minor, p_currency: t.currency, p_email: t.email, p_status: status,
    });
  }

  verifyWebhookSignature(rawBody: string, headers: Headers) {
    const sig = headers.get("x-paystack-signature");
    return !!sig && safeEqual(this.sign(rawBody), sig);
  }

  parseWebhook(payload: unknown): WebhookEvent {
    const p = payload as { event?: string; data?: Record<string, unknown> };
    if (p.event === "charge.success") return { kind: "charge", reference: String(p.data?.reference) };
    if (p.event === "refund.processed") {
      return { kind: "refund", transactionReference: String(p.data?.transaction_reference), providerRefundId: String(p.data?.id), status: "processed" };
    }
    return { kind: "ignored", type: String(p.event) };
  }

  async refund(input: { transactionReference: string; amountMinor: number }) {
    const { error } = await adminClient().rpc("test_provider_refund", { p_reference: input.transactionReference, p_amount: input.amountMinor });
    if (error) throw new Error(`test_refund_failed:${error.message}`);
    return { providerRefundId: `test_rf_${input.transactionReference}_${input.amountMinor}_${Date.now()}`, status: "processed" as const };
  }

  async resolveAccount(input: { accountNumber: string; bankCode: string }) {
    return /^\d{10}$/.test(input.accountNumber) ? { accountName: "TEST ACCOUNT HOLDER" } : null;
  }
  async createRecipient(_input: { name: string; accountNumber: string; bankCode: string }) {
    return { recipientCode: `RCP_test_${Date.now()}` };
  }
  async transfer(_input: { amountMinor: number; recipientCode: string; reference: string; reason: string }) {
    return { status: "success" as const, transferCode: `TRF_test_${Date.now()}` };
  }
  async verifyTransfer(_reference: string) {
    return { status: "success" as const };
  }
  async listBanks() {
    return [
      { code: "044", name: "Access Bank (test)" }, { code: "058", name: "GTBank (test)" },
      { code: "011", name: "First Bank (test)" }, { code: "057", name: "Zenith Bank (test)" },
      { code: "50211", name: "Kuda (test)" },
    ];
  }
}
