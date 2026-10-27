/**
 * Money is always an integer number of minor units (kobo for NGN). Rates are integer
 * basis points (1% = 100 bps). These helpers mirror the SQL engine exactly so previews
 * shown in the UI match what the database will charge.
 */

export type CurrencyCode = "NGN";

export const MINOR_PER_MAJOR: Record<CurrencyCode, number> = { NGN: 100 };

function assertInt(n: number, name: string) {
  if (!Number.isSafeInteger(n)) throw new TypeError(`${name} must be a safe integer (got ${n})`);
}

/** Round-half-up application of basis points to a non-negative amount (matches private.apply_bps). */
export function applyBps(amountMinor: number, bps: number): number {
  assertInt(amountMinor, "amountMinor");
  assertInt(bps, "bps");
  if (amountMinor < 0 || bps < 0) throw new RangeError("applyBps expects non-negative inputs");
  return Math.floor((amountMinor * bps + 5000) / 10000);
}

/**
 * Split `total` across `weights` proportionally using floor division, distributing the
 * remainder one minor unit at a time in index order without exceeding any weight
 * (matches the fixed-discount allocation in private.build_order).
 */
export function allocateProportional(total: number, weights: number[]): number[] {
  assertInt(total, "total");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const capped = Math.min(total, sum);
  const out = weights.map((w) => Math.floor((capped * w) / sum));
  let rem = capped - out.reduce((a, b) => a + b, 0);
  let i = 0;
  while (rem > 0) {
    if (out[i]! < weights[i]!) {
      out[i]! += 1;
      rem -= 1;
    }
    i = (i + 1) % weights.length;
  }
  return out;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** ₦10,000 or ₦10,000.50 — never floating-point arithmetic on the amount itself. */
export function formatMoney(minor: number, currency: CurrencyCode = "NGN"): string {
  assertInt(minor, "minor");
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const major = Math.floor(abs / MINOR_PER_MAJOR[currency]);
  const fraction = abs % MINOR_PER_MAJOR[currency];
  // Intl receives a value built from integers; the fractional part is exact for 2dp currencies.
  const text = nairaFormatter.format(major + fraction / 100);
  return negative ? `-${text}` : text;
}

/** Parse "10,000" / "₦10,000.50" into minor units. Returns null on invalid input. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "").trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return frac === 0 ? `${whole}%` : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}%`;
}
