"use server";
import { redirect } from "next/navigation";
import { checkoutSchema, engineCode, engineErrorMessage } from "@project23/domain";
import { adminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { rateLimit, readReferrals, rememberCheckout } from "@/lib/security";
import { logger } from "@/lib/log";

type Items = { ticketTypeId: string; quantity: number; accessCode?: string }[];

async function referralFor(eventId: string) {
  const refs = await readReferrals();
  const r = refs.filter((x) => x.e === eventId).sort((a, b) => b.t - a.t)[0];
  return r ? { link_id: r.l, clicked_at: new Date(r.t).toISOString() } : null;
}

const toRpcItems = (items: Items) =>
  items
    .filter((i) => i.quantity > 0)
    .map((i) => ({
      ticket_type_id: i.ticketTypeId,
      quantity: i.quantity,
      access_code: i.accessCode || undefined,
    }));

export type QuoteResult =
  | {
      ok: true;
      subtotal_minor: number;
      discount_minor: number;
      buyer_fee_minor: number;
      total_minor: number;
      admissions: number;
    }
  | { ok: false; error: string };

/** Server-side quote (no inventory held). Prices always come from the database. */
export async function quoteAction(
  eventId: string,
  items: Items,
  promoCode?: string,
): Promise<QuoteResult> {
  if (!(await rateLimit("quote", 60, 60)))
    return { ok: false, error: engineErrorMessage("rate_limited") };
  const rpcItems = toRpcItems(items);
  if (rpcItems.length === 0) return { ok: false, error: engineErrorMessage("invalid_items") };
  const { data, error } = await adminClient().rpc("checkout_quote", {
    p_event: eventId,
    p_items: rpcItems,
    p_promo_code: promoCode?.trim() || undefined,
    p_referral: (await referralFor(eventId)) ?? undefined,
  });
  if (error) return { ok: false, error: engineErrorMessage(engineCode(error)) };
  const q = data as { ok: boolean; error?: string; detail?: string } & Omit<
    Extract<QuoteResult, { ok: true }>,
    "ok"
  >;
  if (!q.ok)
    return { ok: false, error: engineErrorMessage(q.error) + (q.detail ? ` (${q.detail})` : "") };
  return {
    ok: true,
    subtotal_minor: q.subtotal_minor,
    discount_minor: q.discount_minor,
    buyer_fee_minor: q.buyer_fee_minor,
    total_minor: q.total_minor,
    admissions: q.admissions,
  };
}

export type CreateOrderState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

/** Creates the order (holds inventory) and sends the buyer to the secure checkout page. */
export async function createOrderAction(input: unknown): Promise<CreateOrderState> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { error: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  if (!(await rateLimit("checkout", 12, 600))) return { error: engineErrorMessage("rate_limited") };
  if (!(await rateLimit("checkout-email", 8, 600, v.buyer.email)))
    return { error: engineErrorMessage("rate_limited") };
  const { user } = await getSession();
  const log = logger({ scope: "checkout.create", eventId: v.eventId });
  // The account is only linked when the signed-in user's own verified email is used.
  const linkUser =
    user && user.email_confirmed_at && user.email?.toLowerCase() === v.buyer.email ? user.id : null;
  const { data, error } = await adminClient().rpc("checkout_create_order", {
    p_event: v.eventId,
    p_items: toRpcItems(v.items),
    p_buyer: {
      name: v.buyer.name,
      email: v.buyer.email,
      phone: v.buyer.phone ?? "",
      user_id: linkUser ?? "",
    },
    p_promo_code: v.promoCode || undefined,
    p_referral: (await referralFor(v.eventId)) ?? undefined,
    p_idempotency_key: `web:${v.idempotencyKey}`,
  });
  if (error) {
    const code = engineCode(error);
    log.warn("order rejected", { code: code ?? error.message });
    return { error: engineErrorMessage(code) + (error.details ? ` (${error.details})` : "") };
  }
  const order = data as { order_id: string; status: string };
  await rememberCheckout(order.order_id);
  log.info("order created", { orderId: order.order_id, status: order.status });
  redirect(`/checkout/${order.order_id}`);
}

export async function toggleFavoriteAction(eventId: string, on: boolean) {
  const { supabase, user } = await getSession();
  if (!user) redirect(`/sign-in`);
  if (on) await supabase.from("favorites").upsert({ user_id: user.id, event_id: eventId });
  else await supabase.from("favorites").delete().eq("user_id", user.id).eq("event_id", eventId);
  return on;
}

export async function reportEventAction(eventId: string, reason: string, details: string) {
  const { supabase, user } = await getSession();
  if (!user) return { error: "Sign in to report an event." };
  if (!(await rateLimit("report", 5, 3600, user.id)))
    return { error: engineErrorMessage("rate_limited") };
  const allowed = ["fraud", "inappropriate", "misleading", "safety", "ip", "other"];
  const { error } = await supabase.from("reports").insert({
    event_id: eventId,
    reporter_id: user.id,
    reason: allowed.includes(reason) ? reason : "other",
    details: details.slice(0, 2000),
  });
  return error ? { error: "Couldn't submit the report." } : { ok: true };
}
