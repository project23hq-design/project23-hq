import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken, sha256Hex, chooseReferral } from "@project23/domain/server";
import { adminClient } from "@/lib/supabase/admin";
import { encodeReferrals, readReferrals, referralCookieOptions, rateLimit } from "@/lib/security";
import { env } from "@/lib/env";

/**
 * Promoter link: resolve server-side, record an approximate visit, store a signed
 * first-party cookie (last eligible click per event wins) and redirect ONLY to the
 * internal event page. No raw user ids ever travel in the URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = new URL("/", env().NEXT_PUBLIC_APP_URL);
  if (!/^[a-z0-9-]{4,40}$/.test(code)) return NextResponse.redirect(home);
  const store = await cookies();
  let sid = store.get("p23_sid")?.value;
  if (!sid) {
    sid = randomToken(16);
    store.set("p23_sid", sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: env().APP_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  const allowed = await rateLimit("refvisit", 30, 3600);
  const { data } = await adminClient().rpc("referral_resolve", {
    p_code: code,
    p_session_hash: allowed
      ? sha256Hex(`${sid}:${env().COOKIE_SIGNING_SECRET}`).slice(0, 32)
      : undefined,
  });
  const r = data as {
    link_id: string;
    event_id: string;
    event_slug: string;
    eligible: boolean;
  } | null;
  if (!r) return NextResponse.redirect(home);
  const dest = new URL(`/events/${r.event_slug}`, env().NEXT_PUBLIC_APP_URL);
  if (r.eligible) {
    const list = await readReferrals();
    const existing = list.find((x) => x.e === r.event_id) ?? null;
    const next = chooseReferral(existing, { l: r.link_id, e: r.event_id, t: Date.now() });
    store.set({
      ...referralCookieOptions,
      value: encodeReferrals([...list.filter((x) => x.e !== r.event_id), next]),
    });
  }
  void request;
  return NextResponse.redirect(dest);
}
