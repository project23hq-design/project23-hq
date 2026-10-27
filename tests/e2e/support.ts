import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import pg from "pg";
import { expect, type Page } from "@playwright/test";

export const env: Record<string, string> = Object.fromEntries(
  readFileSync(path.resolve("apps/web/.env.local"), "utf8")
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m![1]!, m![2]!.replace(/^"|"$/g, "")]),
);
export const PASSWORD = "Project23-local-only!";
export const db = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  max: 4,
});
export const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows as T[];

/** Mirrors packages/domain ticketQrToken (the token is never shown as text in the UI). */
export const qrToken = (ticketId: string, version: number) =>
  `P23T.${createHmac("sha256", env.TICKET_QR_SECRET!).update(`ticket:${ticketId}:${version}`).digest("base64url").slice(0, 32)}`;

export const signWebhook = (body: string) =>
  createHmac("sha512", env.TEST_PROVIDER_SECRET!).update(body).digest("hex");

/** Drain the outbox (several ticks) like the scheduler would. */
export async function runWorker(page: Page) {
  let last: { claimed: number } = { claimed: 0 };
  for (let i = 0; i < 15; i++) {
    const res = await page.request.post("/api/jobs/tick", {
      headers: { Authorization: `Bearer ${env.JOB_RUNNER_SECRET}` },
    });
    expect(res.ok()).toBeTruthy();
    last = await res.json();
    if (last.claimed === 0) break;
  }
  return last;
}

export function capturedEmails(to: string) {
  const dir = path.resolve(".mail-capture");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
          to: string;
          subject: string;
          html: string;
          attachments: { filename: string }[];
        },
    )
    .filter((m) => m.to === to);
}

export async function signIn(page: Page, email: string, password = PASSWORD, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

export async function buyTickets(
  page: Page,
  slug: string,
  ticketName: string,
  qty: number,
  buyer: { name: string; email: string },
) {
  await page.goto(`/events/${slug}`);
  for (let i = 0; i < qty; i++)
    await page.getByRole("button", { name: `Add one ${ticketName}`, exact: true }).click();
  const cta = page.getByRole("button", { name: /^(Continue|Get free tickets)/ });
  await expect(cta).toBeEnabled();
  await cta.click();
  await page.getByLabel("Full name").fill(buyer.name);
  await page.getByLabel("Email").fill(buyer.email);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Continue to payment|Confirm free order/ }).click();
  await page.waitForURL(/\/checkout\//);
  return page.url().split("/checkout/")[1]!.split("?")[0]!;
}
