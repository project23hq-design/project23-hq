import { NextResponse } from "next/server";
import { sha256Hex } from "@project23/domain/server";
import { adminClient } from "@/lib/supabase/admin";
import { grantGuestAccess, rateLimit } from "@/lib/security";
import { env } from "@/lib/env";

/** Emailed access link -> short-lived signed browser grant -> order page. Tokens are stored hashed. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = env().NEXT_PUBLIC_APP_URL;
  if (!(await rateLimit("access-link", 30, 600)) || token.length < 20)
    return NextResponse.redirect(new URL("/orders/lookup?error=invalid", base));
  const { data } = await adminClient().rpc("access_token_resolve", { p_hash: sha256Hex(token) });
  const t = data as { email: string; order_id: string | null; purpose: string } | null;
  if (!t) return NextResponse.redirect(new URL("/orders/lookup?error=expired", base));
  await grantGuestAccess(t.email, t.purpose === "order_link" ? t.order_id : null);
  return NextResponse.redirect(
    new URL(t.order_id && t.purpose === "order_link" ? `/orders/${t.order_id}` : "/orders", base),
  );
}
