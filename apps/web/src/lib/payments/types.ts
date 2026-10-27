export type ProviderTxStatus = "success" | "failed" | "abandoned" | "pending";

export interface VerifiedTransaction {
  reference: string;
  status: ProviderTxStatus;
  amountMinor: number;
  currency: string;
  transactionId: string;
  feesMinor: number | null;
  channel: string | null;
  environment: "test" | "live";
}

export type WebhookEvent =
  | { kind: "charge"; reference: string }
  | {
      kind: "refund";
      transactionReference: string;
      providerRefundId: string;
      status: "processed" | "failed" | "processing" | "pending";
    }
  | {
      kind: "transfer";
      reference: string;
      status: "success" | "failed" | "reversed";
      reason?: string;
    }
  | {
      kind: "dispute";
      disputeId: string;
      transactionReference: string;
      status: "open" | "awaiting_response" | "won" | "lost" | "resolved";
      amountMinor: number;
      reason?: string;
    }
  | { kind: "ignored"; type: string };

export interface PaymentProvider {
  readonly name: "paystack" | "test";
  readonly environment: "test" | "live";
  initialize(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string }>;
  /** Server-to-server verification; the ONLY trusted source of payment status besides signed webhooks. */
  verify(reference: string): Promise<VerifiedTransaction | null>;
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhook(payload: unknown): WebhookEvent;
  refund(input: { transactionReference: string; amountMinor: number }): Promise<{
    providerRefundId: string;
    status: "pending" | "processing" | "processed" | "failed";
  }>;
  resolveAccount(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountName: string } | null>;
  createRecipient(input: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<{ recipientCode: string }>;
  transfer(input: {
    amountMinor: number;
    recipientCode: string;
    reference: string;
    reason: string;
  }): Promise<{
    status: "success" | "pending" | "failed" | "otp" | "unknown";
    transferCode?: string;
  }>;
  verifyTransfer(
    reference: string,
  ): Promise<{ status: "success" | "pending" | "failed" | "reversed" | "not_found" }>;
  listBanks(): Promise<{ code: string; name: string }[]>;
}
