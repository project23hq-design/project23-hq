import { afterEach, describe, expect, it, vi } from "vitest";

const { PaystackProvider, disputeOutcome, fromPaystackTransferRef, toPaystackTransferRef } =
  await import("../../apps/web/src/lib/payments/paystack");

const ps = new PaystackProvider("sk_test_unit");

/** Payloads trimmed from the examples in Paystack's webhook docs (paystack.com/docs/payments/webhooks). */
const refundProcessed = {
  event: "refund.processed",
  data: {
    status: "processed",
    transaction_reference: "P23_ABC123_x1y2z3",
    refund_reference: "132013318360",
    amount: "5000",
    currency: "NGN",
    domain: "test",
  },
};
const dispute = (event: string, resolution: string | null) => ({
  event,
  data: {
    id: 358950,
    refund_amount: 5800,
    currency: "NGN",
    status: resolution ? "resolved" : "awaiting-merchant-feedback",
    resolution,
    transaction: { id: 896467688, reference: "P23_ABC123_x1y2z3", amount: 5800 },
    transaction_reference: null,
    category: "chargeback",
  },
});

describe("Paystack transfer references", () => {
  it("meets Paystack's rules (16-50 chars of a-z, 0-9, - and _) and round-trips", () => {
    const ours = "PO-7KQ2MXH9PA";
    const theirs = toPaystackTransferRef(ours);
    expect(theirs).toBe("p23-po-7kq2mxh9pa");
    expect(theirs).toMatch(/^[a-z0-9_-]{16,50}$/);
    expect(fromPaystackTransferRef(theirs)).toBe(ours);
  });

  it("maps transfer webhooks back to our payout reference", () => {
    const evt = ps.parseWebhook({
      event: "transfer.success",
      data: { reference: "p23-po-7kq2mxh9pa", status: "success" },
    });
    expect(evt).toEqual({
      kind: "transfer",
      reference: "PO-7KQ2MXH9PA",
      status: "success",
      reason: undefined,
    });
  });
});

describe("Paystack refund webhooks", () => {
  it("identify the payment, not the refund (the payload has no refund id)", () => {
    expect(ps.parseWebhook(refundProcessed)).toEqual({
      kind: "refund",
      transactionReference: "P23_ABC123_x1y2z3",
      status: "processed",
    });
  });
});

describe("Paystack dispute outcomes", () => {
  it.each([
    ["charge.dispute.create", null, "open"],
    ["charge.dispute.remind", null, "awaiting_response"],
    ["charge.dispute.resolve", "merchant-accepted", "lost"],
    ["charge.dispute.resolve", "auto-accepted", "lost"],
    ["charge.dispute.resolve", "declined", "won"],
    ["charge.dispute.resolve", "auto-declined", "won"],
    // unknown outcome: keep the money held for a person instead of guessing
    ["charge.dispute.resolve", "something-new", "awaiting_response"],
  ])("%s / %s → %s", (event, resolution, expected) => {
    expect(disputeOutcome(event, resolution)).toBe(expected);
    const evt = ps.parseWebhook(dispute(event, resolution));
    expect(evt).toMatchObject({
      kind: "dispute",
      disputeId: "358950",
      transactionReference: "P23_ABC123_x1y2z3",
      status: expected,
      amountMinor: 5800,
      reason: "chargeback",
    });
  });
});

describe("Paystack API calls", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("sends payouts with a Paystack-valid reference and keeps the rejection reason", async () => {
    const fetchMock = reply(400, {
      status: false,
      message: "You cannot initiate third party payouts as a starter business",
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await ps.transfer({
      amountMinor: 10_000,
      recipientCode: "RCP_x",
      reference: "PO-7KQ2MXH9PA",
      reason: "test",
    });
    expect(res).toEqual({
      status: "failed",
      message: "You cannot initiate third party payouts as a starter business",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent.reference).toBe("p23-po-7kq2mxh9pa");
  });

  it("verifies transfers by the Paystack-format reference", async () => {
    const fetchMock = reply(404, { status: false, message: "Transfer not found" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await ps.verifyTransfer("PO-7KQ2MXH9PA")).toEqual({ status: "not_found" });
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toMatch(
      /\/transfer\/verify\/p23-po-7kq2mxh9pa$/,
    );
  });

  it("reads refund status from GET /refund/:id", async () => {
    vi.stubGlobal("fetch", reply(200, { status: true, data: { id: 1, status: "processed" } }));
    expect(await ps.fetchRefund("1")).toEqual({ status: "processed" });
    vi.stubGlobal("fetch", reply(200, { status: true, data: { id: 1, status: "pending" } }));
    expect(await ps.fetchRefund("1")).toEqual({ status: "pending" });
  });

  it("lists each payout-capable bank once, plus Paystack's test bank in test mode", async () => {
    vi.stubGlobal(
      "fetch",
      reply(200, {
        status: true,
        data: [
          { code: "057", name: "Zenith Bank", active: true, supports_transfer: true },
          { code: "057", name: "Zenith Bank", active: true, supports_transfer: true },
          { code: "999", name: "No Payouts MFB", active: true, supports_transfer: false },
          { code: "058", name: "Guaranty Trust Bank", active: true, supports_transfer: true },
        ],
      }),
    );
    expect(await ps.listBanks()).toEqual([
      { code: "001", name: "Paystack Test Bank (test mode only)" }, // test keys only
      { code: "057", name: "Zenith Bank" },
      { code: "058", name: "Guaranty Trust Bank" },
    ]);
  });
});
