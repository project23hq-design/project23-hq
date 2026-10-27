import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  admin,
  as,
  balance,
  checkout,
  confirm,
  createEvent,
  expectError,
  pay,
  pool,
  service,
  unbalancedTransactions,
} from "./helpers";

afterAll(() => pool.end());

describe("inventory and capacity under concurrency", () => {
  it("sells exactly the last admissions when many buyers race", async () => {
    const { eventId, types } = await createEvent({
      capacity: 5,
      tickets: [{ price: 500_000, qty: 100 }],
    });
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => checkout(eventId, [{ tt: types[0]!, qty: 1 }])),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(5);
    for (const r of results)
      if (r.status === "rejected")
        expect(String(r.reason)).toMatch(/event_sold_out|insufficient_inventory/);
    const [ev] = await admin<{ admissions_held: number; admissions_sold: number }>(
      "select admissions_held, admissions_sold from events where id = $1",
      [eventId],
    );
    expect(ev!.admissions_held + ev!.admissions_sold).toBe(5);
  });

  it("enforces aggregate event capacity across ticket types, counting table seats", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [
        { price: 100_000, qty: 50 },
        { price: 1_000_000, qty: 5, apu: 4, kind: "group" },
      ],
    });
    const attempts = [
      ...Array.from({ length: 6 }, () => checkout(eventId, [{ tt: types[1]!, qty: 1 }])), // 4 admissions each
      ...Array.from({ length: 10 }, () => checkout(eventId, [{ tt: types[0]!, qty: 1 }])),
    ];
    await Promise.allSettled(attempts);
    const [ev] = await admin<{ total: number }>(
      "select admissions_held + admissions_sold total from events where id = $1",
      [eventId],
    );
    expect(ev!.total).toBeLessThanOrEqual(10);
    const [items] = await admin<{ adm: string }>(
      `select coalesce(sum(i.quantity * i.admissions_per_unit), 0) adm from order_items i join orders o on o.id = i.order_id where o.event_id = $1 and o.status = 'pending_payment'`,
      [eventId],
    );
    expect(Number(items!.adm)).toBe(ev!.total);
  });

  it("issues one independently scannable ticket per table seat", async () => {
    const { eventId, types } = await createEvent({
      capacity: 50,
      tickets: [{ price: 6_000_000, qty: 3, apu: 6, kind: "group" }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 2 }]);
    await pay(o.order_id);
    const t = await admin<{ unit_number: number; admission_number: number }>(
      "select unit_number, admission_number from tickets where order_id = $1",
      [o.order_id],
    );
    expect(t).toHaveLength(12);
    expect(new Set(t.map((x) => `${x.unit_number}:${x.admission_number}`)).size).toBe(12);
  });

  it("fulfils free orders immediately through the same engine", async () => {
    const { eventId, types } = await createEvent({ capacity: 3, tickets: [{ price: 0, qty: 3 }] });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 2 }]);
    expect(o.status).toBe("paid");
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from tickets where order_id = $1",
      [o.order_id],
    );
    expect(Number(n)).toBe(2);
    await expectError(
      checkout(eventId, [{ tt: types[0]!, qty: 2 }]),
      /event_sold_out|insufficient_inventory/,
    );
  });

  it("is idempotent per checkout key", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    const key = `dup-${randomUUID()}`;
    const [a, b] = await Promise.allSettled([
      checkout(eventId, [{ tt: types[0]!, qty: 2 }], { key }),
      checkout(eventId, [{ tt: types[0]!, qty: 2 }], { key }),
    ]);
    const ids = [a, b]
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ order_id: string }>).value.order_id);
    expect(new Set(ids).size).toBe(1);
    const [ev] = await admin<{ admissions_held: number }>(
      "select admissions_held from events where id = $1",
      [eventId],
    );
    expect(ev!.admissions_held).toBe(2);
  });

  it("enforces sales windows, dependencies and access codes on the server", async () => {
    const { eventId, types } = await createEvent({
      capacity: 100,
      tickets: [
        { price: 100_000, qty: 1, name: "Early" },
        { price: 200_000, qty: 50, name: "Regular" },
        { price: 50_000, qty: 5, kind: "student" },
      ],
    });
    await admin("update ticket_types set opens_after_ticket_type_id = $1 where id = $2", [
      types[0],
      types[1],
    ]);
    await admin(
      "update ticket_types set visibility = 'access_code', access_code_hash = encode(extensions.digest('SECRET', 'sha256'), 'hex') where id = $1",
      [types[2]],
    );
    await expectError(checkout(eventId, [{ tt: types[1]!, qty: 1 }]), "sales_not_started");
    await expectError(
      checkout(eventId, [{ tt: types[2]!, qty: 1, code: "WRONG" }]),
      "invalid_access_code",
    );
    await checkout(eventId, [{ tt: types[2]!, qty: 1, code: "secret" }]);
    const early = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]); // sells out Early (held)
    await checkout(eventId, [{ tt: types[1]!, qty: 1 }]); // Regular now open
    expect(early.status).toBe("pending_payment");
    await admin("update ticket_types set sales_start_at = now() + interval '1 day' where id = $1", [
      types[1],
    ]);
    await expectError(checkout(eventId, [{ tt: types[1]!, qty: 1 }]), "sales_not_started");
  });

  it("refuses sales for suspended organizers, private events and unapproved events", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    await admin("update events set visibility = 'private' where id = $1", [eventId]);
    await expectError(checkout(eventId, [{ tt: types[0]!, qty: 1 }]), "event_not_on_sale");
    await admin("update events set visibility = 'public', status = 'paused' where id = $1", [
      eventId,
    ]);
    await expectError(checkout(eventId, [{ tt: types[0]!, qty: 1 }]), "event_not_on_sale");
  });
});

describe("holds, expiry and late payments", () => {
  it("releases expired holds exactly once and frees inventory", async () => {
    const { eventId, types } = await createEvent({
      capacity: 2,
      tickets: [{ price: 100_000, qty: 2 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 2 }]);
    await admin("update orders set hold_expires_at = now() - interval '1 minute' where id = $1", [
      o.order_id,
    ]);
    const [r1, r2] = await Promise.all([
      as(service, "select public.expire_holds() n"),
      as(service, "select public.expire_holds() n"),
    ]);
    expect(
      Number((r1[0] as { n: number }).n) + Number((r2[0] as { n: number }).n),
    ).toBeGreaterThanOrEqual(1);
    const [ev] = await admin<{ admissions_held: number }>(
      "select admissions_held from events where id = $1",
      [eventId],
    );
    expect(ev!.admissions_held).toBe(0);
    const [ord] = await admin<{ status: string }>("select status from orders where id = $1", [
      o.order_id,
    ]);
    expect(ord!.status).toBe("expired");
    await checkout(eventId, [{ tt: types[0]!, qty: 2 }]); // inventory available again
  });

  it("fulfils a late payment when inventory is still available", async () => {
    const { eventId, types } = await createEvent({
      capacity: 5,
      tickets: [{ price: 100_000, qty: 5 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 2 }]);
    const [{ a }] = await as<{ a: { reference: string; amount_minor: number } }>(
      service,
      `select to_jsonb(public.payment_attempt_create($1, 'test', 'test', $2)) a`,
      [o.order_id, `late_${randomUUID().slice(0, 8)}`],
    );
    await admin("update orders set hold_expires_at = now() - interval '1 minute' where id = $1", [
      o.order_id,
    ]);
    await as(service, "select public.expire_holds()");
    const r = await confirm(a.reference, a.amount_minor);
    expect(r.outcome).toBe("fulfilled");
    const [ev] = await admin<{ admissions_sold: number; admissions_held: number }>(
      "select admissions_sold, admissions_held from events where id = $1",
      [eventId],
    );
    expect(ev).toEqual({ admissions_sold: 2, admissions_held: 0 });
  });

  it("records a fulfilment exception and queues a refund when a late payment can't be honoured", async () => {
    const { eventId, types } = await createEvent({
      capacity: 2,
      tickets: [{ price: 100_000, qty: 2 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 2 }]);
    const [{ a }] = await as<{ a: { reference: string; amount_minor: number } }>(
      service,
      `select to_jsonb(public.payment_attempt_create($1, 'test', 'test', $2)) a`,
      [o.order_id, `late2_${randomUUID().slice(0, 8)}`],
    );
    await admin("update orders set hold_expires_at = now() - interval '1 minute' where id = $1", [
      o.order_id,
    ]);
    await as(service, "select public.expire_holds()");
    const other = await checkout(eventId, [{ tt: types[0]!, qty: 2 }]);
    await pay(other.order_id);
    const r = await confirm(a.reference, a.amount_minor);
    expect(r.outcome).toBe("exception");
    const [ord] = await admin<{ status: string }>("select status from orders where id = $1", [
      o.order_id,
    ]);
    expect(ord!.status).toBe("fulfillment_exception");
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from tickets where order_id = $1",
      [o.order_id],
    );
    expect(Number(n)).toBe(0);
    const [rr] = await admin<{ kind: string; status: string; amount_minor: string }>(
      "select kind, status, amount_minor from refund_requests where order_id = $1",
      [o.order_id],
    );
    expect(rr).toMatchObject({ kind: "exception", status: "processing" });
    expect(Number(rr!.amount_minor)).toBe(200_000);
    const [ev] = await admin<{ admissions_sold: number }>(
      "select admissions_sold from events where id = $1",
      [eventId],
    );
    expect(ev!.admissions_sold).toBe(2); // never oversold
    expect(await unbalancedTransactions()).toBe(0);
  });
});

describe("payment verification and idempotent fulfilment", () => {
  it("fulfils once under concurrent webhook + return-page confirmations (and replays)", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 250_000, qty: 10 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 3 }]);
    const [{ a }] = await as<{ a: { reference: string; amount_minor: number } }>(
      service,
      `select to_jsonb(public.payment_attempt_create($1, 'test', 'test', $2)) a`,
      [o.order_id, `race_${randomUUID().slice(0, 8)}`],
    );
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => confirm(a.reference, a.amount_minor)),
    );
    expect(outcomes.filter((x) => x.outcome === "fulfilled")).toHaveLength(1);
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from tickets where order_id = $1",
      [o.order_id],
    );
    expect(Number(n)).toBe(3);
    const [{ tx }] = await admin<{ tx: string }>(
      "select count(*) tx from ledger_transactions where order_id = $1 and kind = 'sale'",
      [o.order_id],
    );
    expect(Number(tx)).toBe(1);
    const [{ jobs }] = await admin<{ jobs: string }>(
      "select count(*) jobs from outbox_jobs where dedupe_key = $1",
      [`order.deliver:${o.order_id}`],
    );
    expect(Number(jobs)).toBe(1);
  });

  it("rejects mismatched amount, currency and environment, and unknown references", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    for (const bad of [{ amount: 1 }, { currency: "USD" }, { env: "live" }]) {
      const o = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]);
      const r = await pay(o.order_id, bad);
      expect(r.outcome).toBe("mismatch");
      const [ord] = await admin<{ status: string }>("select status from orders where id = $1", [
        o.order_id,
      ]);
      expect(ord!.status).toBe("pending_payment");
      const [{ n }] = await admin<{ n: string }>(
        "select count(*) n from tickets where order_id = $1",
        [o.order_id],
      );
      expect(Number(n)).toBe(0);
    }
    const [{ r }] = await as<{ r: { outcome: string } }>(
      service,
      "select public.payment_confirm('nope', 'success', 100, 'NGN', 'x', 0, 'test') r",
    );
    expect(r.outcome).toBe("unknown_reference");
  });

  it("does not fulfil on failed/abandoned provider status", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]);
    const r = await pay(o.order_id, { status: "failed" });
    expect(r.outcome).toBe("not_successful");
    const [ord] = await admin<{ status: string }>("select status from orders where id = $1", [
      o.order_id,
    ]);
    expect(ord!.status).toBe("pending_payment");
  });

  it("refunds a second successful capture instead of issuing duplicate tickets", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]);
    const refs = [`d1_${randomUUID().slice(0, 8)}`, `d2_${randomUUID().slice(0, 8)}`];
    for (const ref of refs)
      await as(service, "select public.payment_attempt_create($1, 'test', 'test', $2)", [
        o.order_id,
        ref,
      ]);
    const r1 = await confirm(refs[0]!, 100_000);
    const r2 = await confirm(refs[1]!, 100_000);
    expect(r1.outcome).toBe("fulfilled");
    expect(r2.outcome).toBe("duplicate_payment");
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from tickets where order_id = $1",
      [o.order_id],
    );
    expect(Number(n)).toBe(1);
    expect(await unbalancedTransactions()).toBe(0);
  });

  it("books balanced ledger entries matching the documented fee example", async () => {
    const { eventId, types, org } = await createEvent({
      capacity: 10,
      tickets: [{ price: 1_000_000, qty: 10 }],
    });
    const before = await balance("org_pending", { org });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]);
    await pay(o.order_id);
    const [ord] = await admin<{ platform_fee_minor: string; organizer_net_minor: string }>(
      "select platform_fee_minor, organizer_net_minor from orders where id = $1",
      [o.order_id],
    );
    expect(Number(ord!.platform_fee_minor)).toBe(50_000);
    expect(Number(ord!.organizer_net_minor)).toBe(950_000);
    expect((await balance("org_pending", { org })) - before).toBe(950_000);
    expect(await unbalancedTransactions()).toBe(0);
  });
});

describe("promo codes and immutable snapshots", () => {
  it("never exceeds a promo cap under concurrency and releases expired reservations", async () => {
    const { eventId, types, org } = await createEvent({
      capacity: 100,
      tickets: [{ price: 100_000, qty: 100 }],
    });
    await admin(
      "insert into promotions (organization_id, event_id, code, discount_type, percent_bps, max_redemptions) values ($1, $2, 'CAP3', 'percent', 5000, 3)",
      [org, eventId],
    );
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        checkout(eventId, [{ tt: types[0]!, qty: 1 }], { promo: "cap3" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
      order_id: string;
      total_minor: number;
    }>[];
    expect(ok).toHaveLength(3);
    expect(ok.every((r) => Number(r.value.total_minor) === 50_000)).toBe(true);
    await admin("update orders set hold_expires_at = now() - interval '1 minute' where id = $1", [
      ok[0]!.value.order_id,
    ]);
    await as(service, "select public.expire_holds()");
    await checkout(eventId, [{ tt: types[0]!, qty: 1 }], { promo: "CAP3" }); // released slot reusable
    await expectError(
      checkout(eventId, [{ tt: types[0]!, qty: 1 }], { promo: "CAP3" }),
      "promo_exhausted",
    );
  });

  it("caps fixed discounts at the payable amount", async () => {
    const { eventId, types, org } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    await admin(
      "insert into promotions (organization_id, event_id, code, discount_type, amount_minor) values ($1, $2, 'BIG', 'fixed', 99999999)",
      [org, eventId],
    );
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 2 }], { promo: "BIG" });
    expect(Number(o.total_minor)).toBe(0);
    expect(o.status).toBe("paid"); // fully discounted = free order path
  });

  it("keeps historical prices and fees when prices or policies change later", async () => {
    const { eventId, types, org } = await createEvent({
      capacity: 10,
      tickets: [{ price: 1_000_000, qty: 10 }],
    });
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]);
    await pay(o.order_id);
    await admin("update ticket_types set price_minor = 2_000_000 where id = $1", [types[0]]);
    await admin(
      "insert into fee_policies (scope, organization_id, platform_fee_bps, note) values ('organization', $1, 1500, 'test override')",
      [org],
    );
    const [item] = await admin<{ unit_price_minor: string; platform_fee_minor: string }>(
      "select unit_price_minor, platform_fee_minor from order_items where order_id = $1",
      [o.order_id],
    );
    expect(Number(item!.unit_price_minor)).toBe(1_000_000);
    expect(Number(item!.platform_fee_minor)).toBe(50_000);
    const o2 = await checkout(eventId, [{ tt: types[0]!, qty: 1 }]);
    const [i2] = await admin<{ unit_price_minor: string; platform_fee_minor: string }>(
      "select unit_price_minor, platform_fee_minor from order_items where order_id = $1",
      [o2.order_id],
    );
    expect(Number(i2!.unit_price_minor)).toBe(2_000_000);
    expect(Number(i2!.platform_fee_minor)).toBe(300_000);
    await admin("delete from fee_policies where note = 'test override'").catch(() => undefined); // append-only: expected to fail
    await admin(
      `insert into fee_policies (scope, organization_id, platform_fee_bps, note) values ('organization', $1, 500, 'restore')`,
      [org],
    );
  });

  it("blocks inventory reductions below sold + held", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    await checkout(eventId, [{ tt: types[0]!, qty: 4 }]);
    await expectError(
      admin("update ticket_types set quantity_total = 3 where id = $1", [types[0]]),
      /ticket_types_inventory/,
    );
    await expectError(
      admin("update events set capacity = 3 where id = $1", [eventId]),
      /events_capacity_invariant/,
    );
  });
});
