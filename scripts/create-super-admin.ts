/**
 * LOCAL/STAGING provisioning of a platform super-admin.
 *   pnpm admin:create --email admin@project23.test [--role super_admin|support|finance_admin]
 *
 * - Refuses non-local Supabase URLs unless --allow-remote is passed explicitly.
 * - Prints a one-time random password; the admin must enrol TOTP MFA at /account/security
 *   before /super-admin becomes accessible (the database requires an aal2 session).
 * - There is no API, signup field or profile flag that grants platform roles.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = "apps/web/.env.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
}
const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const email = arg("email")?.toLowerCase();
const role = (arg("role") ?? "super_admin") as "super_admin" | "support" | "finance_admin";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: pnpm admin:create --email you@example.com [--role super_admin]");
  process.exit(1);
}
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!local && !process.argv.includes("--allow-remote")) {
  console.error(
    `Refusing to provision an admin on non-local ${url}. Pass --allow-remote deliberately (staging only).`,
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const password = randomBytes(18).toString("base64url");
let userId: string | undefined;
const { data: created, error } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Platform Admin" },
});
if (error) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (!userId) {
    console.error(error.message);
    process.exit(1);
  }
  console.info("User already exists; granting role only (password unchanged).");
} else {
  userId = created.user.id;
}
const { error: rErr } = await db
  .from("platform_role_assignments")
  .upsert({ user_id: userId, role, revoked_at: null });
if (rErr) {
  console.error(rErr.message);
  process.exit(1);
}
await db.from("audit_logs").insert({
  actor_kind: "system",
  action: "platform_role.grant",
  entity_type: "user",
  entity_id: userId,
  reason: "provisioned via scripts/create-super-admin.ts",
  metadata: { role },
});
console.info(`\n✔ ${role} granted to ${email}`);
if (!error)
  console.info(
    `  One-time password: ${password}\n  Sign in, then enrol an authenticator app at /account/security before opening /super-admin.`,
  );
