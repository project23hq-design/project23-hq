import "server-only";
import { verifyPaystackSignature } from "@project23/domain/server";
import type { PaymentProvider, VerifiedTransaction, WebhookEvent } from "./types";

const API = "https://api.paystack.co";

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

  private async call<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: { status: boolean; message: string; data: T } }> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.secretKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ status: false, message: "invalid_json", data: null }));
    return { ok: res.ok && body.status === true, status: res.status, body };
  }

  async initialize(input: Parameters<PaymentProvider["initialize"]>[0]) {
    const r = await this.call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email, amount: input.amountMinor, currency: input.currency, reference: input.reference,
        callback_url: input.callbackUrl, metadata: input.metadata,
      }),
    });
    if (!r.ok) throw new Error(`paystack_initialize_failed:${r.status}:${r.body.message}`);
    return { authorizationUrl: r.body.data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedTransaction | null> {
    const r = await this.call<{
      status: string; amount: number; currency: string; reference: string; id: number; fees: number | null; channel: string; domain: string;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (r.status === 404 || (!r.ok && /not found/i.test(r.body.message))) return null;
    if (!r.ok) throw new Error(`paystack_verify_failed:${r.status}`);
    const d = r.body.data;
    return {
      reference: d.reference,
      status: d.status === "success" ? "success" : d.status === "abandoned" ? "abandoned" : d.status === "failed" ? "failed" : "pending",
      amountMinor: d.amount, currency: d.currency, transactionId: String(d.id), feesMinor: d.fees ?? null,
      channel: d.channel ?? null, environment: d.domain === "live" ? "live" : "test",
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
      case "refund.processed": case "refund.failed": case "refund.pending": case "refund.processing":
        return {
          kind: "refund", transactionReference: String(d.transaction_reference ?? d.transaction?.reference ?? ""),
          providerRefundId: String(d.id ?? d.refund_reference ?? ""),
          status: p.event === "refund.processed" ? "processed" : p.event === "refund.failed" ? "failed" : p.event === "refund.processing" ? "processing" : "pending",
        };
      case "transfer.success": case "transfer.failed": case "transfer.reversed":
        return { kind: "transfer", reference: String(d.reference), status: p.event.split(".")[1] as "success" | "failed" | "reversed", reason: d.reason };
      case "charge.dispute.create": case "charge.dispute.remind": case "charge.dispute.resolve": {
        const resolution = String(d.resolution ?? "");
        const status = p.event === "charge.dispute.resolve"
          ? (resolution === "merchant-accepted" || resolution === "declined" ? "lost" : "won")
          : p.event === "charge.dispute.remind" ? "awaiting_response" : "open";
        return {
          kind: "dispute", disputeId: String(d.id), transactionReference: String(d.transaction?.reference ?? ""),
          status, amountMinor: Number(d.refund_amount ?? d.transaction?.amount ?? 0), reason: d.category,
        };
      }
      default:
        return { kind: "ignored", type: String(p.event) };
    }
  }

  async refund(input: { transactionReference: string; amountMinor: number }) {
    const r = await this.call<{ id: number; status: string }>("/refund", {
      method: "POST", body: JSON.stringify({ transaction: input.transactionReference, amount: input.amountMinor }),
    });
    if (!r.ok) throw new Error(`paystack_refund_failed:${r.status}:${r.body.message}`);
    const s = r.body.data.status;
    return { providerRefundId: String(r.body.data.id), status: (s === "processed" ? "processed" : s === "failed" ? "failed" : "pending") as "pending" | "processed" | "failed" };
  }

  async resolveAccount(input: { accountNumber: string; bankCode: string }) {
    const r = await this.call<{ account_name: string }>(`/bank/resolve?account_number=${input.accountNumber}&bank_code=${encodeURIComponent(input.bankCode)}`);
    return r.ok ? { accountName: r.body.data.account_name } : null;
  }

  async createRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
    const r = await this.call<{ recipient_code: string }>("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({ type: "nuban", name: input.name, account_number: input.accountNumber, bank_code: input.bankCode, currency: "NGN" }),
    });
    if (!r.ok) throw new Error(`paystack_recipient_failed:${r.status}:${r.body.message}`);
    return { recipientCode: r.body.data.recipient_code };
  }

  async transfer(input: { amountMinor: number; recipientCode: string; reference: string; reason: string }) {
    const r = await this.call<{ status: string; transfer_code: string }>("/transfer", {
      method: "POST",
      body: JSON.stringify({ source: "balance", amount: input.amountMinor, recipient: input.recipientCode, reference: input.reference, reason: input.reason }),
    });
    if (!r.ok) {
      // 5xx/timeouts are ambiguous: the caller must verify by reference before retrying.
      if (r.status >= 500) return { status: "unknown" as const };
      return { status: "failed" as const };
    }
    const s = r.body.data.status;
    return { status: (s === "success" ? "success" : s === "otp" ? "otp" : s === "failed" ? "failed" : "pending") as "success" | "otp" | "failed" | "pending", transferCode: r.body.data.transfer_code };
  }

  async verifyTransfer(reference: string) {
    const r = await this.call<{ status: string }>(`/transfer/verify/${encodeURIComponent(reference)}`);
    if (r.status === 404) return { status: "not_found" as const };
    if (!r.ok) throw new Error(`paystack_transfer_verify_failed:${r.status}`);
    const s = r.body.data.status;
    return { status: (["success", "failed", "reversed"].includes(s) ? s : "pending") as "success" | "failed" | "reversed" | "pending" };
  }

  async listBanks() {
    const r = await this.call<{ code: string; name: string; active: boolean }[]>("/bank?country=nigeria&perPage=100");
    if (!r.ok) return [];
    return r.body.data.filter((b) => b.active).map((b) => ({ code: b.code, name: b.name }));
  }
}
