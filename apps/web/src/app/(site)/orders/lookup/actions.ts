"use server";
import { z } from "zod";
import { randomToken, sha256Hex } from "@project23/domain/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security";
import { deliverEmail } from "@/lib/email";
import { layout } from "@/lib/email/templates";
import { env } from "@/lib/env";

const GENERIC = "If we have tickets for that email address, we've sent a secure link to it. The link expires in 30 minutes.";

/** Always returns the same message whether or not orders exist (no account/order enumeration). */
export async function requestOrderLinkAction(_prev: unknown, form: FormData): Promise<{ message: string; error?: string }> {
  const parsed = z.string().trim().toLowerCase().pipe(z.email()).safeParse(form.get("email"));
  if (!parsed.success) return { message: "", error: "Enter a valid email address." };
  const email = parsed.data;
  if (!(await rateLimit("lookup-ip", 10, 3600)) || !(await rateLimit("lookup-email", 3, 3600, email))) return { message: GENERIC };
  const db = adminClient();
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("buyer_email", email)
    .in("status", ["paid", "partially_refunded", "refunded", "fulfillment_exception"]);
  if (count && count > 0) {
    const token = randomToken(32);
    await db.rpc("access_token_create", { p_hash: sha256Hex(token), p_purpose: "retrieval", p_email: email, p_minutes: 30 });
    const url = `${env().NEXT_PUBLIC_APP_URL}/orders/access/${token}`;
    await deliverEmail(`retrieval:${sha256Hex(token).slice(0, 24)}`, "order_retrieval", {
      to: email, subject: "Your Project23 tickets link",
      html: layout({ preheader: "Secure link to your tickets", title: "Here's your secure tickets link", body: "<p>Use the button below to see your Project23 orders and tickets. The link expires in 30 minutes and only works for this email address.</p><p>If you didn't ask for this, you can ignore this email.</p>", cta: { label: "View my tickets", url } }),
      text: `View your Project23 tickets (expires in 30 minutes): ${url}`,
    }).catch(() => undefined);
  }
  return { message: GENERIC };
}
