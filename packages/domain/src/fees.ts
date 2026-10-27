import { allocateProportional, applyBps } from "./money";

/**
 * Pure TypeScript mirror of the order economics computed in private.build_order.
 * The database is authoritative; this exists for previews (fee policy editor,
 * organizer pricing hints, documentation examples) and is tested against the same rules.
 */
export interface FeePolicy {
  platformFeeBps: number;
  platformFixedMinor: number; // per paid admission
  buyerFeeBps: number;
  buyerFixedMinor: number; // per paid order
}

export interface QuoteLineInput {
  ticketTypeId: string;
  unitPriceMinor: number;
  quantity: number;
  admissionsPerUnit: number;
  promoEligible?: boolean;
  commissionEligible?: boolean;
}

export type Promo = { type: "percent"; bps: number } | { type: "fixed"; amountMinor: number };

export interface QuoteLine extends QuoteLineInput {
  lineSubtotalMinor: number;
  discountMinor: number;
  lineNetMinor: number;
  platformFeeMinor: number;
  commissionMinor: number;
  organizerNetMinor: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalMinor: number;
  discountMinor: number;
  buyerFeeMinor: number;
  totalMinor: number;
  platformFeeMinor: number;
  commissionMinor: number;
  organizerNetMinor: number;
}

export function computeQuote(
  inputs: QuoteLineInput[],
  policy: FeePolicy,
  opts: { promo?: Promo; promoterRateBps?: number; chargeBuyerFee?: boolean } = {},
): Quote {
  const lines = inputs.map((l) => ({
    ...l,
    lineSubtotalMinor: l.unitPriceMinor * l.quantity,
    discountMinor: 0,
    lineNetMinor: 0,
    platformFeeMinor: 0,
    commissionMinor: 0,
    organizerNetMinor: 0,
  }));

  if (opts.promo) {
    const eligible = lines.map((l) =>
      l.promoEligible !== false && l.lineSubtotalMinor > 0 ? l.lineSubtotalMinor : 0,
    );
    if (opts.promo.type === "percent") {
      const bps = opts.promo.bps;
      lines.forEach((l, i) => {
        if (eligible[i]! > 0)
          l.discountMinor = Math.min(l.lineSubtotalMinor, applyBps(l.lineSubtotalMinor, bps));
      });
    } else {
      const parts = allocateProportional(opts.promo.amountMinor, eligible);
      lines.forEach((l, i) => (l.discountMinor = parts[i]!));
    }
  }

  for (const l of lines) {
    l.lineNetMinor = l.lineSubtotalMinor - l.discountMinor;
    if (l.lineNetMinor > 0) {
      l.platformFeeMinor = Math.min(
        l.lineNetMinor,
        applyBps(l.lineNetMinor, policy.platformFeeBps) +
          policy.platformFixedMinor * l.quantity * l.admissionsPerUnit,
      );
      if (opts.promoterRateBps && l.commissionEligible !== false) {
        l.commissionMinor = Math.min(
          applyBps(l.lineNetMinor, opts.promoterRateBps),
          l.lineNetMinor - l.platformFeeMinor,
        );
      }
    }
    l.organizerNetMinor = l.lineNetMinor - l.platformFeeMinor - l.commissionMinor;
  }

  const sum = (k: keyof QuoteLine) => lines.reduce((a, l) => a + (l[k] as number), 0);
  const subtotalMinor = sum("lineSubtotalMinor");
  const discountMinor = sum("discountMinor");
  const net = subtotalMinor - discountMinor;
  const buyerFeeMinor =
    opts.chargeBuyerFee !== false && net > 0
      ? applyBps(net, policy.buyerFeeBps) + policy.buyerFixedMinor
      : 0;
  return {
    lines,
    subtotalMinor,
    discountMinor,
    buyerFeeMinor,
    totalMinor: net + buyerFeeMinor,
    platformFeeMinor: sum("platformFeeMinor"),
    commissionMinor: sum("commissionMinor"),
    organizerNetMinor: sum("organizerNetMinor"),
  };
}

/** Proportional reversal for refunding `units` after `alreadyRefunded` (matches refund_request_create). */
export function proportionalSlice(
  totalMinor: number,
  quantity: number,
  alreadyRefunded: number,
  units: number,
): number {
  return (
    Math.floor((totalMinor * (alreadyRefunded + units)) / quantity) -
    Math.floor((totalMinor * alreadyRefunded) / quantity)
  );
}
