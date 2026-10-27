import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  ORGS,
  USERS,
  admin,
  anon,
  as,
  checkout,
  createEvent,
  expectError,
  pay,
  pool,
  service,
  user,
} from "./helpers";

afterAll(() => pool.end());

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("row level security and privilege boundaries", () => {
  it("publishes a complete draft immediately, refuses incomplete ones and outsiders", async () => {
    const slug = `pub-${randomUUID().slice(0, 10)}`;
    const [{ id }] = await admin<{ id: string }>(
      `insert into public.events (organization_id, slug, title, description_html, category_id, venue_name, city_id, starts_at, ends_at, capacity, created_by, visibility)
       select $1, $2, 'Publish test', '<p>Long enough description for publishing.</p>', (select id from public.categories limit 1),
              'Test Venue', (select id from public.cities where slug = 'osogbo'), now() + interval '9 days', now() + interval '9 days 4 hours',
              50, $3, 'unlisted' returning id`,
      [ORGS.osc, slug, USERS.organizer],
    );
    await expectError(
      as(user(USERS.organizer), "select public.event_publish($1)", [id]),
      /event_incomplete/,
    );
    await admin(
      `insert into public.ticket_types (event_id, organization_id, name, kind, price_minor, quantity_total)
       values ($1, $2, 'GA', 'regular', 100000, 10)`,
      [id, ORGS.osc],
    );
    await expectError(
      as(user(USERS.customer), "select public.event_publish($1)", [id]),
      /forbidden/,
    );
    await as(user(USERS.organizer), "select public.event_publish($1)", [id]);
    const [ev] = await admin<{ status: string; moderation_status: string }>(
      "select status, moderation_status from events where id = $1",
      [id],
    );
    expect(ev).toEqual({ status: "published", moderation_status: "approved" });
    const pub = await as(anon, "select slug from public_events where slug = $1", [slug]);
    expect(pub).toHaveLength(1);
  });

  it("approves a new organization immediately but never lets it verify itself", async () => {
    const owner = randomUUID();
    await admin(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}', '{}', now(), now())`,
      [owner, `neworg-${owner.slice(0, 6)}@example.com`],
    );
    const slug = `new-org-${owner.slice(0, 8)}`;
    await as(user(owner), "select public.create_organization($1, $2)", ["New Org", slug]);
    const [org] = await admin<{ approval_status: string; verification_status: string }>(
      "select approval_status, verification_status from organizations where slug = $1",
      [slug],
    );
    expect(org).toEqual({ approval_status: "approved", verification_status: "unverified" });
    await expectError(
      as(
        user(owner),
        "insert into organizations (slug, name, verification_status, created_by) values ($1, 'X', 'verified', $2)",
        [`${slug}-2`, owner],
      ),
      /platform-controlled|permission denied/,
    );
  });

  it("hides base tables from anonymous visitors but exposes the safe public projection", async () => {
    await expectError(as(anon, "select * from events limit 1"), /permission denied/);
    await expectError(as(anon, "select * from orders limit 1"), /permission denied/);
    const rows = await as<{ slug: string }>(
      anon,
      "select slug from public_events where visibility = 'public' limit 5",
    );
    expect(rows.length).toBeGreaterThan(0);
    // private columns never appear in the projection
    const cols = await admin<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'public_events'",
    );
    const names = cols.map((c) => c.column_name);
    for (const c of [
      "internal_notes",
      "online_access_instructions",
      "admissions_sold",
      "moderation_notes",
      "created_by",
    ])
      expect(names).not.toContain(c);
    // drafts never appear publicly
    const hidden = await as(anon, "select 1 from public_events where slug = 'ilesa-open-mic'");
    expect(hidden).toHaveLength(0);
  });

  it("prevents customers from reading other buyers' orders and tickets", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    const mine = await checkout(eventId, [{ tt: types[0]!, qty: 1 }], {
      userId: USERS.customer,
      email: "customer@project23.test",
    });
    const theirs = await checkout(eventId, [{ tt: types[0]!, qty: 1 }], {
      email: "someone.else@example.com",
    });
    await pay(mine.order_id);
    await pay(theirs.order_id);
    const visible = await as<{ id: string }>(
      user(USERS.customer),
      "select id from orders where id = any($1)",
      [[mine.order_id, theirs.order_id]],
    );
    expect(visible.map((v) => v.id)).toEqual([mine.order_id]);
    const tickets = await as(user(USERS.customer), "select id from tickets where order_id = $1", [
      theirs.order_id,
    ]);
    expect(tickets).toHaveLength(0);
    await expectError(
      as(user(USERS.customer), "select qr_hash from tickets limit 1"),
      /permission denied/,
    );
  });

  it("denies cross-organization reads and writes", async () => {
    const { eventId } = await createEvent({
      org: ORGS.osc,
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    // campus owner is not a member of OSC
    expect(
      await as(user(USERS.campus), "select id from events where id = $1", [eventId]),
    ).toHaveLength(0);
    expect(
      await as(user(USERS.campus), "select id from orders where event_id = $1", [eventId]),
    ).toHaveLength(0);
    const upd = await as(
      user(USERS.campus),
      "update events set title = 'hijacked' where id = $1 returning id",
      [eventId],
    );
    expect(upd).toHaveLength(0);
    // spoofing organization_id on insert
    await expectError(
      as(
        user(USERS.campus),
        `insert into events (organization_id, slug, title, starts_at, ends_at, capacity, created_by)
      values ($1, $2, 'Spoof', now() + interval '1 day', now() + interval '2 day', 10, $3)`,
        [ORGS.osc, `spoof-${randomUUID().slice(0, 6)}`, USERS.campus],
      ),
      /row-level security/,
    );
    await expectError(
      as(
        user(USERS.campus),
        "insert into ticket_types (event_id, organization_id, name, price_minor, quantity_total) values ($1, $2, 'x', 1, 1)",
        [eventId, ORGS.osc],
      ),
      /row-level security/,
    );
  });

  it("limits scanners to admission data for assigned events", async () => {
    expect(await as(user(USERS.scanner), "select id from orders limit 5")).toHaveLength(0);
    expect(await as(user(USERS.scanner), "select id from tickets limit 5")).toHaveLength(0);
    expect(await as(user(USERS.scanner), "select id from payout_recipients limit 5")).toHaveLength(
      0,
    );
    const { eventId } = await createEvent({ capacity: 10, tickets: [{ price: 100_000, qty: 10 }] });
    await expectError(
      as(user(USERS.scanner), "select public.gate_check_in($1, 'x', 'd')", [eventId]),
      "forbidden",
    );
  });

  it("keeps finance members away from bank changes and attendee lists", async () => {
    await expectError(
      as(
        user(USERS.finance, { recentAuth: true }),
        "select public.payout_recipient_set('organization', $1, '058', 'GTBank', '0123456789', 'X')",
        [ORGS.osc],
      ),
      "forbidden",
    );
    expect(await as(user(USERS.finance), "select id from tickets limit 1")).toHaveLength(0);
    const orders = await as(
      user(USERS.finance),
      "select id from orders where organization_id = $1 limit 1",
      [ORGS.osc],
    );
    expect(orders.length).toBe(1); // finance can see orders for their org
  });

  it("blocks direct mutation of engine-controlled and financial data", async () => {
    await expectError(
      as(
        user(USERS.organizer),
        "update events set admissions_sold = 0 where organization_id = $1",
        [ORGS.osc],
      ),
      /engine-controlled/,
    );
    await expectError(
      as(user(USERS.organizer), "update events set is_featured = true where organization_id = $1", [
        ORGS.osc,
      ]),
      /engine-controlled/,
    );
    await expectError(
      as(
        user(USERS.organizer),
        "update organizations set is_first_party = true, verification_status = 'verified' where id = $1",
        [ORGS.osc],
      ),
      /platform-controlled|permission denied/,
    );
    await expectError(
      as(user(USERS.organizer), "update orders set total_minor = 1"),
      /permission denied/,
    );
    await expectError(
      as(
        user(USERS.organizer),
        "insert into ledger_entries (transaction_id, account_id, currency, debit_minor) values (gen_random_uuid(), gen_random_uuid(), 'NGN', 1)",
      ),
      /permission denied/,
    );
    await expectError(
      as(
        user(USERS.organizer),
        "update ticket_types set units_sold = 0 where organization_id = $1",
        [ORGS.osc],
      ),
      /engine-controlled/,
    );
    await expectError(
      admin(
        "update ledger_entries set debit_minor = debit_minor + 1 where id = (select min(id) from ledger_entries)",
      ),
      /append-only/,
    );
    await expectError(
      admin("delete from audit_logs where id = (select min(id) from audit_logs)"),
      /append-only/,
    );
  });

  it("prevents self-promotion to platform admin and requires MFA for admin power", async () => {
    await expectError(
      as(
        user(USERS.organizer),
        "insert into platform_role_assignments (user_id, role) values ($1, 'super_admin')",
        [USERS.organizer],
      ),
      /permission denied/,
    );
    await expectError(
      as(user(USERS.organizer), "update auth.users set raw_app_meta_data = '{}'"),
      /permission denied/,
    );
    await admin(
      "insert into platform_role_assignments (user_id, role) values ($1, 'super_admin') on conflict (user_id, role) do update set revoked_at = null",
      [USERS.ops],
    );
    await expectError(
      as(
        user(USERS.ops, { aal: "aal1" }),
        "select public.admin_overview(now() - interval '1 day', now())",
      ),
      "forbidden",
    );
    const ok = await as(
      user(USERS.ops, { aal: "aal2" }),
      "select public.admin_overview(now() - interval '1 day', now()) o",
    );
    expect(ok).toHaveLength(1);
    await admin("update platform_role_assignments set revoked_at = now() where user_id = $1", [
      USERS.ops,
    ]);
    await expectError(
      as(
        user(USERS.ops, { aal: "aal2" }),
        "select public.admin_overview(now() - interval '1 day', now())",
      ),
      "forbidden",
    );
  });

  it("restricts privileged RPCs to the service role", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 100_000, qty: 10 }],
    });
    for (const a of [anon, user(USERS.customer), user(USERS.organizer)]) {
      await expectError(
        as(
          a,
          'select public.checkout_create_order($1, $2, \'{"name":"x y","email":"x@y.co"}\', \'abcdefghijklmnopqrstu\')',
          [eventId, JSON.stringify([{ ticket_type_id: types[0], quantity: 1 }])],
        ),
        /permission denied/,
      );
      await expectError(
        as(a, "select public.payment_confirm('r', 'success', 1, 'NGN', 't', 0, 'test')"),
        /permission denied/,
      );
      await expectError(as(a, "select public.jobs_claim('w', 1)"), /permission denied/);
      await expectError(as(a, "select public.release_matured_earnings(1)"), /permission denied/);
    }
  });

  it("lets anonymous visitors record a view but nothing else", async () => {
    const { eventId } = await createEvent({ capacity: 10, tickets: [{ price: 100_000, qty: 10 }] });
    await as(anon, "select public.record_event_view($1)", [eventId]);
    await expectError(as(anon, "select public.link_my_orders()"), /permission denied/);
  });

  it("only links guest orders to an account whose email is verified", async () => {
    const { eventId, types } = await createEvent({
      capacity: 10,
      tickets: [{ price: 0, qty: 10 }],
    });
    const email = `link-${randomUUID().slice(0, 6)}@example.com`;
    const uid = randomUUID();
    await admin(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', '{}', '{}', now(), now())`,
      [uid, email],
    );
    const o = await checkout(eventId, [{ tt: types[0]!, qty: 1 }], { email });
    await as(user(uid), "select public.link_my_orders()");
    expect(await as(user(uid), "select id from orders where id = $1", [o.order_id])).toHaveLength(
      0,
    );
    await admin("update auth.users set email_confirmed_at = now() where id = $1", [uid]);
    await as(user(uid), "select public.link_my_orders()");
    expect(await as(user(uid), "select id from orders where id = $1", [o.order_id])).toHaveLength(
      1,
    );
  });

  it("validates invitations against the invited, verified email and protects the last owner", async () => {
    const token = `tok-${randomUUID()}`;
    await as(
      user(USERS.organizer),
      "select public.invite_member($1, 'campus@project23.test', 'manager', $2)",
      [ORGS.osc, sha(token)],
    );
    await expectError(
      as(user(USERS.customer), "select public.accept_invitation($1)", [sha(token)]),
      "invitation_wrong_account",
    );
    await as(user(USERS.campus), "select public.accept_invitation($1)", [sha(token)]);
    await expectError(
      as(user(USERS.campus), "select public.accept_invitation($1)", [sha(token)]),
      "invitation_invalid",
    );
    await expectError(
      as(user(USERS.campus), "select public.change_member_role($1, $2, 'owner')", [
        ORGS.osc,
        USERS.campus,
      ]),
      "forbidden",
    ); // managers can't change roles
    await expectError(
      as(user(USERS.organizer), "select public.remove_member($1, $2)", [ORGS.osc, USERS.organizer]),
      "last_owner",
    );
    await expectError(
      as(user(USERS.organizer), "select public.change_member_role($1, $2, 'manager')", [
        ORGS.osc,
        USERS.organizer,
      ]),
      "last_owner",
    );
    await as(user(USERS.organizer), "select public.remove_member($1, $2)", [
      ORGS.osc,
      USERS.campus,
    ]);
  });

  it("requires recent re-authentication for bank changes", async () => {
    await expectError(
      as(
        user(USERS.organizer, { recentAuth: false }),
        "select public.payout_recipient_set('organization', $1, '058', 'GTBank', '0123456789', 'Osun Sound')",
        [ORGS.osc],
      ),
      "reauth_required",
    );
  });

  it("keeps account numbers out of client reach", async () => {
    await expectError(
      as(user(USERS.organizer), "select * from private.payout_recipient_secrets"),
      /permission denied/,
    );
    await expectError(
      as(user(USERS.organizer), "select public.payout_recipient_secret(gen_random_uuid())"),
      /permission denied/,
    );
  });
});

describe("gate admission", () => {
  async function paidTicket(eventOpts?: Parameters<typeof createEvent>[0]) {
    const ev = await createEvent(
      eventOpts ?? { capacity: 10, tickets: [{ price: 100_000, qty: 10 }] },
    );
    await admin(
      "insert into event_staff (event_id, organization_id, user_id) values ($1, $2, $3)",
      [ev.eventId, ev.org, USERS.scanner],
    );
    const o = await checkout(ev.eventId, [{ tt: ev.types[0]!, qty: 1 }]);
    await pay(o.order_id);
    const [t] = await admin<{ id: string }>("select id from tickets where order_id = $1", [
      o.order_id,
    ]);
    const token = `P23T.${randomUUID().replace(/-/g, "")}`;
    await as(service, "select public.tickets_set_qr_hashes($1)", [
      JSON.stringify([{ id: t!.id, version: 1, hash: sha(token) }]),
    ]);
    return { ...ev, orderId: o.order_id, ticketId: t!.id, hash: sha(token) };
  }

  it("admits a ticket exactly once when two scanners race", async () => {
    const t = await paidTicket();
    const results = await Promise.all([
      as<{ r: { result: string } }>(
        user(USERS.scanner),
        "select public.gate_check_in($1, $2, 'door-a') r",
        [t.eventId, t.hash],
      ),
      as<{ r: { result: string } }>(
        user(USERS.scanner),
        "select public.gate_check_in($1, $2, 'door-b') r",
        [t.eventId, t.hash],
      ),
      as<{ r: { result: string } }>(
        user(USERS.organizer),
        "select public.gate_check_in($1, $2, 'door-c') r",
        [t.eventId, t.hash],
      ),
    ]);
    const outcomes = results.map((r) => r[0]!.r.result).sort();
    expect(outcomes).toEqual(["admitted", "already_checked_in", "already_checked_in"]);
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from check_ins where ticket_id = $1",
      [t.ticketId],
    );
    expect(Number(n)).toBe(3); // every attempt is logged
  });

  it("rejects wrong-event, unknown, refunded and rotated tickets", async () => {
    const t = await paidTicket();
    const other = await createEvent({ capacity: 5, tickets: [{ price: 100_000, qty: 5 }] });
    await admin(
      "insert into event_staff (event_id, organization_id, user_id) values ($1, $2, $3)",
      [other.eventId, other.org, USERS.scanner],
    );
    const [w] = await as<{ r: Record<string, unknown> }>(
      user(USERS.scanner),
      "select public.gate_check_in($1, $2, 'd') r",
      [other.eventId, t.hash],
    );
    expect(w!.r).toEqual({ result: "wrong_event" }); // no details leak across events
    const [u] = await as<{ r: { result: string } }>(
      user(USERS.scanner),
      "select public.gate_check_in($1, 'deadbeef', 'd') r",
      [t.eventId],
    );
    expect(u!.r.result).toBe("invalid");

    await as(user(USERS.organizer), "select public.ticket_reissue($1, 'Shared screenshot')", [
      t.ticketId,
    ]);
    const [rot] = await as<{ r: { result: string } }>(
      user(USERS.scanner),
      "select public.gate_check_in($1, $2, 'd') r",
      [t.eventId, t.hash],
    );
    expect(rot!.r.result).toBe("invalid"); // old credential no longer works

    const t2 = await paidTicket();
    await as(
      user(USERS.organizer),
      "select public.refund_request_create($1, null, 'Customer request', false)",
      [t2.orderId],
    );
    const [rf] = await as<{ r: { result: string } }>(
      user(USERS.scanner),
      "select public.gate_check_in_ticket($1, $2, 'd') r",
      [t2.eventId, t2.ticketId],
    );
    expect(rf!.r.result).toBe("refunded");
  });

  it("requires a permission and a reason for re-entry overrides", async () => {
    const t = await paidTicket();
    await as(user(USERS.scanner), "select public.gate_check_in($1, $2, 'd')", [t.eventId, t.hash]);
    await expectError(
      as(user(USERS.scanner), "select public.gate_reentry($1, $2, 'smoke break', 'd')", [
        t.eventId,
        t.ticketId,
      ]),
      "forbidden",
    );
    await admin(
      "update event_staff set can_override_reentry = true where event_id = $1 and user_id = $2",
      [t.eventId, USERS.scanner],
    );
    await expectError(
      as(user(USERS.scanner), "select public.gate_reentry($1, $2, 'x', 'd')", [
        t.eventId,
        t.ticketId,
      ]),
      "reason_required",
    );
    const [r] = await as<{ r: { result: string; check_in_count: number } }>(
      user(USERS.scanner),
      "select public.gate_reentry($1, $2, 'Stepped out to car', 'd') r",
      [t.eventId, t.ticketId],
    );
    expect(r!.r).toMatchObject({ result: "reentry", check_in_count: 2 });
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from audit_logs where action = 'ticket.reentry_override' and entity_id = $1",
      [t.ticketId],
    );
    expect(Number(n)).toBe(1);
  });

  it("records door cash sales against the organizer, never as provider revenue", async () => {
    const ev = await createEvent({ capacity: 10, tickets: [{ price: 300_000, qty: 10 }] });
    await admin(
      "insert into event_staff (event_id, organization_id, user_id, can_door_sell) values ($1, $2, $3, true)",
      [ev.eventId, ev.org, USERS.scanner],
    );
    const [{ r }] = await as<{ r: { order_id: string; status: string } }>(
      user(USERS.scanner),
      'select public.door_sale($1, $2, \'{"name":"Walk In","email":"walkin@example.com"}\', \'cash\', $3) r',
      [ev.eventId, JSON.stringify([{ ticket_type_id: ev.types[0], quantity: 2 }]), randomUUID()],
    );
    expect(r.status).toBe("paid");
    const lines = await admin<{ code: string; debit_minor: string; credit_minor: string }>(
      `select a.code, e.debit_minor, e.credit_minor from ledger_entries e join ledger_accounts a on a.id = e.account_id join ledger_transactions t on t.id = e.transaction_id where t.order_id = $1`,
      [r.order_id],
    );
    expect(lines.map((l) => l.code).sort()).toEqual(["org_available", "platform_revenue"]);
    expect(lines.some((l) => l.code === "provider_clearing")).toBe(false);
    const [{ n }] = await admin<{ n: string }>(
      "select count(*) n from tickets where order_id = $1",
      [r.order_id],
    );
    expect(Number(n)).toBe(2);
  });

  it("requires a separate permission and reason for complimentary tickets, counted in capacity", async () => {
    const ev = await createEvent({
      capacity: 2,
      tickets: [{ price: 0, qty: 5, kind: "complimentary", visibility: "hidden" }],
    });
    await admin(
      "insert into event_staff (event_id, organization_id, user_id) values ($1, $2, $3)",
      [ev.eventId, ev.org, USERS.scanner],
    );
    await expectError(
      as(
        user(USERS.scanner),
        'select public.issue_complimentary($1, $2, 1, \'{"name":"VIP Guest","email":"g@example.com"}\', \'Artist guest\', $3)',
        [ev.eventId, ev.types[0], randomUUID()],
      ),
      "forbidden",
    );
    await as(
      user(USERS.organizer),
      'select public.issue_complimentary($1, $2, 2, \'{"name":"VIP Guest","email":"g@example.com"}\', \'Artist guests\', $3)',
      [ev.eventId, ev.types[0], randomUUID()],
    );
    await expectError(
      as(
        user(USERS.organizer),
        'select public.issue_complimentary($1, $2, 1, \'{"name":"VIP Guest","email":"g@example.com"}\', \'One more\', $3)',
        [ev.eventId, ev.types[0], randomUUID()],
      ),
      "event_sold_out",
    );
  });
});
