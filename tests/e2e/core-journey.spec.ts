import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { generateSync } from "otplib";
import { buyTickets, capturedEmails, q, qrToken, runWorker, signIn } from "./support";

/**
 * Core acceptance journey (spec §15): a third-party organizer creates an event with Early
 * Bird and Regular tickets and publishes it (no review queue); a platform admin with MFA can
 * pause and resume it; a guest discovers it and buys
 * two admissions; receives two unique tickets by email and retrieves them securely; assigned
 * staff check each ticket in once; the organizer sees correct sales and net proceeds.
 */
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 6);
const title = `Osogbo Jazz Picnic ${run}`;
const slug = `osogbo-jazz-picnic-${run}`;
const buyerEmail = `guest-${run}@example.com`;
const adminEmail = `admin-${run}@project23.test`;
const adminPassword = `Adm1n-${run}-local-only`;
let eventId = "";
let orderId = "";

test("organizer creates an event with Early Bird and Regular tickets and publishes it", async ({
  page,
}) => {
  await signIn(
    page,
    "organizer@project23.test",
    undefined,
    "/organizer/osun-sound-collective/events/new",
  );
  await page.goto("/organizer/osun-sound-collective/events/new");
  // One-page create (reference-style): title, dates, details, first ticket, then "Create Event".
  await page.getByLabel("Event title").fill(title);
  await expect(page.getByLabel("Event URL")).toHaveValue(slug);
  const d = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel("Start").fill(`${d}T15:00`);
  await page.getByLabel("End").fill(`${d}T21:00`);
  await page.getByRole("button", { name: "Add Description" }).click();
  await page
    .getByLabel("Description")
    .fill("An afternoon of live jazz on the grass with food vendors. Bring a mat!");
  await page.getByLabel("Category").selectOption({ label: "Music" });
  await page.getByLabel("Venue name").fill("Riverside Lawn (fictional)");
  await page.getByLabel("City", { exact: true }).selectOption({ label: "Osogbo" });
  await page.getByLabel("Capacity (people)").fill("100");
  await page.getByLabel("Ticket name").fill("Early Bird");
  await page.getByLabel("Price (₦)").fill("5000");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Create Event" }).click();
  await page.waitForURL(/tab=publish/);
  eventId = page.url().split("/events/")[1]!.split("?")[0]!;

  await page.goto(`/organizer/osun-sound-collective/events/${eventId}?tab=tickets`);
  const add = async (
    name: string,
    kind: string,
    price: string,
    qty: string,
    opensAfter?: string,
  ) => {
    const form = page.locator("form", {
      has: page.getByRole("button", { name: "Add ticket type" }),
    });
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("Type").selectOption(kind);
    await form.getByLabel("Price (₦)").fill(price);
    await form.getByLabel("Units available").fill(qty);
    if (opensAfter) await form.getByLabel("Opens after").selectOption({ label: opensAfter });
    await form.getByRole("button", { name: "Add ticket type" }).click();
    await expect(page.getByText("Ticket type added.")).toBeVisible();
  };
  await add("Regular", "regular", "8000", "50", "Early Bird");

  await page.goto(`/organizer/osun-sound-collective/events/${eventId}?tab=staff`);
  const kemi = page.getByRole("row", { name: /scanner@project23\.test/ });
  await kemi.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Staff updated.")).toBeVisible();

  await page.goto(`/organizer/osun-sound-collective/events/${eventId}?tab=publish`);
  // a draft is never public
  expect((await page.request.get(`/events/${slug}`)).status()).toBe(404);
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page.getByText("Your event is live", { exact: true })).toBeVisible();
  expect((await page.request.get(`/events/${slug}`)).status()).toBe(200);
});

test("a platform admin with MFA can take the event down and restore it", async ({ page }) => {
  const [{ id }] = await q<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '') returning id`,
    [adminEmail, adminPassword],
  );
  await q(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at) values (gen_random_uuid(), $1::uuid, $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now())`,
    [id, adminEmail],
  );
  await q("insert into platform_role_assignments (user_id, role) values ($1, 'super_admin')", [id]);

  await signIn(page, adminEmail, adminPassword, "/super-admin");
  await page.goto("/super-admin");
  await expect(page).toHaveURL(/account\/security\?mfa=required/); // role alone is not enough
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = (await page.getByText(/Manual key:/).textContent())!
    .replace("Manual key:", "")
    .replace(/\s+/g, "");
  await page.getByLabel("6-digit code").fill(generateSync({ secret }));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/super-admin"));
  await page.goto(`/super-admin/events?q=${encodeURIComponent(title)}`);
  const row = page.getByRole("row", { name: new RegExp(title) });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(row.getByText("Event paused.")).toBeVisible();
  await page.goto(`/events/${slug}`);
  await expect(page.getByRole("button", { name: /Buy tickets/ })).toHaveCount(0); // off sale
  await page.goto(`/super-admin/events?q=${encodeURIComponent(title)}`);
  await page
    .getByRole("row", { name: new RegExp(title) })
    .getByRole("button", { name: "Resume" })
    .click();
  await expect(page.getByText("Event resumed.")).toBeVisible();
});

test("a guest discovers the event, buys two Early Bird tickets and gets two unique tickets", async ({
  page,
}) => {
  await page.goto(`/explore?q=${encodeURIComponent("Jazz Picnic")}`);
  await page
    .getByRole("link", { name: new RegExp(title) })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  orderId = await buyTickets(page, slug, "Early Bird", 2, {
    name: "Guest Buyer",
    email: buyerEmail,
  });
  await expect(page.getByText(/Tickets held for/)).toBeVisible();
  await page.getByRole("button", { name: /Pay ₦10,000 securely/ }).click();
  await expect(page.getByRole("heading", { name: "Test payment" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();
  const refs = await page.locator("p.font-mono").allTextContents();
  expect(new Set(refs.filter((r) => r.startsWith("T-"))).size).toBe(2);
  // Early Bird sold out -> Regular opens (dependency evaluated server-side)
  await page.goto(`/events/${slug}`);
  await expect(page.getByRole("button", { name: "Buy tickets from ₦8,000" })).toBeVisible();
  await page.getByRole("button", { name: "Buy tickets from ₦8,000" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Add one Regular", exact: true }),
  ).toBeVisible();
});

test("tickets are emailed once and can be retrieved securely without an account", async ({
  page,
  browser,
}) => {
  await runWorker(page);
  const mails = capturedEmails(buyerEmail).filter((m) => m.subject.includes(title));
  expect(mails).toHaveLength(1);
  expect(mails[0]!.attachments[0]!.filename).toMatch(/\.pdf$/);
  await runWorker(page);
  expect(capturedEmails(buyerEmail).filter((m) => m.subject.includes(title))).toHaveLength(1); // no duplicate delivery

  // A different browser that only knows the order id gets nothing.
  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  expect((await sp.goto(`/checkout/${orderId}`))!.status()).toBe(404);
  expect((await sp.request.get(`/api/orders/${orderId}/tickets.pdf`)).status()).toBe(404);

  // Lookup by email always returns the same message; the emailed link grants access.
  await sp.goto("/orders/lookup");
  await sp.getByLabel("Email address").fill(buyerEmail);
  await sp.getByRole("button", { name: "Email me a link" }).click();
  await expect(sp.getByText(/If we have tickets for that email/)).toBeVisible();
  await sp.goto("/orders/lookup");
  await sp.getByLabel("Email address").fill(`nobody-${run}@example.com`);
  await sp.getByRole("button", { name: "Email me a link" }).click();
  await expect(sp.getByText(/If we have tickets for that email/)).toBeVisible();
  const link = /href="([^"]+\/orders\/access\/[^"]+)"/.exec(
    capturedEmails(buyerEmail).find((m) => m.subject.includes("tickets link"))!.html,
  )![1]!;
  await sp.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await sp.getByRole("link", { name: new RegExp(title) }).click();
  await expect(sp.getByText("Download all (PDF)")).toBeVisible();
  const pdf = await sp.request.get(`/api/orders/${orderId}/tickets.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await stranger.close();
});

test("assigned staff admit each ticket exactly once", async ({ page }) => {
  const tickets = await q<{ id: string; token_version: number }>(
    "select id, token_version from tickets where order_id = $1 order by unit_number",
    [orderId],
  );
  await signIn(page, "scanner@project23.test", undefined, "/gate");
  await page.goto("/gate");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  const input = page.getByPlaceholder(/Paste\/type QR code/);
  for (const t of tickets) {
    await input.fill(qrToken(t.id, t.token_version));
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Admit" })).toBeVisible();
  }
  await input.fill(qrToken(tickets[0]!.id, tickets[0]!.token_version));
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Already checked in" })).toBeVisible();
  await input.fill("P23T.forgedforgedforgedforgedforged12");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invalid ticket" })).toBeVisible();
  await expect(page.getByText(/^2$/).first()).toBeVisible();
});

test("the organizer sees correct sales and net proceeds", async ({ page }) => {
  await signIn(
    page,
    "organizer@project23.test",
    undefined,
    `/organizer/osun-sound-collective/events/${eventId}?tab=insights`,
  );
  await page.goto(`/organizer/osun-sound-collective/events/${eventId}?tab=insights`);
  const row = (label: string) =>
    page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd[1]");
  await expect(row("Ticket sales (before discounts)")).toHaveText("₦10,000");
  await expect(row("Project23 platform fee")).toHaveText("-₦500");
  await expect(row("Net proceeds (before refunds)")).toHaveText("₦9,500");
  await expect(
    page.getByText("Checked in", { exact: true }).locator("xpath=following-sibling::p[1]"),
  ).toHaveText("2 / 2");
});
