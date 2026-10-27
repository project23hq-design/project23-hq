/**
 * Server-only cryptographic helpers (node:crypto). Never import from client components.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Admission QR credential: opaque, unguessable, contains no personal data.
 * token = "P23T." + base64url(HMAC-SHA256(secret, "ticket:" + id + ":" + version))[0..32] + "." + shortId
 * The database stores only sha256(token). Bumping token_version rotates the credential.
 */
export function ticketQrToken(ticketId: string, version: number, secret: string): string {
  if (!secret || secret.length < 32)
    throw new Error("TICKET_QR_SECRET must be at least 32 characters");
  const mac = createHmac("sha256", secret)
    .update(`ticket:${ticketId}:${version}`)
    .digest("base64url")
    .slice(0, 32);
  return `P23T.${mac}`;
}

export function ticketQrHash(token: string): string {
  return sha256Hex(token.trim());
}

/** Paystack webhook signature: HMAC-SHA512 of the raw body with the secret key, hex. */
export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string,
): boolean {
  if (!signature || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, signature.trim());
}

/** Compact signed value for first-party cookies: base64url(json).base64url(hmac). */
export function signValue(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySignedValue<T>(value: string | undefined | null, secret: string): T | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(expected, mac)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export interface ReferralCookie {
  l: string; // referral link id
  e: string; // event id
  t: number; // click time (epoch ms)
}

/** Last-click-wins: a newer eligible click for the same event replaces the previous one. */
export function chooseReferral(
  existing: ReferralCookie | null,
  incoming: ReferralCookie,
): ReferralCookie {
  if (!existing || existing.e !== incoming.e) return incoming;
  return incoming.t >= existing.t ? incoming : existing;
}

export function referralWithinWindow(
  ref: ReferralCookie,
  eventId: string,
  windowDays: number,
  now = Date.now(),
): boolean {
  return ref.e === eventId && ref.t <= now && now - ref.t <= windowDays * 86_400_000;
}
