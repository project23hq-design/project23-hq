"use server";
import { revalidatePath } from "next/cache";
import {
  engineCode,
  engineErrorMessage,
  parseMoneyToMinor,
  zonedLocalToUtc,
} from "@project23/domain";
import { requirePlatformAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { deliverEmail } from "@/lib/email";
import { layout } from "@/lib/email/templates";
import { env } from "@/lib/env";
import type { ActionState } from "@/components/action-form";

const str = (f: FormData, k: string) =>
  typeof f.get(k) === "string" ? String(f.get(k)).trim() : "";
const done = (
  error: { message: string; code?: string } | null,
  ok: string,
  path: string,
): ActionState => {
  revalidatePath(path);
  return error ? { error: engineErrorMessage(engineCode(error), error.message) } : { message: ok };
};

export async function adminEventStatusAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("events.manage");
  const to = str(f, "status") === "published" ? "published" : "paused";
  const { error } = await supabase.rpc("event_set_status", {
    p_event: str(f, "eventId"),
    p_status: to,
    p_reason: "Platform admin action",
  });
  return done(error, to === "paused" ? "Event paused." : "Event resumed.", "/super-admin/events");
}

export async function featureEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("events.manage");
  const { error } = await supabase.rpc("admin_feature_event", {
    p_event: str(f, "eventId"),
    p_featured: str(f, "featured") === "true",
    p_rank: Number(str(f, "rank")) || undefined,
  });
  return done(error, "Placement updated.", "/super-admin/events");
}

export async function adminCancelEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("events.cancel");
  const { error } = await supabase.rpc("cancel_event", {
    p_event: str(f, "eventId"),
    p_reason: str(f, "reason"),
  });
  return done(error, "Event cancelled; refund batch created.", "/super-admin/events");
}

export async function updateOrgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("organizations.manage");
  const changes: Record<string, string> = {};
  for (const k of ["approval_status", "verification_status", "payout_status", "status"])
    if (str(f, k)) changes[k] = str(f, k);
  const { error } = await supabase.rpc("admin_update_organization", {
    p_org: str(f, "orgId"),
    p_changes: changes,
    p_reason: str(f, "reason"),
  });
  return done(error, "Organization updated.", "/super-admin/organizations");
}

export async function feePolicyAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("fees");
  const pct = (k: string) => Math.round(Number(str(f, k) || "0") * 100);
  const scope = str(f, "scope");
  const { error } = await supabase.rpc("admin_set_fee_policy", {
    p_scope: scope,
    p_org: (str(f, "orgId") || null) as string,
    p_event: (str(f, "eventId") || null) as string,
    p_platform_fee_bps: pct("platformPercent"),
    p_platform_fixed_minor: parseMoneyToMinor(str(f, "platformFixed") || "0") ?? 0,
    p_buyer_fee_bps: pct("buyerPercent"),
    p_buyer_fixed_minor: parseMoneyToMinor(str(f, "buyerFixed") || "0") ?? 0,
    p_refundable: str(f, "refundable") !== "false",
    p_effective_from: str(f, "effectiveLocal")
      ? zonedLocalToUtc(str(f, "effectiveLocal"), "Africa/Lagos")
      : new Date().toISOString(),
    p_note: str(f, "note"),
  });
  return done(
    error,
    "Fee policy version created. Existing orders keep their snapshotted fees.",
    "/super-admin/fees",
  );
}

export async function payoutDecisionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("finance");
  const { error } = await supabase.rpc("payout_transition", {
    p_payout: str(f, "payoutId"),
    p_to: str(f, "to") as "approved" | "rejected" | "paid" | "failed" | "reversed" | "processing",
    p_note: str(f, "note") || undefined,
    p_external_ref: str(f, "externalRef") || undefined,
  });
  return done(error, "Payout updated.", "/super-admin/finance");
}

export async function refundDecisionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("finance");
  const op = str(f, "op");
  const { error } =
    op === "retry"
      ? await supabase.rpc("refund_retry", { p_refund: str(f, "refundId") })
      : await supabase.rpc("refund_review", {
          p_refund: str(f, "refundId"),
          p_approve: op === "approve",
          p_note: str(f, "note"),
        });
  return done(error, "Refund updated.", "/super-admin/finance");
}

export async function settlementAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("finance");
  const amount = parseMoneyToMinor(str(f, "amount"));
  if (!amount) return { error: "Enter the settled amount." };
  const { error } = await supabase.rpc("record_provider_settlement", {
    p_amount_minor: amount,
    p_reference: str(f, "reference"),
    p_note: str(f, "note"),
  });
  return done(error, "Settlement recorded.", "/super-admin/finance");
}

export async function retryJobAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("jobs");
  const { error } = await supabase.rpc("admin_retry_job", { p_job: Number(str(f, "jobId")) });
  return done(error, "Job re-queued.", "/super-admin/jobs");
}

export async function settingAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("settings");
  let value: unknown;
  try {
    value = JSON.parse(str(f, "value"));
  } catch {
    return { error: 'Value must be valid JSON (numbers as 10, text as "text").' };
  }
  const { error } = await supabase.rpc("admin_set_setting", {
    p_key: str(f, "key"),
    p_value: value as never,
    p_reason: str(f, "reason"),
  });
  return done(error, "Setting saved.", "/super-admin/settings");
}

export async function reportAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, user } = await requirePlatformAdmin("reports");
  const { error } = await supabase
    .from("reports")
    .update({
      status: str(f, "status"),
      resolution: str(f, "resolution"),
      handled_by: user.id,
      handled_at: new Date().toISOString(),
    })
    .eq("id", str(f, "reportId"));
  return done(error, "Report updated.", "/super-admin/reports");
}

export async function promoterOversightAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("reports");
  const { error } = await supabase.rpc("promoter_decide", {
    p_enrollment: str(f, "enrollmentId"),
    p_status: str(f, "status"),
    p_reason: str(f, "reason"),
  });
  return done(error, "Enrollment updated.", "/super-admin/reports");
}

export async function saveCategoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("categories");
  const { error } = await supabase.rpc("admin_save_category", {
    p_id: (str(f, "categoryId") || null) as string,
    p_name: str(f, "name"),
    p_sort_order: Number(str(f, "sortOrder")) || 100,
  });
  return done(error, "Category saved.", "/super-admin/categories");
}

export async function deleteCategoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("categories");
  const { error } = await supabase.rpc("admin_delete_category", { p_id: str(f, "categoryId") });
  return done(error, "Category deleted.", "/super-admin/categories");
}

// ------------------------------------------------------------------ users & staff
const USER_ACTIONS = [
  "sign_out",
  "ban",
  "unban",
  "password_reset",
  "resend_verification",
  "confirm_email",
] as const;
type UserAction = (typeof USER_ACTIONS)[number];

/**
 * Account support. The database authorizes the action, ends sessions where needed and writes
 * the audit entry; the Auth admin API then applies the change or we email the user a link.
 */
export async function userAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("users.support");
  const userId = str(f, "userId");
  const action = str(f, "action") as UserAction;
  if (!USER_ACTIONS.includes(action)) return { error: engineErrorMessage("invalid_value") };
  const { data, error } = await supabase.rpc("admin_user_action", {
    p_user: userId,
    p_action: action,
    p_reason: str(f, "reason"),
  });
  if (error) return done(error, "", `/super-admin/users/${userId}`);
  const { email, sessions_ended } = data as { email: string; sessions_ended: number };
  const auth = adminClient().auth.admin;
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  let apiError: { message: string } | null = null;
  let message = "";
  switch (action) {
    case "sign_out":
      message = `Signed out of ${sessions_ended} session${sessions_ended === 1 ? "" : "s"}.`;
      break;
    case "ban":
      apiError = (await auth.updateUserById(userId, { ban_duration: "876000h" })).error;
      message = `Account banned and signed out of ${sessions_ended} session${sessions_ended === 1 ? "" : "s"}.`;
      break;
    case "unban":
      apiError = (await auth.updateUserById(userId, { ban_duration: "none" })).error;
      message = "Ban lifted.";
      break;
    case "confirm_email":
      apiError = (await auth.updateUserById(userId, { email_confirm: true })).error;
      message = "Email marked as verified.";
      break;
    case "password_reset":
    case "resend_verification": {
      const reset = action === "password_reset";
      const link = await auth.generateLink({ type: reset ? "recovery" : "magiclink", email });
      const tokenHash = link.data.properties?.hashed_token;
      apiError = link.error ?? (tokenHash ? null : { message: "no link was generated" });
      if (tokenHash) {
        const url = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${reset ? "recovery" : "magiclink"}&next=${reset ? "/reset-password" : "/account"}`;
        await deliverEmail(`admin-${action}:${userId}:${Date.now()}`, `admin_${action}`, {
          to: email,
          subject: reset ? "Reset your Project23 password" : "Verify your Project23 email",
          html: layout({
            preheader: reset ? "Choose a new password" : "Confirm your email address",
            title: reset ? "Reset your password" : "Verify your email address",
            body: reset
              ? "<p>Our support team sent you this link to choose a new password. It works once and expires soon. If you didn't ask for this, you can ignore this email.</p>"
              : "<p>Our support team sent you this link to verify your email address and sign in. It works once and expires soon.</p>",
            cta: { label: reset ? "Choose a new password" : "Verify email", url },
          }),
          text: `${reset ? "Choose a new password" : "Verify your email"}: ${url}`,
        });
        message = reset
          ? `Password reset link sent to ${email}.`
          : `Verification link sent to ${email}.`;
      }
      break;
    }
  }
  revalidatePath(`/super-admin/users/${userId}`);
  if (apiError)
    return {
      error: `The request was recorded, but the auth service refused it: ${apiError.message}`,
    };
  return { message };
}

export async function staffRoleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin("staff");
  const role = str(f, "role");
  if (!["super_admin", "finance_admin", "support"].includes(role))
    return { error: engineErrorMessage("invalid_value") };
  const grant = str(f, "grant") === "true";
  const { error } = await supabase.rpc("admin_set_staff_role", {
    p_email: str(f, "email"),
    p_role: role as "super_admin" | "finance_admin" | "support",
    p_grant: grant,
    p_reason: str(f, "reason"),
  });
  return done(
    error,
    grant
      ? "Role granted. They can open the admin area the next time they sign in."
      : "Role revoked.",
    "/super-admin/staff",
  );
}

export type AdminSearchResults = {
  users: { id: string; email: string; full_name: string | null }[];
  orders: {
    id: string;
    public_ref: string;
    buyer_email: string;
    status: string;
    total_minor: number;
  }[];
  events: { id: string; title: string; slug: string; status: string; starts_at: string }[];
  organizations: { id: string; name: string; slug: string; status: string }[];
};

export async function adminSearchAction(q: string): Promise<AdminSearchResults | null> {
  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase.rpc("admin_search", { p_q: q.slice(0, 100) });
  if (error) return null;
  return data as AdminSearchResults;
}
