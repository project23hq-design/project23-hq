import "server-only";
import { cookies, headers } from "next/headers";
import sanitizeHtml from "sanitize-html";
import {
  sha256Hex,
  signValue,
  verifySignedValue,
  type ReferralCookie,
} from "@project23/domain/server";
import { env } from "./env";
import { adminClient } from "./supabase/admin";

const REF_COOKIE = "p23_ref";
const GUEST_COOKIE = "p23_guest";

/** Client IP for rate limiting only (never stored). Trusts the platform proxy header. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return sha256Hex(`${ip}:${env().COOKIE_SIGNING_SECRET}`).slice(0, 24);
}

/** Returns true if allowed. Fixed-window counter in the database (works across instances). */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
  subject?: string,
) {
  const key = `${bucket}:${subject ?? (await clientKey())}`;
  const { data, error } = await adminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return true; // fail open for availability; abuse-sensitive paths add their own checks
  return data === true;
}

/** Same-origin check for state-changing route handlers (server actions are origin-checked by Next). */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin && origin !== new URL(env().NEXT_PUBLIC_APP_URL).origin)
    throw new Error("cross_origin_request");
}

// ------------------------------------------------------------------ referral cookie
/** One cookie holding the latest click per event (bounded to 10 events). */
export async function readReferrals(): Promise<ReferralCookie[]> {
  const raw = (await cookies()).get(REF_COOKIE)?.value;
  return verifySignedValue<ReferralCookie[]>(raw, env().COOKIE_SIGNING_SECRET) ?? [];
}

export function encodeReferrals(list: ReferralCookie[]) {
  return signValue(list.slice(-10), env().COOKIE_SIGNING_SECRET);
}

export const referralCookieOptions = {
  name: REF_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.APP_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 60,
};

// ------------------------------------------------------------------ guest order access
interface GuestAccess {
  email: string;
  orderIds: string[];
  exp: number;
}

export async function readGuestAccess(): Promise<GuestAccess | null> {
  const v = verifySignedValue<GuestAccess>(
    (await cookies()).get(GUEST_COOKIE)?.value,
    env().COOKIE_SIGNING_SECRET,
  );
  return v && v.exp > Date.now() ? v : null;
}

/** Grants this browser access to orders for a verified email (from an emailed link) for 2 hours. */
export async function grantGuestAccess(email: string, orderId?: string | null) {
  const store = await cookies();
  const existing = await readGuestAccess();
  const orderIds =
    existing?.email === email
      ? [...new Set([...(existing.orderIds ?? []), ...(orderId ? [orderId] : [])])]
      : orderId
        ? [orderId]
        : [];
  const value: GuestAccess = {
    email,
    orderIds: orderId ? orderIds : ["*"],
    exp: Date.now() + 2 * 3600_000,
  };
  store.set(GUEST_COOKIE, signValue(value, env().COOKIE_SIGNING_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/",
    maxAge: 2 * 3600,
  });
}

export async function guestCanAccessOrder(order: { id: string; buyer_email: string }) {
  const g = await readGuestAccess();
  return (
    !!g &&
    g.email === order.buyer_email &&
    (g.orderIds.includes("*") || g.orderIds.includes(order.id))
  );
}

// ------------------------------------------------------------------ rich text
export function sanitizeDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "h3",
      "h4",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href", "rel", "target"] },
    allowedSchemes: ["https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
  });
}

/** Plain text from organizer-entered description (textarea) -> safe paragraphs. */
export function textToHtml(text: string): string {
  return sanitizeDescription(
    text
      .split(/\n{2,}/)
      .map(
        (p) =>
          `<p>${p.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</p>`,
      )
      .join(""),
  );
}

// ------------------------------------------------------------------ checkout ownership (this browser)
const CHECKOUT_COOKIE = "p23_checkout";

export async function rememberCheckout(orderId: string) {
  const store = await cookies();
  const list =
    verifySignedValue<string[]>(store.get(CHECKOUT_COOKIE)?.value, env().COOKIE_SIGNING_SECRET) ??
    [];
  const next = [...list.filter((id) => id !== orderId), orderId].slice(-10);
  store.set(CHECKOUT_COOKIE, signValue(next, env().COOKIE_SIGNING_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function browserCreatedOrder(orderId: string) {
  const list =
    verifySignedValue<string[]>(
      (await cookies()).get(CHECKOUT_COOKIE)?.value,
      env().COOKIE_SIGNING_SECRET,
    ) ?? [];
  return list.includes(orderId);
}
