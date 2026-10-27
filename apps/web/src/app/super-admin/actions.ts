"use server";
import { revalidatePath } from "next/cache";
import { engineCode, engineErrorMessage, parseMoneyToMinor, zonedLocalToUtc } from "@project23/domain";
import { requirePlatformAdmin } from "@/lib/auth";
import type { ActionState } from "@/components/action-form";

const str = (f: FormData, k: string) => (typeof f.get(k) === "string" ? String(f.get(k)).trim() : "");
const done = (error: { message: string; code?: string } | null, ok: string, path: string): ActionState => {
  revalidatePath(path);
  return error ? { error: engineErrorMessage(engineCode(error), error.message) } : { message: ok };
};

export async function moderateEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("admin_moderate_event", { p_event: str(f, "eventId"), p_decision: str(f, "decision"), p_notes: str(f, "notes") || undefined });
  return done(error, "Moderation decision recorded.", "/super-admin/events");
}

export async function featureEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("admin_feature_event", { p_event: str(f, "eventId"), p_featured: str(f, "featured") === "true", p_rank: Number(str(f, "rank")) || undefined });
  return done(error, "Placement updated.", "/super-admin/events");
}

export async function adminCancelEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("cancel_event", { p_event: str(f, "eventId"), p_reason: str(f, "reason") });
  return done(error, "Event cancelled; refund batch created.", "/super-admin/events");
}

export async function updateOrgAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const changes: Record<string, string> = {};
  for (const k of ["approval_status", "verification_status", "payout_status", "status"]) if (str(f, k)) changes[k] = str(f, k);
  const { error } = await supabase.rpc("admin_update_organization", { p_org: str(f, "orgId"), p_changes: changes, p_reason: str(f, "reason") });
  return done(error, "Organization updated.", "/super-admin/organizations");
}

export async function feePolicyAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const pct = (k: string) => Math.round(Number(str(f, k) || "0") * 100);
  const scope = str(f, "scope");
  const { error } = await supabase.rpc("admin_set_fee_policy", {
    p_scope: scope, p_org: (str(f, "orgId") || null) as string, p_event: (str(f, "eventId") || null) as string,
    p_platform_fee_bps: pct("platformPercent"), p_platform_fixed_minor: parseMoneyToMinor(str(f, "platformFixed") || "0") ?? 0,
    p_buyer_fee_bps: pct("buyerPercent"), p_buyer_fixed_minor: parseMoneyToMinor(str(f, "buyerFixed") || "0") ?? 0,
    p_refundable: str(f, "refundable") !== "false",
    p_effective_from: str(f, "effectiveLocal") ? zonedLocalToUtc(str(f, "effectiveLocal"), "Africa/Lagos") : new Date().toISOString(),
    p_note: str(f, "note"),
  });
  return done(error, "Fee policy version created. Existing orders keep their snapshotted fees.", "/super-admin/fees");
}

export async function payoutDecisionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("payout_transition", {
    p_payout: str(f, "payoutId"), p_to: str(f, "to") as "approved" | "rejected" | "paid" | "failed" | "reversed" | "processing",
    p_note: str(f, "note") || undefined, p_external_ref: str(f, "externalRef") || undefined,
  });
  return done(error, "Payout updated.", "/super-admin/finance");
}

export async function refundDecisionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const op = str(f, "op");
  const { error } = op === "retry"
    ? await supabase.rpc("refund_retry", { p_refund: str(f, "refundId") })
    : await supabase.rpc("refund_review", { p_refund: str(f, "refundId"), p_approve: op === "approve", p_note: str(f, "note") });
  return done(error, "Refund updated.", "/super-admin/finance");
}

export async function settlementAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const amount = parseMoneyToMinor(str(f, "amount"));
  if (!amount) return { error: "Enter the settled amount." };
  const { error } = await supabase.rpc("record_provider_settlement", { p_amount_minor: amount, p_reference: str(f, "reference"), p_note: str(f, "note") });
  return done(error, "Settlement recorded.", "/super-admin/finance");
}

export async function retryJobAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("admin_retry_job", { p_job: Number(str(f, "jobId")) });
  return done(error, "Job re-queued.", "/super-admin/jobs");
}

export async function settingAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  let value: unknown;
  try { value = JSON.parse(str(f, "value")); } catch { return { error: "Value must be valid JSON (numbers as 10, text as \"text\")." }; }
  const { error } = await supabase.rpc("admin_set_setting", { p_key: str(f, "key"), p_value: value as never, p_reason: str(f, "reason") });
  return done(error, "Setting saved.", "/super-admin/settings");
}

export async function reportAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, user } = await requirePlatformAdmin();
  const { error } = await supabase.from("reports").update({ status: str(f, "status"), resolution: str(f, "resolution"), handled_by: user.id, handled_at: new Date().toISOString() }).eq("id", str(f, "reportId"));
  return done(error, "Report updated.", "/super-admin/reports");
}

export async function promoterOversightAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("promoter_decide", { p_enrollment: str(f, "enrollmentId"), p_status: str(f, "status"), p_reason: str(f, "reason") });
  return done(error, "Enrollment updated.", "/super-admin/reports");
}
