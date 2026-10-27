import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { q, signIn, signWebhook } from "./support";

test.describe("access control at the application boundary", () => {
  test("private areas require sign-in and the right role", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount/);
    await signIn(page, "customer@project23.test");
    await page.goto("/super-admin");
    await expect(page).toHaveURL(/denied=admin/);
    await page.goto("/organizer/osun-sound-collective/finance");
    await expect(page).toHaveURL(/\/organizer$/);
    const [{ id }] = await q<{ id: string }>("select id from orders where buyer_email <> 'customer@project23.test' and status = 'paid' limit 1");
    expect((await page.goto(`/checkout/${id}`))!.status()).toBe(404);
    expect((await page.request.get(`/api/orders/${id}/tickets.pdf`)).status()).toBe(404);
  });

  test("open redirects are refused after sign-in", async ({ page }) => {
    await signIn(page, "customer@project23.test", undefined, "//evil.example.com");
    expect(new URL(page.url()).host).toBe("localhost:3000");
  });

  test("referral links resolve server-side to internal event pages only", async ({ page }) => {
    const res = await page.goto("/r/bisi-osogbo");
    expect(new URL(page.url()).pathname).toBe("/events/osogbo-afrobeats-night");
    expect(res!.status()).toBe(200);
    await page.goto("/r/not-a-real-code");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByText(/promoter link/)).toHaveCount(0);
  });

  test("job runner rejects unauthenticated calls", async ({ request }) => {
    expect((await request.post("/api/jobs/tick")).status()).toBe(401);
    expect((await request.post("/api/jobs/tick", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  });
});

test.describe("payment webhook", () => {
  async function pendingAttempt() {
    const [{ r }] = await q<{ r: { order_id: string; total_minor: number } }>(`
      select set_config('request.jwt.claims', '{"role":"service_role"}', true),
        public.checkout_create_order(p_event => '30000000-0000-4000-8000-000000000008',
          p_items => '[{"ticket_type_id":"40000000-0000-4000-8000-000000000071","quantity":1}]',
          p_buyer => '{"name":"Webhook Buyer","email":"webhook.buyer@example.com"}', p_idempotency_key => $1) r`, [`e2e-wh-${randomUUID()}`]);
    const ref = `WH_${randomUUID().slice(0, 10)}`;
    await q("select public.payment_attempt_create($1, 'test', 'test', $2)", [r.order_id, ref]);
    await q("select public.test_provider_upsert($1, $2, 'NGN', 'webhook.buyer@example.com', 'success')", [ref, r.total_minor]);
    return { orderId: r.order_id, ref };
  }

  test("rejects invalid signatures and malformed bodies", async ({ request }) => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    expect((await request.post("/api/webhooks/paystack", { data: body, headers: { "content-type": "application/json", "x-paystack-signature": "bad" } })).status()).toBe(401);
    expect((await request.post("/api/webhooks/paystack", { data: body, headers: { "content-type": "application/json" } })).status()).toBe(401);
    const malformed = "{not json";
    expect((await request.post("/api/webhooks/paystack", { data: Buffer.from(malformed), headers: { "content-type": "application/json", "x-paystack-signature": signWebhook(malformed) } })).status()).toBe(400);
  });

  test("fulfils from a signed webhook and treats replays as duplicates", async ({ request }) => {
    const { orderId, ref } = await pendingAttempt();
    // The body claims an absurd amount: fulfilment uses the provider verify result, not webhook fields.
    const body = JSON.stringify({ event: "charge.success", data: { reference: ref, amount: 1, status: "success" } });
    const headers = { "content-type": "application/json", "x-paystack-signature": signWebhook(body) };
    const first = await request.post("/api/webhooks/paystack", { data: body, headers });
    expect(first.status()).toBe(200);
    expect((await first.json()).outcome).toBe("fulfilled");
    const replay = await request.post("/api/webhooks/paystack", { data: body, headers });
    expect(await replay.json()).toMatchObject({ duplicate: true });
    const [{ n }] = await q<{ n: string }>("select count(*) n from tickets where order_id = $1", [orderId]);
    expect(Number(n)).toBe(1);
  });

  test("a forged success redirect does not mark an order paid", async ({ page }) => {
    const [{ r }] = await q<{ r: { order_id: string } }>(`
      select set_config('request.jwt.claims', '{"role":"service_role"}', true),
        public.checkout_create_order(p_event => '30000000-0000-4000-8000-000000000008',
          p_items => '[{"ticket_type_id":"40000000-0000-4000-8000-000000000071","quantity":1}]',
          p_buyer => '{"name":"Forger","email":"forger@example.com"}', p_idempotency_key => $1) r`, [`e2e-forge-${randomUUID()}`]);
    await page.goto(`/checkout/return?orderId=${r.order_id}&reference=does-not-exist&status=success`);
    const [{ status }] = await q<{ status: string }>("select status from orders where id = $1", [r.order_id]);
    expect(status).toBe("pending_payment");
  });
});
