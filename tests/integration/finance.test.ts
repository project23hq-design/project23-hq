import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ORGS, USERS, admin, as, balance, checkout, createEvent, expectError, pay, pool, service, unbalancedTransactions, user } from "./helpers";

afterAll(() => pool.end());

/** Fresh organizer with an owner, approved & payout-eligible, so balances are isolated per test. */
async function freshOrg() {
  const owner = randomUUID();
  const email = `owner-${owner.slice(0, 6)}@example.com`;
  await admin(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}', '{}', now(), now())`, [owner, email]);
  const [{ id }] = await admin<{ id: string }>(`insert into organizations (slug, name, approval_status, verification_status, payout_status, created_by)
    values ($1, 'Fresh Org', 'approved', 'verified', 'eligible', $2) returning id`, [`org-${owner.slice(0, 8)}`, owner]);
  await admin("insert into memberships (organization_id, user_id, role) values ($1, $2, 'owner')", [id, owner]);
  return { orgId: id, owner };
}

async function promoterEnrolled(eventId: string, ownerId: string, rateBps = 1000) {
  const pid = randomUUID();
  await admin(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}', '{}', now(), now())`, [pid, `promo-${pid.slice(0, 6)}@example.com`]);
  const [{ id: programId }] = await as<{ id: string }>(user(ownerId), "select public.referral_program_upsert($1, $2, null, 7, 'Commission on verified sales; refunds reverse commission.') id", [eventId, rateBps]);
  const [{ v }] = await admin<{ v: string }>("select current_version_id v from referral_programs where id = $1", [programId]);
  const [{ e }] = await as<{ e: string }>(user(pid), "select public.promoter_apply($1, $2, 'hi') e", [programId, v]);
  await as(user(ownerId), "select public.promoter_decide($1, 'approved')", [e]);
  const [{ id: linkId }] = await admin<{ id: string }>("select id from referral_links where enrollment_id = $1 and disabled_at is null", [e]);
  return { promoterId: pid, enrollmentId: e, linkId, programId };
}

const click = (linkId: string, agoMs = 60_000) => ({ link_id: linkId, clicked_at: new Date(Date.now() - agoMs).toISOString() });

describe("refunds", () => {
  it("partially refunds explicit units, voids the right tickets and reverses ledger entries", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 20, tickets: [{ price: 1_000_000, qty: 20 }] });
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 3 }]);
    await pay(o.order_id);
    const [item] = await admin<{ id: string }>("select id from order_items where order_id = $1", [o.order_id]);
    const [{ id: rr }] = await as<{ id: string }>(user(owner), "select public.refund_request_create($1, $2, 'Two guests cannot attend', false) id",
      [o.order_id, JSON.stringify([{ order_item_id: item!.id, units: 2 }])]);
    const [r] = await admin<{ status: string; amount_minor: string }>("select status, amount_minor from refund_requests where id = $1", [rr]);
    expect(r).toMatchObject({ status: "processing" });
    expect(Number(r!.amount_minor)).toBe(2_000_000);
    const tickets = await admin<{ status: string }>("select status from tickets where order_id = $1 order by unit_number", [o.order_id]);
    expect(tickets.map((t) => t.status)).toEqual(["refunded", "refunded", "valid"]);
    expect(await balance("org_pending", { org: orgId })).toBe(950_000); // 3 × 950k − 2 × 950k
    expect(await balance("refunds_payable")).toBeGreaterThanOrEqual(2_000_000);
    await as(service, "select public.refund_mark_result($1, 'processed', $2)", [rr, `rf_${rr}`]);
    await as(service, "select public.refund_mark_result($1, 'processed', $2)", [rr, `rf_${rr}`]); // replay is a no-op
    const [{ n }] = await admin<{ n: string }>("select count(*) n from ledger_transactions where refund_id = $1", [rr]);
    expect(Number(n)).toBe(2);
    const [ord] = await admin<{ status: string }>("select status from orders where id = $1", [o.order_id]);
    expect(ord!.status).toBe("partially_refunded");
    expect(await unbalancedTransactions()).toBe(0);
  });

  it("puts buyer requests through review, excludes used tickets and respects the event policy", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 10, tickets: [{ price: 500_000, qty: 10 }], startsInDays: 30 });
    await admin("update events set refund_policy = 'until_7d' where id = $1", [ev.eventId]);
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 2 }], { userId: USERS.customer, email: "customer@project23.test" });
    await pay(o.order_id);
    const [t] = await admin<{ id: string }>("select id from tickets where order_id = $1 order by unit_number limit 1", [o.order_id]);
    await as(user(owner), "select public.gate_check_in_ticket($1, $2, 'd')", [ev.eventId, t!.id]);
    const [{ id: rr }] = await as<{ id: string }>(user(USERS.customer), "select public.refund_request_create($1, null, 'Change of plans', false) id", [o.order_id]);
    const [r] = await admin<{ status: string; amount_minor: string }>("select status, amount_minor from refund_requests where id = $1", [rr]);
    expect(r!.status).toBe("requested");
    expect(Number(r!.amount_minor)).toBe(500_000); // only the unused ticket
    await expectError(as(user(USERS.customer), "select public.refund_review($1, true, 'self-approve')", [rr]), "forbidden");
    await as(user(owner), "select public.refund_review($1, true, 'ok')", [rr]);
    const statuses = await admin<{ status: string }>("select status from tickets where order_id = $1 order by unit_number", [o.order_id]);
    expect(statuses.map((s) => s.status)).toEqual(["valid", "refunded"]);
    await admin("update events set refund_policy = 'no_refunds' where id = $1", [ev.eventId]);
    await expectError(as(user(USERS.customer), "select public.refund_request_create($1, null, 'again', false)", [o.order_id]), /refund_policy_disallows|nothing_to_refund/);
  });

  it("cancels an event into a tracked refund batch covering every paid order", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 20, tickets: [{ price: 200_000, qty: 20 }] });
    const orders = [];
    for (let i = 0; i < 3; i++) { const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 2 }]); await pay(o.order_id); orders.push(o); }
    const pending = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }]);
    await as(user(owner), "select public.cancel_event($1, 'Severe weather warning')", [ev.eventId]);
    const [{ n }] = await admin<{ n: string }>("select count(*) n from refund_requests where order_id = any($1) and status = 'processing' and batch_id is not null", [orders.map((o) => o.order_id)]);
    expect(Number(n)).toBe(3);
    const [p] = await admin<{ status: string }>("select status from orders where id = $1", [pending.order_id]);
    expect(p!.status).toBe("cancelled");
    expect(await balance("org_pending", { org: orgId })).toBe(0);
    await expectError(checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }]), "event_not_on_sale");
  });
});

describe("payouts", () => {
  async function availableBalance(orgId: string, owner: string, amount: number) {
    const ev = await createEvent({ org: orgId, capacity: 100, tickets: [{ price: amount, qty: 100 }] });
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }]);
    await pay(o.order_id);
    await admin("update earnings_allocations set matures_at = now() - interval '1 minute' where order_id = $1", [o.order_id]);
    await as(service, "select public.release_matured_earnings()");
    const [{ id: rec }] = await as<{ id: string }>(user(owner, { recentAuth: true }), "select public.payout_recipient_set('organization', $1, '058', 'GTBank', '0123456789', 'Fresh Org') id", [orgId]);
    await as(service, "select public.payout_recipient_mark_verified($1, 'RCP_test', 'FRESH ORG')", [rec]);
    return ev;
  }

  it("lets only one of several concurrent withdrawals spend the same balance", async () => {
    const { orgId, owner } = await freshOrg();
    await availableBalance(orgId, owner, 2_000_000); // net 1,900,000 available
    expect(await balance("org_available", { org: orgId })).toBe(1_900_000);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () =>
      as(user(owner, { recentAuth: true }), "select public.payout_request('organization', $1, 1500000, $2)", [orgId, randomUUID()])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance("org_available", { org: orgId })).toBe(400_000);
    expect(await balance("org_payout_locked", { org: orgId })).toBe(1_500_000);
  });

  it("is idempotent per request key and requires recent authentication", async () => {
    const { orgId, owner } = await freshOrg();
    await availableBalance(orgId, owner, 2_000_000);
    await expectError(as(user(owner, { recentAuth: false }), "select public.payout_request('organization', $1, 600000, $2)", [orgId, randomUUID()]), "reauth_required");
    const key = randomUUID();
    const [a] = await as<{ id: string }>(user(owner, { recentAuth: true }), "select public.payout_request('organization', $1, 600000, $2) id", [orgId, key]);
    const [b] = await as<{ id: string }>(user(owner, { recentAuth: true }), "select public.payout_request('organization', $1, 600000, $2) id", [orgId, key]);
    expect(a!.id).toBe(b!.id);
    expect(await balance("org_payout_locked", { org: orgId })).toBe(600_000);
  });

  it("returns funds on failure, books paid transfers, and restores them on reversal", async () => {
    const { orgId, owner } = await freshOrg();
    await availableBalance(orgId, owner, 2_000_000);
    await admin("insert into platform_role_assignments (user_id, role) values ($1, 'finance_admin') on conflict (user_id, role) do update set revoked_at = null", [USERS.ops]);
    const fin = user(USERS.ops, { aal: "aal2" });
    const [{ id: p1 }] = await as<{ id: string }>(user(owner, { recentAuth: true }), "select public.payout_request('organization', $1, 1000000, $2) id", [orgId, randomUUID()]);
    await expectError(as(user(owner), "select public.payout_transition($1, 'approved')", [p1]), "forbidden");
    await as(fin, "select public.payout_transition($1, 'approved')", [p1]);
    await as(fin, "select public.payout_transition($1, 'failed', 'Bank rejected')", [p1]);
    expect(await balance("org_available", { org: orgId })).toBe(1_900_000);
    const [{ id: p2 }] = await as<{ id: string }>(user(owner, { recentAuth: true }), "select public.payout_request('organization', $1, 1000000, $2) id", [orgId, randomUUID()]);
    await admin("update payout_requests set settlement_method = 'manual_bank' where id = $1", [p2]);
    await as(fin, "select public.payout_transition($1, 'approved')", [p2]);
    await expectError(as(fin, "select public.payout_transition($1, 'paid')", [p2]), /external_reference_required/);
    await as(fin, "select public.payout_transition($1, 'paid', null, 'NIP-123')", [p2]);
    await expectError(as(fin, "select public.payout_transition($1, 'paid', null, 'NIP-123')", [p2]), "invalid_transition");
    expect(await balance("org_available", { org: orgId })).toBe(900_000);
    await as(fin, "select public.payout_transition($1, 'reversed', 'Returned by bank')", [p2]);
    expect(await balance("org_available", { org: orgId })).toBe(1_900_000);
    expect(await unbalancedTransactions()).toBe(0);
    await admin("update platform_role_assignments set revoked_at = now() where user_id = $1", [USERS.ops]);
  });

  it("refuses withdrawals above the available (not gross) balance", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 10, tickets: [{ price: 5_000_000, qty: 10 }] });
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }]);
    await pay(o.order_id); // pending only (event hasn't ended)
    const [{ id: rec }] = await as<{ id: string }>(user(owner, { recentAuth: true }), "select public.payout_recipient_set('organization', $1, '058', 'GTBank', '0123456789', 'Fresh') id", [orgId]);
    await as(service, "select public.payout_recipient_mark_verified($1, 'RCP', 'FRESH')", [rec]);
    await expectError(as(user(owner, { recentAuth: true }), "select public.payout_request('organization', $1, 1000000, $2)", [orgId, randomUUID()]), "insufficient_available_balance");
  });
});

describe("referral programs and promoter earnings", () => {
  it("accrues exactly one commission on verified fulfilment (10% after the 5% platform fee)", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 10, tickets: [{ price: 1_000_000, qty: 10 }] });
    const p = await promoterEnrolled(ev.eventId, owner);
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 2 }], { referral: click(p.linkId) });
    expect(await balance("promoter_pending", { user: p.promoterId })).toBe(0); // nothing before payment
    const [{ a }] = await as<{ a: { reference: string; amount_minor: number } }>(service, "select to_jsonb(public.payment_attempt_create($1, 'test', 'test', $2)) a", [o.order_id, `ref_${randomUUID().slice(0, 8)}`]);
    await Promise.all(Array.from({ length: 4 }, () => as(service, "select public.payment_confirm($1, 'success', $2, 'NGN', 'tx_' || $1, 0, 'test')", [a.reference, a.amount_minor])));
    const [ord] = await admin<{ total_minor: string; platform_fee_minor: string; promoter_commission_minor: string; organizer_net_minor: string }>(
      "select total_minor, platform_fee_minor, promoter_commission_minor, organizer_net_minor from orders where id = $1", [o.order_id]);
    expect(Object.values(ord!).map(Number)).toEqual([2_000_000, 100_000, 200_000, 1_700_000]);
    expect(await balance("promoter_pending", { user: p.promoterId })).toBe(200_000);
    expect(await balance("org_pending", { org: orgId })).toBe(1_700_000);
    const [{ n }] = await admin<{ n: string }>("select count(*) n from earnings_allocations where order_id = $1 and beneficiary_kind = 'promoter'", [o.order_id]);
    expect(Number(n)).toBe(1);
  });

  it("scopes attribution to the event, the window and eligible enrollments", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 50, tickets: [{ price: 100_000, qty: 50 }] });
    const other = await createEvent({ org: orgId, capacity: 50, tickets: [{ price: 100_000, qty: 50 }] });
    const p = await promoterEnrolled(ev.eventId, owner);
    const attributed = async (orderId: string) => (await admin("select 1 from order_attributions where order_id = $1", [orderId])).length === 1;
    expect(await attributed((await checkout(other.eventId, [{ tt: other.types[0]!, qty: 1 }], { referral: click(p.linkId) })).order_id)).toBe(false); // wrong event
    expect(await attributed((await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: click(p.linkId, 8 * 86_400_000) })).order_id)).toBe(false); // expired
    expect(await attributed((await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: { link_id: randomUUID(), clicked_at: new Date().toISOString() } })).order_id)).toBe(false); // forged
    expect(await attributed((await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: click(p.linkId, -3_600_000) })).order_id)).toBe(false); // future-dated
    expect(await attributed((await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: click(p.linkId) })).order_id)).toBe(true);
    await as(user(owner), "select public.promoter_decide($1, 'suspended', 'Spam')", [p.enrollmentId]);
    expect(await attributed((await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: click(p.linkId) })).order_id)).toBe(false); // suspended
  });

  it("blocks self-referral by buyer identity and organizer membership", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 10, tickets: [{ price: 100_000, qty: 10 }] });
    const p = await promoterEnrolled(ev.eventId, owner);
    const [{ email }] = await admin<{ email: string }>("select email from auth.users where id = $1", [p.promoterId]);
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: click(p.linkId), email });
    expect(await admin("select 1 from order_attributions where order_id = $1", [o.order_id])).toHaveLength(0);
    const [{ n }] = await admin<{ n: string }>("select count(*) n from referral_flags where enrollment_id = $1 and kind = 'self_referral_blocked'", [p.enrollmentId]);
    expect(Number(n)).toBe(1);
    const [{ v }] = await admin<{ v: string }>("select current_version_id v from referral_programs where id = $1", [p.programId]);
    await expectError(as(user(owner), "select public.promoter_apply($1, $2)", [p.programId, v]), "self_referral_not_allowed");
  });

  it("uses the discounted base, ignores free tickets, and snapshots the rate", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 20, tickets: [{ price: 1_000_000, qty: 10 }, { price: 0, qty: 10 }] });
    await admin("insert into promotions (organization_id, event_id, code, discount_type, percent_bps) values ($1, $2, 'HALF', 'percent', 5000)", [orgId, ev.eventId]);
    const p = await promoterEnrolled(ev.eventId, owner);
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }, { tt: ev.types[1]!, qty: 2 }], { referral: click(p.linkId), promo: "HALF" });
    await pay(o.order_id);
    await as(user(owner), "select public.referral_program_upsert($1, 2500, null, 7, 'New higher rate terms for future sales only.')", [ev.eventId]);
    const [ord] = await admin<{ promoter_commission_minor: string }>("select promoter_commission_minor from orders where id = $1", [o.order_id]);
    expect(Number(ord!.promoter_commission_minor)).toBe(50_000); // 10% of 500,000 discounted base
    const [att] = await admin<{ rate_bps: number }>("select rate_bps from order_attributions where order_id = $1", [o.order_id]);
    expect(att!.rate_bps).toBe(1000);
  });

  it("releases matured earnings exactly once and offsets post-payout recovery", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 20, tickets: [{ price: 1_000_000, qty: 20 }] });
    const p = await promoterEnrolled(ev.eventId, owner);
    const o1 = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 2 }], { referral: click(p.linkId) });
    await pay(o1.order_id);
    await admin("update earnings_allocations set matures_at = now() - interval '1 minute' where order_id = $1", [o1.order_id]);
    await Promise.all([as(service, "select public.release_matured_earnings()"), as(service, "select public.release_matured_earnings()")]);
    expect(await balance("promoter_available", { user: p.promoterId })).toBe(200_000);
    expect(await balance("promoter_pending", { user: p.promoterId })).toBe(0);

    // promoter withdraws and is paid
    const [{ id: rec }] = await as<{ id: string }>(user(p.promoterId, { recentAuth: true }), "select public.payout_recipient_set('promoter', null, '058', 'GTBank', '0123456789', 'Promoter') id");
    await as(service, "select public.payout_recipient_mark_verified($1, 'RCP', 'PROMOTER')", [rec]);
    const [{ id: po }] = await as<{ id: string }>(user(p.promoterId, { recentAuth: true }), "select public.payout_request('promoter', null, 200000, $1) id", [randomUUID()]);
    await as(service, "select public.payout_transition($1, 'approved')", [po]);
    await as(service, "select public.payout_transition($1, 'paid', null, 'TRF')", [po]);
    expect(await balance("promoter_available", { user: p.promoterId })).toBe(0);

    // full refund after payout -> explicit recovery balance, never a negative available balance
    await as(user(owner), "select public.refund_request_create($1, null, 'Refund after payout', true)", [o1.order_id]);
    expect(await balance("promoter_available", { user: p.promoterId })).toBe(0);
    expect(await balance("promoter_recovery", { user: p.promoterId })).toBe(200_000);
    await expectError(as(user(p.promoterId, { recentAuth: true }), "select public.payout_request('promoter', null, 200000, $1)", [randomUUID()]), /recovery_outstanding|insufficient/);

    // a later commission first repays the recovery balance
    const o2 = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 3 }], { referral: click(p.linkId) });
    await pay(o2.order_id);
    await admin("update earnings_allocations set matures_at = now() - interval '1 minute' where order_id = $1", [o2.order_id]);
    await as(service, "select public.release_matured_earnings()");
    expect(await balance("promoter_recovery", { user: p.promoterId })).toBe(0);
    expect(await balance("promoter_available", { user: p.promoterId })).toBe(100_000); // 300k − 200k recovered
    const [{ n }] = await admin<{ n: string }>("select count(*) n from payout_requests where user_id = $1 and status = 'paid'", [p.promoterId]);
    expect(Number(n)).toBe(1);
    expect(await unbalancedTransactions()).toBe(0);
  });

  it("reverses pending commission proportionally on partial refund", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 20, tickets: [{ price: 1_000_000, qty: 20 }] });
    const p = await promoterEnrolled(ev.eventId, owner);
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 4 }], { referral: click(p.linkId) });
    await pay(o.order_id);
    const [item] = await admin<{ id: string }>("select id from order_items where order_id = $1", [o.order_id]);
    await as(user(owner), "select public.refund_request_create($1, $2, 'One guest', false)", [o.order_id, JSON.stringify([{ order_item_id: item!.id, units: 1 }])]);
    expect(await balance("promoter_pending", { user: p.promoterId })).toBe(300_000);
    expect(await balance("org_pending", { org: orgId })).toBe(2_550_000);
  });

  it("keeps promoter balances separate from organization balances and buyer identities private", async () => {
    const { orgId, owner } = await freshOrg();
    const ev = await createEvent({ org: orgId, capacity: 20, tickets: [{ price: 1_000_000, qty: 20 }] });
    const p = await promoterEnrolled(ev.eventId, owner);
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }], { referral: click(p.linkId), email: "private.buyer@example.com" });
    await pay(o.order_id);
    expect(await as(user(p.promoterId), "select id from orders where id = $1", [o.order_id])).toHaveLength(0);
    expect(await as(user(p.promoterId), "select * from order_attributions")).toHaveLength(0);
    const [{ d }] = await as<{ d: unknown }>(user(p.promoterId), "select public.promoter_dashboard() d");
    expect(JSON.stringify(d)).not.toContain("private.buyer@example.com");
    expect(JSON.stringify(d)).not.toContain(o.order_id);
    expect(await as(user(p.promoterId), "select id from events where id = $1", [ev.eventId])).toHaveLength(0); // no organizer access
    const other = await as(user(p.promoterId), "select id from earnings_allocations where promoter_user_id <> $1", [p.promoterId]);
    expect(other).toHaveLength(0);
  });
});

describe("durable jobs", () => {
  it("never hands the same job to two workers and deduplicates email intents", async () => {
    for (let i = 0; i < 10; i++) await as(service, "select public.jobs_enqueue('ops.alert', '{}', $1)", [`test-claim-${randomUUID()}`]);
    const claims = await Promise.all(Array.from({ length: 5 }, (_, i) => as<{ id: number }>(service, "select id from public.jobs_claim($1, 50)", [`w${i}`])));
    const ids = claims.flat().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const key = `email-${randomUUID()}`;
    const [{ i1 }] = await as<{ i1: { id: string; should_send: boolean } }>(service, "select public.email_intent($1, 't', 'a@example.com', 's') i1", [key]);
    await as(service, "select public.email_mark($1, 'sent', 'capture', 'm1')", [i1.id]);
    const [{ i2 }] = await as<{ i2: { id: string; should_send: boolean } }>(service, "select public.email_intent($1, 't', 'a@example.com', 's') i2", [key]);
    expect(i2).toEqual({ id: i1.id, should_send: false });
    for (const id of ids) await as(service, "select public.jobs_complete($1)", [id]);
  });

  it("backs off failed jobs and dead-letters them after max attempts", async () => {
    const key = `test-fail-${randomUUID()}`;
    await as(service, "select public.jobs_enqueue('ops.alert', '{}', $1)", [key]);
    await admin("update outbox_jobs set max_attempts = 2 where dedupe_key = $1", [key]);
    for (let i = 0; i < 2; i++) {
      await admin("update outbox_jobs set run_after = now() - interval '1 second' where dedupe_key = $1", [key]);
      const rows = await as<{ id: number; dedupe_key: string }>(service, "select id, dedupe_key from public.jobs_claim('w', 100)");
      const mine = rows.find((r) => r.dedupe_key === key)!;
      await as(service, "select public.jobs_fail($1, 'boom')", [mine.id]);
      for (const r of rows.filter((r) => r.dedupe_key !== key)) await as(service, "select public.jobs_complete($1)", [r.id]);
    }
    const [j] = await admin<{ status: string }>("select status from outbox_jobs where dedupe_key = $1", [key]);
    expect(j!.status).toBe("dead");
  });
});

it("keeps every ledger transaction balanced", async () => {
  expect(await unbalancedTransactions()).toBe(0);
  void ORGS;
});
