import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Integration helpers: real Postgres connections to the local Supabase database.
 * Each "actor" runs inside a transaction with `SET LOCAL ROLE` + JWT claims, exactly
 * how PostgREST executes requests, so RLS, grants and SECURITY DEFINER checks apply.
 */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 40 });

export const USERS = {
  organizer: "00000000-0000-4000-8000-000000000001", // owner of Osun Sound Collective (+ Ilesa Laugh Factory)
  customer: "00000000-0000-4000-8000-000000000002",
  scanner: "00000000-0000-4000-8000-000000000003", // scanner member of OSC and Project23
  promoter: "00000000-0000-4000-8000-000000000004",
  ops: "00000000-0000-4000-8000-000000000005", // owner of Project23 org
  campus: "00000000-0000-4000-8000-000000000006",
  finance: "00000000-0000-4000-8000-000000000007", // finance member of OSC
} as const;
export const ORGS = {
  project23: "20000000-0000-4000-8000-000000000001",
  osc: "20000000-0000-4000-8000-000000000002",
  campus: "20000000-0000-4000-8000-000000000003",
} as const;

export type Actor =
  | { kind: "service" }
  | { kind: "anon" }
  | { kind: "user"; id: string; aal?: "aal1" | "aal2"; recentAuth?: boolean };

export const service: Actor = { kind: "service" };
export const anon: Actor = { kind: "anon" };
export const user = (
  id: string,
  opts: { aal?: "aal1" | "aal2"; recentAuth?: boolean } = {},
): Actor => ({ kind: "user", id, ...opts });

function claims(a: Actor) {
  if (a.kind === "service") return { role: "service_role" };
  if (a.kind === "anon") return { role: "anon" };
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: a.id,
    role: "authenticated",
    aal: a.aal ?? "aal1",
    amr: [{ method: "password", timestamp: a.recentAuth === false ? now - 7200 : now }],
  };
}

/** Run a query as an actor in its own transaction (committed unless it throws). */
export async function as<T = Record<string, unknown>>(
  a: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const role =
      a.kind === "service" ? "service_role" : a.kind === "anon" ? "anon" : "authenticated";
    await c.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify(claims(a)), a.kind === "user" ? a.id : ""],
    );
    await c.query(`set local role ${role}`);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Superuser (migration owner) access for fixtures and time travel. */
export async function admin<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}

export async function expectError(p: Promise<unknown>, match?: RegExp | string) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (match && !(typeof match === "string" ? msg.includes(match) : match.test(msg))) {
      throw new Error(`Expected error matching ${match}, got: ${msg}`);
    }
    return msg;
  }
  throw new Error(
    `Expected an error${match ? ` matching ${match}` : ""} but the operation succeeded`,
  );
}

export interface TicketSpec {
  name?: string;
  price: number;
  qty: number;
  apu?: number;
  kind?: string;
  max?: number;
  visibility?: string;
}

/** Create a published, approved event with ticket types for an org. Prices in kobo. */
export async function createEvent(opts: {
  org?: string;
  capacity: number;
  tickets: TicketSpec[];
  startsInDays?: number;
  title?: string;
  visibility?: "public" | "unlisted";
}) {
  const org = opts.org ?? ORGS.osc;
  const slug = `t-${randomUUID().slice(0, 12)}`;
  // Unlisted so test fixtures never appear in public discovery; still purchasable by link.
  const visibility = opts.visibility ?? "unlisted";
  const [{ id }] = await admin<{ id: string }>(
    `insert into public.events (organization_id, slug, title, description_html, category_id, venue_name, city_id, starts_at, ends_at, capacity, status, moderation_status, published_at, created_by, visibility)
     select $1, $2, $3, '<p>Test event description long enough.</p>', (select id from public.categories limit 1), 'Test Venue',
            (select id from public.cities where slug = 'osogbo'), now() + make_interval(days => $4), now() + make_interval(days => $4) + interval '5 hours',
            $5, 'published', 'approved', now(), (select user_id from public.memberships where organization_id = $1 and role = 'owner' limit 1), $6::public.event_visibility
     returning id`,
    [org, slug, opts.title ?? `Test ${slug}`, opts.startsInDays ?? 10, opts.capacity, visibility],
  );
  const types: string[] = [];
  for (const [i, t] of opts.tickets.entries()) {
    const [{ id: tid }] = await admin<{ id: string }>(
      `insert into public.ticket_types (event_id, organization_id, name, kind, price_minor, quantity_total, admissions_per_unit, max_per_order, visibility, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        id,
        org,
        t.name ?? `Type ${i}`,
        t.kind ?? (t.price === 0 ? "free" : "regular"),
        t.price,
        t.qty,
        t.apu ?? 1,
        t.max ?? 20,
        t.visibility ?? "public",
        i,
      ],
    );
    types.push(tid);
  }
  return { eventId: id, slug, types, org };
}

export interface OrderResult {
  order_id: string;
  public_ref: string;
  status: string;
  total_minor: number;
}

export async function checkout(
  eventId: string,
  items: { tt: string; qty: number; code?: string }[],
  opts: {
    email?: string;
    userId?: string | null;
    promo?: string;
    referral?: { link_id: string; clicked_at: string };
    key?: string;
  } = {},
) {
  const [row] = await as<{ r: OrderResult }>(
    service,
    `select public.checkout_create_order(p_event => $1, p_items => $2, p_buyer => $3, p_idempotency_key => $4, p_promo_code => $5, p_referral => $6) r`,
    [
      eventId,
      JSON.stringify(
        items.map((i) => ({ ticket_type_id: i.tt, quantity: i.qty, access_code: i.code })),
      ),
      JSON.stringify({
        name: "Test Buyer",
        email: opts.email ?? `buyer-${randomUUID().slice(0, 8)}@example.com`,
        user_id: opts.userId ?? "",
      }),
      opts.key ?? `test-${randomUUID()}`,
      opts.promo ?? null,
      opts.referral ? JSON.stringify(opts.referral) : null,
    ],
  );
  return row!.r;
}

/** Create a test payment attempt and confirm it as the provider would report. */
export async function pay(
  orderId: string,
  overrides: { amount?: number; currency?: string; env?: string; status?: string } = {},
) {
  const ref = `ref_${randomUUID().slice(0, 12)}`;
  const [{ a }] = await as<{ a: { amount_minor: number } }>(
    service,
    `select to_jsonb(public.payment_attempt_create($1, 'test', 'test', $2)) a`,
    [orderId, ref],
  );
  const [{ r }] = await as<{ r: { outcome: string; order_status: string } }>(
    service,
    `select public.payment_confirm($1, $2, $3, $4, $5, 0, $6, 'card') r`,
    [
      ref,
      overrides.status ?? "success",
      overrides.amount ?? a.amount_minor,
      overrides.currency ?? "NGN",
      `tx_${ref}`,
      overrides.env ?? "test",
    ],
  );
  return { ref, ...r };
}

export async function confirm(ref: string, amount: number) {
  const [{ r }] = await as<{ r: { outcome: string } }>(
    service,
    `select public.payment_confirm($1, 'success', $2, 'NGN', $3, 0, 'test', 'card') r`,
    [ref, amount, `tx_${ref}`],
  );
  return r;
}

export async function balance(code: string, filter: { org?: string; user?: string } = {}) {
  const [{ b }] = await admin<{ b: string }>(
    `select coalesce(sum(balance_minor), 0) b from private.ledger_balances where code = $1
       and ($2::uuid is null or organization_id = $2) and ($3::uuid is null or user_id = $3)`,
    [code, filter.org ?? null, filter.user ?? null],
  );
  return Number(b);
}

export async function unbalancedTransactions() {
  const rows = await admin<{ n: string }>(
    `select count(*) n from (select transaction_id from public.ledger_entries group by transaction_id, currency having sum(debit_minor) <> sum(credit_minor)) x`,
  );
  return Number(rows[0]!.n);
}
