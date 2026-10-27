import { describe, expect, it } from "vitest";
import { allocateProportional, applyBps, formatMoney, parseMoneyToMinor, formatBps } from "./money";
import { computeQuote, proportionalSlice } from "./fees";
import { normalizeNigerianPhone, priceLabel, slugify, zonedLocalToUtc, utcToZonedLocal } from "./format";
import { checkoutSchema } from "./schemas";
import {
  chooseReferral, referralWithinWindow, signValue, ticketQrHash, ticketQrToken, verifyPaystackSignature, verifySignedValue,
} from "./server";
import { createHmac } from "node:crypto";
import { can } from "./permissions";

const policy = { platformFeeBps: 500, platformFixedMinor: 0, buyerFeeBps: 0, buyerFixedMinor: 0 };

describe("money", () => {
  it("applies basis points with round-half-up on integers", () => {
    expect(applyBps(1_000_000, 500)).toBe(50_000);
    expect(applyBps(1, 5000)).toBe(1); // 0.5 rounds up
    expect(applyBps(1, 4999)).toBe(0);
    expect(() => applyBps(1.5, 100)).toThrow();
  });

  it("allocates proportionally and exactly", () => {
    const parts = allocateProportional(100, [100, 100, 100]);
    expect(parts.reduce((a, b) => a + b)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
    expect(allocateProportional(1000, [100, 50])).toEqual([100, 50]); // capped at weights
  });

  it("formats and parses naira", () => {
    expect(formatMoney(1_000_000)).toBe("₦10,000");
    expect(formatMoney(1_000_050)).toBe("₦10,000.5");
    expect(parseMoneyToMinor("₦10,000.50")).toBe(1_000_050);
    expect(parseMoneyToMinor("abc")).toBeNull();
    expect(formatBps(1050)).toBe("10.5%");
    expect(formatBps(500)).toBe("5%");
  });
});

describe("order economics", () => {
  it("matches the documented ₦10,000 / 5% fee / 10% promoter example", () => {
    const q = computeQuote(
      [{ ticketTypeId: "t", unitPriceMinor: 1_000_000, quantity: 1, admissionsPerUnit: 1 }],
      policy,
      { promoterRateBps: 1000 },
    );
    expect(q.totalMinor).toBe(1_000_000);
    expect(q.platformFeeMinor).toBe(50_000);
    expect(q.commissionMinor).toBe(100_000);
    expect(q.organizerNetMinor).toBe(850_000);
  });

  it("applies percentage discounts before fees and commission", () => {
    const q = computeQuote(
      [{ ticketTypeId: "vip", unitPriceMinor: 2_000_000, quantity: 2, admissionsPerUnit: 1 }],
      policy,
      { promo: { type: "percent", bps: 1000 }, promoterRateBps: 1000 },
    );
    expect(q.discountMinor).toBe(400_000);
    expect(q.totalMinor).toBe(3_600_000);
    expect(q.platformFeeMinor).toBe(180_000);
    expect(q.commissionMinor).toBe(360_000);
    expect(q.organizerNetMinor).toBe(3_060_000);
  });

  it("never discounts below zero and never makes organizer net negative", () => {
    const q = computeQuote(
      [{ ticketTypeId: "a", unitPriceMinor: 500, quantity: 1, admissionsPerUnit: 1 }],
      { ...policy, platformFeeBps: 9000 },
      { promo: { type: "fixed", amountMinor: 1_000_000 }, promoterRateBps: 3000 },
    );
    expect(q.totalMinor).toBe(0);
    expect(q.organizerNetMinor).toBe(0);
    const q2 = computeQuote(
      [{ ticketTypeId: "a", unitPriceMinor: 1000, quantity: 1, admissionsPerUnit: 1 }],
      { ...policy, platformFeeBps: 9000 },
      { promoterRateBps: 3000 },
    );
    expect(q2.organizerNetMinor).toBeGreaterThanOrEqual(0);
    expect(q2.platformFeeMinor + q2.commissionMinor + q2.organizerNetMinor).toBe(1000);
  });

  it("charges per-admission fixed fees for table products", () => {
    const q = computeQuote(
      [{ ticketTypeId: "table", unitPriceMinor: 15_000_000, quantity: 1, admissionsPerUnit: 6 }],
      { ...policy, platformFixedMinor: 1000 },
    );
    expect(q.platformFeeMinor).toBe(750_000 + 6_000);
  });

  it("splits proportional refunds so slices sum to the whole", () => {
    const total = 1001;
    const slices = [proportionalSlice(total, 3, 0, 1), proportionalSlice(total, 3, 1, 1), proportionalSlice(total, 3, 2, 1)];
    expect(slices.reduce((a, b) => a + b)).toBe(total);
  });
});

describe("formatting", () => {
  it("normalizes Nigerian phone numbers", () => {
    expect(normalizeNigerianPhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizeNigerianPhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normalizeNigerianPhone("2348031234567")).toBe("+2348031234567");
    expect(normalizeNigerianPhone("12345")).toBeNull();
  });

  it("produces honest price labels", () => {
    const f = (m: number) => formatMoney(m);
    const base = { is_sold_out: false, sales_ended: false, status: "published" };
    expect(priceLabel({ ...base, min_price_minor: 0, max_price_minor: 0 }, f)).toBe("Free");
    expect(priceLabel({ ...base, min_price_minor: 500_000, max_price_minor: 2_000_000 }, f)).toBe("From ₦5,000");
    expect(priceLabel({ ...base, is_sold_out: true, min_price_minor: 1, max_price_minor: 1 }, f)).toBe("Sold out");
    expect(priceLabel({ ...base, sales_ended: true, min_price_minor: 1, max_price_minor: 1 }, f)).toBe("Sales ended");
    expect(priceLabel({ ...base, status: "cancelled", min_price_minor: 1, max_price_minor: 1 }, f)).toBe("Cancelled");
  });

  it("converts wall-clock event times in Africa/Lagos to UTC and back", () => {
    expect(zonedLocalToUtc("2026-12-24T19:00", "Africa/Lagos")).toBe("2026-12-24T18:00:00.000Z");
    expect(utcToZonedLocal("2026-12-24T18:00:00.000Z", "Africa/Lagos")).toBe("2026-12-24T19:00");
  });

  it("slugifies titles", () => {
    expect(slugify("Ọ̀ṣun Groove: Night #1!")).toBe("osun-groove-night-1");
  });
});

describe("checkout validation", () => {
  it("rejects missing consent and bad phone numbers", () => {
    const r = checkoutSchema.safeParse({
      eventId: "30000000-0000-4000-8000-000000000001",
      items: [{ ticketTypeId: "40000000-0000-4000-8000-000000000001", quantity: 2 }],
      buyer: { name: "A B", email: "A@Example.com", phone: "123" },
      idempotencyKey: "x".repeat(20),
      acceptTerms: false,
    });
    expect(r.success).toBe(false);
  });
  it("normalizes email and phone", () => {
    const r = checkoutSchema.parse({
      eventId: "30000000-0000-4000-8000-000000000001",
      items: [{ ticketTypeId: "40000000-0000-4000-8000-000000000001", quantity: 2 }],
      buyer: { name: "Ada Obi", email: " Ada@Example.com ", phone: "08031234567" },
      idempotencyKey: "x".repeat(20),
      acceptTerms: true,
    });
    expect(r.buyer.email).toBe("ada@example.com");
    expect(r.buyer.phone).toBe("+2348031234567");
  });
});

describe("credentials and signatures", () => {
  const secret = "s".repeat(40);
  it("rotates QR tokens with version and never embeds personal data", () => {
    const v1 = ticketQrToken("ticket-1", 1, secret);
    const v2 = ticketQrToken("ticket-1", 2, secret);
    expect(v1).not.toBe(v2);
    expect(v1).toMatch(/^P23T\.[A-Za-z0-9_-]{32}$/);
    expect(v1).not.toContain("ticket-1");
    expect(ticketQrHash(v1)).toHaveLength(64);
  });
  it("verifies Paystack signatures against the raw body only", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "r1" } });
    const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(verifyPaystackSignature(body, sig, "sk_test_x")).toBe(true);
    expect(verifyPaystackSignature(body + " ", sig, "sk_test_x")).toBe(false);
    expect(verifyPaystackSignature(body, sig, "sk_test_other")).toBe(false);
    expect(verifyPaystackSignature(body, null, "sk_test_x")).toBe(false);
  });
  it("rejects tampered signed cookies", () => {
    const v = signValue({ l: "link", e: "event", t: 1 }, secret);
    expect(verifySignedValue(v, secret)).toEqual({ l: "link", e: "event", t: 1 });
    const [body, mac] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ l: "other", e: "event", t: 1 })).toString("base64url") + "." + mac;
    expect(verifySignedValue(forged, secret)).toBeNull();
    expect(verifySignedValue(`${body}.x`, secret)).toBeNull();
  });
  it("applies last-click attribution within the event-scoped window", () => {
    const a = { l: "A", e: "ev1", t: 1000 };
    const b = { l: "B", e: "ev1", t: 2000 };
    expect(chooseReferral(a, b).l).toBe("B");
    expect(chooseReferral(b, a).l).toBe("B");
    expect(referralWithinWindow(b, "ev1", 7, 2000 + 6 * 86_400_000)).toBe(true);
    expect(referralWithinWindow(b, "ev1", 7, 2000 + 8 * 86_400_000)).toBe(false);
    expect(referralWithinWindow(b, "ev2", 7, 3000)).toBe(false);
  });
});

describe("permissions", () => {
  it("keeps bank details owner-only and gives scanners no finance access", () => {
    expect(can("owner", "payouts.bank")).toBe(true);
    expect(can("finance", "payouts.bank")).toBe(false);
    expect(can("scanner", "finance.view")).toBe(false);
    expect(can("manager", "payouts.request")).toBe(false);
  });
});
