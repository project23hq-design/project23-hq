import "server-only";
import { verifyPaystackSignature } from "@project23/domain/server";
import type { PaymentProvider, VerifiedTransaction, WebhookEvent } from "./types";

const API = "https://api.paystack.co";

/**
 * Paystack transfer references must be 16-50 chars of lowercase letters, digits, "-" and "_".
 * Our payout references look like "PO-7KQ2MXH9PA", so they are sent as "p23-po-7kq2mxh9pa"
 * and mapped back when Paystack echoes them in webhooks. The alphabet behind our references
 * is uppercase-only, so lowercasing is reversible.
 */
const TRANSFER_PREFIX = "p23-";
export const toPaystackTransferRef = (ref: string) => TRANSFER_PREFIX + ref.toLowerCase();
export const fromPaystackTransferRef = (ref: string) =>
  ref.startsWith(TRANSFER_PREFIX) ? ref.slice(TRANSFER_PREFIX.length).toUpperCase() : ref;

/**
 * Dispute outcome from Paystack's `resolution`. Accepting a dispute (merchant-accepted, or
 * auto-accepted when nobody responds in time) refunds the customer: we lost. Declining it
 * (declined / auto-declined) keeps the payment: we won. Anything else is left on hold for a
 * person to review rather than guessed, because "lost" refunds the order and voids tickets.
 */
export function disputeOutcome(event: string, resolution: unknown) {
  if (event === "charge.dispute.create") return "open" as const;
  if (event === "charge.dispute.remind") return "awaiting_response" as const;
  const r = String(resolution ?? "").toLowerCase();
  if (r.endsWith("accepted")) return "lost" as const;
  if (r.endsWith("declined")) return "won" as const;
  return "awaiting_response" as const;
}

/**
 * Paystack adapter (https://paystack.com/docs/api/). Amounts are in the subunit (kobo).
 * Webhooks: x-paystack-signature = HMAC-SHA512(raw body, secret key).
 */
export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack" as const;
  readonly environment: "test" | "live";

  constructor(private readonly secretKey: string) {
    this.environment = secretKey.startsWith("sk_live_") ? "live" : "test";
  }

  private async call<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ ok: boolean; status: number; body: { status: boolean; message: string; data: T } }> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = await res
      .json()
      .catch(() => ({ status: false, message: "invalid_json", data: null }));
    return { ok: res.ok && body.status === true, status: res.status, body };
  }

  async initialize(input: Parameters<PaymentProvider["initialize"]>[0]) {
    const r = await this.call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    // Paystack is stricter than our form about emails (it rejects e.g. ".test" addresses).
    if (!r.ok && /email/i.test(r.body.message)) throw new Error("payment_email_rejected");
    if (!r.ok) throw new Error(`paystack_initialize_failed:${r.status}:${r.body.message}`);
    return { authorizationUrl: r.body.data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedTransaction | null> {
    const r = await this.call<{
      status: string;
      amount: number;
      currency: string;
      reference: string;
      id: number;
      fees: number | null;
      channel: string;
      domain: string;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (r.status === 404 || (!r.ok && /not found/i.test(r.body.message))) return null;
    if (!r.ok) throw new Error(`paystack_verify_failed:${r.status}`);
    const d = r.body.data;
    return {
      reference: d.reference,
      status:
        d.status === "success"
          ? "success"
          : d.status === "abandoned"
            ? "abandoned"
            : d.status === "failed"
              ? "failed"
              : "pending",
      amountMinor: d.amount,
      currency: d.currency,
      transactionId: String(d.id),
      feesMinor: d.fees ?? null,
      channel: d.channel ?? null,
      environment: d.domain === "live" ? "live" : "test",
    };
  }

  verifyWebhookSignature(rawBody: string, headers: Headers) {
    return verifyPaystackSignature(rawBody, headers.get("x-paystack-signature"), this.secretKey);
  }

  parseWebhook(payload: unknown): WebhookEvent {
    const p = payload as { event?: string; data?: Record<string, unknown> };
    const d = (p.data ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (p.event) {
      case "charge.success":
        return { kind: "charge", reference: String(d.reference) };
      case "refund.processed":
      case "refund.failed":
      case "refund.pending":
      case "refund.processing":
        // The payload has no refund id (only the payment's reference and a processor
        // reference), so the webhook handler re-fetches the refunds on that payment.
        return {
          kind: "refund",
          transactionReference: String(d.transaction_reference ?? d.transaction?.reference ?? ""),
          status:
            p.event === "refund.processed"
              ? "processed"
              : p.event === "refund.failed"
                ? "failed"
                : p.event === "refund.processing"
                  ? "processing"
                  : "pending",
        };
      case "transfer.success":
      case "transfer.failed":
      case "transfer.reversed":
        return {
          kind: "transfer",
          reference: fromPaystackTransferRef(String(d.reference)),
          status: p.event.split(".")[1] as "success" | "failed" | "reversed",
          reason: d.reason,
        };
      case "charge.dispute.create":
      case "charge.dispute.remind":
      case "charge.dispute.resolve": {
        return {
          kind: "dispute",
          disputeId: String(d.id),
          transactionReference: String(d.transaction?.reference ?? d.transaction_reference ?? ""),
          status: disputeOutcome(p.event, d.resolution),
          amountMinor: Number(d.refund_amount ?? d.transaction?.amount ?? 0),
          reason: d.category,
        };
      }
      default:
        return { kind: "ignored", type: String(p.event) };
    }
  }

  async refund(input: { transactionReference: string; amountMinor: number }) {
    const r = await this.call<{ id: number; status: string }>("/refund", {
      method: "POST",
      body: JSON.stringify({ transaction: input.transactionReference, amount: input.amountMinor }),
    });
    if (!r.ok) throw new Error(`paystack_refund_failed:${r.status}:${r.body.message}`);
    const s = r.body.data.status;
    return {
      providerRefundId: String(r.body.data.id),
      status: (s === "processed" ? "processed" : s === "failed" ? "failed" : "pending") as
        "pending" | "processed" | "failed",
    };
  }

  async fetchRefund(providerRefundId: string) {
    const r = await this.call<{ status: string }>(
      `/refund/${encodeURIComponent(providerRefundId)}`,
    );
    if (r.status === 404) return { status: "not_found" as const };
    if (!r.ok) throw new Error(`paystack_refund_fetch_failed:${r.status}`);
    const s = r.body.data.status;
    return {
      status: (s === "processed"
        ? "processed"
        : s === "failed"
          ? "failed"
          : s === "processing"
            ? "processing"
            : "pending") as "pending" | "processing" | "processed" | "failed",
    };
  }

  async resolveAccount(input: { accountNumber: string; bankCode: string }) {
    const r = await this.call<{ account_name: string }>(
      `/bank/resolve?account_number=${input.accountNumber}&bank_code=${encodeURIComponent(input.bankCode)}`,
    );
    return r.ok ? { accountName: r.body.data.account_name } : null;
  }

  async createRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
    const r = await this.call<{ recipient_code: string }>("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "nuban",
        name: input.name,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: "NGN",
      }),
    });
    if (!r.ok) throw new Error(`paystack_recipient_failed:${r.status}:${r.body.message}`);
    return { recipientCode: r.body.data.recipient_code };
  }

  async transfer(input: {
    amountMinor: number;
    recipientCode: string;
    reference: string;
    reason: string;
  }) {
    const r = await this.call<{ status: string; transfer_code: string }>("/transfer", {
      method: "POST",
      body: JSON.stringify({
        source: "balance",
        amount: input.amountMinor,
        recipient: input.recipientCode,
        reference: toPaystackTransferRef(input.reference),
        reason: input.reason,
      }),
    });
    if (!r.ok) {
      // 5xx/timeouts are ambiguous: the caller must verify by reference before retrying.
      if (r.status >= 500) return { status: "unknown" as const };
      return { status: "failed" as const, message: r.body.message };
    }
    const s = r.body.data.status;
    return {
      status: (s === "success"
        ? "success"
        : s === "otp"
          ? "otp"
          : s === "failed"
            ? "failed"
            : "pending") as "success" | "otp" | "failed" | "pending",
      transferCode: r.body.data.transfer_code,
    };
  }

  async verifyTransfer(reference: string) {
    const r = await this.call<{ status: string }>(
      `/transfer/verify/${encodeURIComponent(toPaystackTransferRef(reference))}`,
    );
    if (r.status === 404) return { status: "not_found" as const };
    if (!r.ok) throw new Error(`paystack_transfer_verify_failed:${r.status}`);
    const s = r.body.data.status;
    return {
      status: (["success", "failed", "reversed"].includes(s) ? s : "pending") as
        "success" | "failed" | "reversed" | "pending",
    };
  }

  async listBanks() {
    const r = await this.call<
      { code: string; name: string; active: boolean; supports_transfer: boolean }[]
    >("/bank?country=nigeria&perPage=100");
    if (!r.ok) return [];
    // Only banks Paystack can pay out to; the list repeats some banks (e.g. two "Zenith Bank").
    const seen = new Set<string>();
    const banks = r.body.data
      .filter((b) => b.active && b.supports_transfer && !seen.has(b.code) && seen.add(b.code))
      .map((b) => ({ code: b.code, name: b.name }));
    // In test mode Paystack only resolves accounts at its test bank (code 001, any 10 digits),
    // which its bank list doesn't include. Offer it so the payout-account flow can be tested.
    return this.environment === "test"
      ? [{ code: "001", name: "Paystack Test Bank (test mode only)" }, ...banks]
      : banks;
  }
}
