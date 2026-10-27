"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { engineCode, engineErrorMessage, normalizeNigerianPhone } from "@project23/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

export async function updateProfileAction(_: unknown, form: FormData) {
  const { supabase, user } = await requireUser();
  const name = z.string().trim().min(2).max(120).safeParse(form.get("fullName"));
  const rawPhone = String(form.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizeNigerianPhone(rawPhone) : null;
  if (!name.success) return { error: "Enter your full name." };
  if (rawPhone && !phone) return { error: "Enter a valid Nigerian phone number." };
  const { error } = await supabase.from("profiles").update({ full_name: name.data, phone }).eq("id", user.id);
  revalidatePath("/account");
  return error ? { error: "Couldn't save your profile." } : { message: "Saved." };
}

/** Re-authentication: re-entering the password refreshes the session's auth timestamp (amr). */
export async function reauthenticateAction(_: unknown, form: FormData) {
  const { user } = await requireUser();
  if (!(await rateLimit("reauth", 5, 600, user.id))) return { error: "Too many attempts. Try again later." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: user.email!, password: String(form.get("password") ?? "") });
  return error ? { error: "Incorrect password." } : { message: "Confirmed. You can continue for the next 15 minutes." };
}

export async function buyerRefundRequestAction(_: unknown, form: FormData) {
  const { supabase } = await requireUser();
  const orderId = String(form.get("orderId"));
  const { error } = await supabase.rpc("refund_request_create", { p_order: orderId, p_items: null, p_reason: String(form.get("reason") ?? ""), p_include_used: false });
  revalidatePath(`/account/orders/${orderId}`);
  return error ? { error: engineErrorMessage(engineCode(error)) } : { message: "Refund requested. The organizer will review it and you'll get an email with the outcome." };
}

export async function resendTicketsAction(orderId: string) {
  const { supabase, user } = await requireUser();
  if (!(await rateLimit("resend", 3, 3600, `${user.id}:${orderId}`))) return { error: "You can resend tickets up to 3 times an hour." };
  const { data: order } = await supabase.from("orders").select("id").eq("id", orderId).eq("buyer_user_id", user.id).maybeSingle();
  if (!order) return { error: "Order not found." };
  const { adminClient } = await import("@/lib/supabase/admin");
  const stamp = String(Date.now());
  // A distinct resend stamp gives the email its own dedupe key; job retries of this resend still send once.
  await adminClient().rpc("jobs_enqueue", { p_kind: "order.deliver", p_payload: { order_id: orderId, resend: stamp }, p_dedupe_key: `order.deliver:${orderId}:resend:${stamp}` });
  return { message: "We'll resend your tickets in a moment." };
}
