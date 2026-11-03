/**
 * DEPLOY-TIME provisioning of the Project23 super-admin(s). Run by
 * .github/workflows/deploy-database.yml after migrations, on every push to main.
 *
 *   SUPER_ADMIN_EMAIL=you@project23.ng[,second@project23.ng] pnpm admin:provision
 *
 * - The emails live only in a GitHub Actions secret; the service role key never leaves CI.
 * - A missing account is created with a random password that is never shown or stored.
 *   The owner sets their own password with "Forgot password?" on /sign-in, then must enrol
 *   an authenticator app at /account/security before /super-admin opens (aal2 required).
 * - Idempotent: existing accounts and passwords are left alone; the role is only granted
 *   (and audited) when it isn't already active. Nothing is ever revoked here.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emails = (process.env.SUPER_ADMIN_EMAIL ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (!emails.length) {
  console.info("SUPER_ADMIN_EMAIL is not set; skipping super-admin provisioning.");
  process.exit(0);
}
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
for (const email of emails) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`Not an email address: ${email}`);
    process.exit(1);
  }
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Creates the account if needed; returns its id. Never lists users or touches passwords. */
async function ensureUser(email: string) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: "Project23 Admin" },
  });
  if (!error) {
    console.info(`Created account for ${email}. Set its password via "Forgot password?".`);
    return data.user.id;
  }
  if (error.code !== "email_exists") throw error;
  // Generating (not sending) a link is the admin API's lookup-by-email.
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  return link.user.id;
}

for (const email of emails) {
  const userId = await ensureUser(email);

  const { data: active, error: readErr } = await db
    .from("platform_role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (readErr) throw readErr;
  if (active) {
    console.info(`${email} is already a super_admin.`);
    continue;
  }

  const { error: grantErr } = await db
    .from("platform_role_assignments")
    .upsert({
      user_id: userId,
      role: "super_admin",
      revoked_at: null,
      granted_at: new Date().toISOString(),
    });
  if (grantErr) throw grantErr;
  await db.from("audit_logs").insert({
    actor_kind: "system",
    action: "platform_role.grant",
    entity_type: "user",
    entity_id: userId,
    reason: "provisioned on deploy (SUPER_ADMIN_EMAIL)",
    metadata: { role: "super_admin" },
  });
  console.info(`Granted super_admin to ${email}.`);
}
