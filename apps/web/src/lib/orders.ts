import "server-only";
import { adminClient } from "./supabase/admin";
import { getSession } from "./auth";
import { browserCreatedOrder, guestCanAccessOrder } from "./security";
import { qrDataUrl, qrTokenFor } from "./tickets";

/**
 * Loads an order for the current viewer or returns null. Access is granted only to:
 * the signed-in buyer (RLS), this browser if it created the order, or a guest who opened
 * an emailed access link. Knowing an email address or reference grants nothing.
 */
export async function loadOrderForViewer(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const { supabase, user } = await getSession();
  let order = null;
  if (user) {
    const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (data && data.buyer_user_id === user.id) order = data;
  }
  if (!order) {
    const { data } = await adminClient().from("orders").select("*").eq("id", orderId).maybeSingle();
    if (data && ((await browserCreatedOrder(orderId)) || (await guestCanAccessOrder(data))))
      order = data;
  }
  if (!order) return null;
  const db = adminClient(); // access already established above
  const [{ data: items }, { data: tickets }, { data: event }, { data: attempts }] =
    await Promise.all([
      db.from("order_items").select("*").eq("order_id", order.id),
      db
        .from("tickets")
        .select(
          "id, public_ref, order_item_id, unit_number, admission_number, status, token_version, attendee_name, first_checked_in_at",
        )
        .eq("order_id", order.id)
        .order("unit_number")
        .order("admission_number"),
      db
        .from("public_events")
        .select(
          "id, slug, title, starts_at, ends_at, timezone, venue_name, address_line, city_name, cover_path, category_slug, organization_name, format, status",
        )
        .eq("id", order.event_id)
        .maybeSingle(),
      db
        .from("payment_attempts")
        .select("status, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  return {
    order,
    items: items ?? [],
    tickets: tickets ?? [],
    event,
    lastAttempt: attempts?.[0] ?? null,
  };
}

export async function ticketQrs(tickets: { id: string; token_version: number; status: string }[]) {
  return Promise.all(
    tickets.map(async (t) => (t.status === "valid" ? qrDataUrl(qrTokenFor(t)) : null)),
  );
}
