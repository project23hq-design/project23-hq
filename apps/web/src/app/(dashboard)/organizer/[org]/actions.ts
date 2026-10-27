"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  engineCode,
  engineErrorMessage,
  eventBasicsSchema,
  eventScheduleSchema,
  organizationSchema,
  parseMoneyToMinor,
  promoSchema,
  referralProgramSchema,
  ticketTypeSchema,
  zonedLocalToUtc,
  payoutRecipientSchema,
} from "@project23/domain";
import { randomToken, sha256Hex } from "@project23/domain/server";
import { requireOrg, requireUser } from "@/lib/auth";
import { rateLimit, textToHtml } from "@/lib/security";
import { deliverEmail } from "@/lib/email";
import { layout } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { paymentProvider } from "@/lib/payments";
import type { ActionState } from "@/components/action-form";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
const fail = (
  error: { message: string; code?: string; details?: string } | null,
  fallback?: string,
): ActionState => ({
  error:
    engineErrorMessage(engineCode(error), fallback ?? error?.message) +
    (error?.details && engineCode(error) ? ` (${error.details})` : ""),
});
const firstIssue = (e: { issues: { path: PropertyKey[]; message: string }[] }) => {
  const i = e.issues[0];
  return { error: i ? `${i.path.join(".") || "Form"}: ${i.message}` : "Check the form." };
};

// ------------------------------------------------------------------ organization
export async function createOrganizationAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser("/organizer/new");
  if (!(await rateLimit("org-create", 5, 86400, user.id)))
    return { error: engineErrorMessage("rate_limited") };
  const p = organizationSchema.safeParse({
    name: s(f, "name"),
    slug: s(f, "slug"),
    description: s(f, "description"),
    contactEmail: s(f, "contactEmail"),
    contactPhone: s(f, "contactPhone"),
    cityId: s(f, "cityId"),
  });
  if (!p.success) return firstIssue(p.error);
  const { error } = await supabase.rpc("create_organization", {
    p_name: p.data.name,
    p_slug: p.data.slug,
    p_description: p.data.description,
    p_contact_email: p.data.contactEmail,
    p_contact_phone: p.data.contactPhone,
    p_city_id: p.data.cityId,
  });
  if (error) return fail(error);
  redirect(`/organizer/${p.data.slug}?created=1`);
}

export async function updateOrganizationAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const p = organizationSchema.omit({ slug: true }).safeParse({
    name: s(f, "name"),
    description: s(f, "description"),
    contactEmail: s(f, "contactEmail"),
    contactPhone: s(f, "contactPhone"),
    cityId: s(f, "cityId"),
  });
  if (!p.success) return firstIssue(p.error);
  const { error } = await supabase
    .from("organizations")
    .update({
      name: p.data.name,
      description: p.data.description ?? null,
      contact_email: p.data.contactEmail ?? null,
      contact_phone: p.data.contactPhone ?? null,
      city_id: p.data.cityId ?? null,
      logo_path: s(f, "logoPath") ?? undefined,
    })
    .eq("id", org.id);
  revalidatePath(`/organizer/${org.slug}`);
  return error ? fail(error) : { message: "Saved." };
}

// ------------------------------------------------------------------ events
export async function createEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, user, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const basics = eventBasicsSchema.safeParse({
    title: s(f, "title"),
    slug: s(f, "slug"),
    summary: s(f, "summary"),
    categoryId: s(f, "categoryId"),
    tags: [],
  });
  if (!basics.success) return firstIssue(basics.error);
  const start = new Date(Date.now() + 14 * 86400_000);
  start.setUTCHours(18, 0, 0, 0);
  const { data, error } = await supabase
    .from("events")
    .insert({
      organization_id: org.id,
      created_by: user.id,
      title: basics.data.title,
      slug: basics.data.slug,
      summary: basics.data.summary ?? null,
      category_id: basics.data.categoryId,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 4 * 3600_000).toISOString(),
      capacity: 100,
    })
    .select("id")
    .single();
  if (error)
    return error.code === "23505"
      ? { error: "That event URL is taken. Try another." }
      : fail(error);
  await supabase.from("event_private").insert({ event_id: data.id });
  redirect(`/organizer/${org.slug}/events/${data.id}?tab=details&new=1`);
}

export async function updateEventDetailsAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const eventId = String(f.get("eventId"));
  const basics = eventBasicsSchema.safeParse({
    title: s(f, "title"),
    slug: s(f, "slug"),
    summary: s(f, "summary"),
    categoryId: s(f, "categoryId"),
    tags: (s(f, "tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  });
  if (!basics.success) return firstIssue(basics.error);
  const sched = eventScheduleSchema.safeParse({
    format: s(f, "format"),
    venueName: s(f, "venueName"),
    addressLine: s(f, "addressLine"),
    cityId: s(f, "cityId"),
    timezone: s(f, "timezone") ?? "Africa/Lagos",
    startsLocal: s(f, "startsLocal"),
    endsLocal: s(f, "endsLocal"),
    capacity: s(f, "capacity"),
    onlineAccessInstructions: s(f, "onlineAccessInstructions"),
    entryRules: s(f, "entryRules"),
    accessibilityInfo: s(f, "accessibilityInfo"),
    ageRestriction: s(f, "ageRestriction"),
    visibility: s(f, "visibility"),
  });
  if (!sched.success) return firstIssue(sched.error);
  const v = { ...basics.data, ...sched.data };
  const { data: city } = v.cityId
    ? await supabase.from("cities").select("region_id").eq("id", v.cityId).single()
    : { data: null };
  const description = s(f, "description");
  const { error } = await supabase
    .from("events")
    .update({
      title: v.title,
      slug: v.slug,
      summary: v.summary ?? null,
      category_id: v.categoryId,
      tags: v.tags,
      description_html: description ? textToHtml(description) : null,
      format: v.format,
      venue_name: v.venueName ?? null,
      address_line: v.addressLine ?? null,
      city_id: v.cityId ?? null,
      region_id: city?.region_id ?? null,
      timezone: v.timezone,
      starts_at: zonedLocalToUtc(v.startsLocal, v.timezone),
      ends_at: zonedLocalToUtc(v.endsLocal, v.timezone),
      capacity: v.capacity,
      entry_rules: v.entryRules ?? null,
      accessibility_info: v.accessibilityInfo ?? null,
      age_restriction: v.ageRestriction ?? null,
      visibility: v.visibility,
      refund_policy: s(f, "refundPolicy") ?? "no_refunds",
      refund_policy_text: s(f, "refundPolicyText") ?? null,
      cover_alt: s(f, "coverAlt") ?? null,
      collect_attendee_names: f.get("collectNames") === "on",
    })
    .eq("id", eventId)
    .eq("organization_id", org.id);
  if (error)
    return error.code === "23514"
      ? { error: "Capacity can't be lower than tickets already sold or held." }
      : fail(error);
  await supabase
    .from("event_private")
    .upsert({ event_id: eventId, online_access_instructions: v.onlineAccessInstructions ?? null });
  revalidatePath(`/organizer/${org.slug}/events/${eventId}`);
  return { message: "Event saved." };
}

export async function setCoverAction(org: string, eventId: string, path: string) {
  const { supabase, org: o } = await requireOrg(org, ["owner", "manager"]);
  if (!path.startsWith(`${o.id}/`)) return { error: "Invalid upload path." };
  const { error } = await supabase
    .from("events")
    .update({ cover_path: path })
    .eq("id", eventId)
    .eq("organization_id", o.id);
  revalidatePath(`/organizer/${o.slug}/events/${eventId}`);
  return error ? { error: error.message } : { ok: true };
}

export async function eventLifecycleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const eventId = String(f.get("eventId"));
  const op = String(f.get("op"));
  const reason = s(f, "reason");
  const { error } =
    op === "submit"
      ? await supabase.rpc("event_submit_for_review", { p_event: eventId })
      : op === "cancel"
        ? await supabase.rpc("cancel_event", { p_event: eventId, p_reason: reason ?? "" })
        : await supabase.rpc("event_set_status", {
            p_event: eventId,
            p_status: op as "paused" | "published" | "archived",
            p_reason: reason,
          });
  revalidatePath(`/organizer/${org.slug}/events/${eventId}`);
  if (error) return fail(error);
  return {
    message:
      {
        submit: "Submitted for review. We'll email you when it's approved.",
        cancel: "Event cancelled. Refunds are being processed and buyers notified.",
        paused: "Sales paused.",
        published: "Sales resumed.",
        archived: "Archived.",
      }[op] ?? "Done.",
  };
}

// ------------------------------------------------------------------ ticket types
export async function saveTicketTypeAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const eventId = String(f.get("eventId"));
  const tz = s(f, "timezone") ?? "Africa/Lagos";
  const price = parseMoneyToMinor(s(f, "price") ?? "0");
  if (price === null) return { error: "Enter a valid price in naira." };
  const p = ticketTypeSchema.safeParse({
    id: s(f, "id"),
    name: s(f, "name"),
    kind: s(f, "kind"),
    description: s(f, "description"),
    priceMinor: price,
    quantityTotal: s(f, "quantityTotal"),
    admissionsPerUnit: s(f, "admissionsPerUnit") ?? 1,
    minPerOrder: s(f, "minPerOrder") ?? 1,
    maxPerOrder: s(f, "maxPerOrder") ?? 10,
    salesStartLocal: s(f, "salesStartLocal"),
    salesEndLocal: s(f, "salesEndLocal"),
    opensAfterTicketTypeId: s(f, "opensAfter") ?? "",
    visibility: s(f, "visibility") ?? "public",
    accessCode: s(f, "accessCode") ?? "",
    isActive: f.get("isActive") !== "off",
  });
  if (!p.success) return firstIssue(p.error);
  const v = p.data;
  const row = {
    name: v.name,
    kind: v.kind,
    description: v.description ?? null,
    price_minor: v.priceMinor,
    quantity_total: v.quantityTotal,
    admissions_per_unit: v.admissionsPerUnit,
    min_per_order: v.minPerOrder,
    max_per_order: v.maxPerOrder,
    sales_start_at: v.salesStartLocal ? zonedLocalToUtc(v.salesStartLocal, tz) : null,
    sales_end_at: v.salesEndLocal ? zonedLocalToUtc(v.salesEndLocal, tz) : null,
    opens_after_ticket_type_id: v.opensAfterTicketTypeId || null,
    visibility: v.visibility,
    is_active: v.isActive,
    sort_order: Number(s(f, "sortOrder") ?? 0),
    ...(v.visibility === "access_code"
      ? v.accessCode
        ? { access_code_hash: sha256Hex(v.accessCode.trim().toUpperCase()) }
        : {}
      : { access_code_hash: null }),
  };
  if (v.visibility === "access_code" && !v.id && !v.accessCode)
    return { error: "Set an access code for code-protected tickets." };
  const { error } = v.id
    ? await supabase.from("ticket_types").update(row).eq("id", v.id).eq("event_id", eventId)
    : await supabase
        .from("ticket_types")
        .insert({ ...row, event_id: eventId, organization_id: org.id });
  revalidatePath(`/organizer/${org.slug}/events/${eventId}`);
  if (error)
    return error.code === "23514"
      ? {
          error:
            "Quantity can't go below tickets already sold or held, and limits must be consistent.",
        }
      : fail(error);
  return {
    message: v.id
      ? "Ticket type updated. Price changes apply to new purchases only."
      : "Ticket type added.",
  };
}

export async function deleteTicketTypeAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const { error } = await supabase
    .from("ticket_types")
    .delete()
    .eq("id", String(f.get("id")));
  revalidatePath(`/organizer/${org.slug}/events/${String(f.get("eventId"))}`);
  return error
    ? { error: "Ticket types with sales can't be deleted — deactivate it instead." }
    : { message: "Deleted." };
}

// ------------------------------------------------------------------ promo codes
export async function savePromoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const eventId = String(f.get("eventId"));
  const pct = s(f, "percent");
  const amt = s(f, "amount");
  const p = promoSchema.safeParse({
    code: s(f, "code"),
    discountType: s(f, "discountType"),
    percentBps: pct ? Math.round(Number(pct) * 100) : undefined,
    amountMinor: amt ? (parseMoneyToMinor(amt) ?? undefined) : undefined,
    maxRedemptions: s(f, "maxRedemptions"),
    startsLocal: s(f, "startsLocal"),
    endsLocal: s(f, "endsLocal"),
  });
  if (!p.success) return firstIssue(p.error);
  const v = p.data;
  const { error } = await supabase.from("promotions").insert({
    organization_id: org.id,
    event_id: eventId,
    code: v.code,
    discount_type: v.discountType,
    percent_bps: v.discountType === "percent" ? v.percentBps : null,
    amount_minor: v.discountType === "fixed" ? v.amountMinor : null,
    max_redemptions: v.maxRedemptions ?? null,
    starts_at: v.startsLocal ? zonedLocalToUtc(v.startsLocal, "Africa/Lagos") : null,
    ends_at: v.endsLocal ? zonedLocalToUtc(v.endsLocal, "Africa/Lagos") : null,
  });
  revalidatePath(`/organizer/${org.slug}/events/${eventId}`);
  return error
    ? error.code === "23505"
      ? { error: "That code already exists for this event." }
      : fail(error)
    : { message: `Promo code ${v.code} created.` };
}

export async function togglePromoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const { error } = await supabase
    .from("promotions")
    .update({ is_active: f.get("active") === "true" })
    .eq("id", String(f.get("id")));
  revalidatePath(`/organizer/${org.slug}/events/${String(f.get("eventId"))}`);
  return error ? fail(error) : { message: "Updated." };
}

// ------------------------------------------------------------------ referral program
export async function saveReferralProgramAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const eventId = String(f.get("eventId"));
  const p = referralProgramSchema.safeParse({
    rateBps: Math.round(Number(s(f, "ratePercent") ?? 0) * 100),
    windowDays: s(f, "windowDays"),
    maturityDays: s(f, "maturityDays"),
    terms: s(f, "terms"),
    enrollmentMode: s(f, "enrollmentMode"),
    eligibleTicketTypeIds: f.getAll("eligible").map(String).filter(Boolean),
  });
  if (!p.success) return firstIssue(p.error);
  const v = p.data;
  const { error } = await supabase.rpc("referral_program_upsert", {
    p_event: eventId,
    p_rate_bps: v.rateBps,
    p_eligible_ticket_type_ids: (v.eligibleTicketTypeIds?.length
      ? v.eligibleTicketTypeIds
      : null) as string[],
    p_window_days: v.windowDays,
    p_terms: v.terms,
    p_enrollment_mode: v.enrollmentMode,
    p_maturity_days: v.maturityDays,
  });
  revalidatePath(`/organizer/${org.slug}/events/${eventId}`);
  return error
    ? fail(error)
    : {
        message: "Program terms saved as a new version. Existing sales keep their original terms.",
      };
}

export async function referralProgramStatusAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const { error } = await supabase.rpc("referral_program_set_status", {
    p_program: String(f.get("programId")),
    p_status: String(f.get("status")),
    p_reason: s(f, "reason"),
  });
  revalidatePath(`/organizer/${org.slug}/events/${String(f.get("eventId"))}`);
  return error ? fail(error) : { message: "Program updated." };
}

export async function decideEnrollmentAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const override = s(f, "ratePercent");
  const { error } = await supabase.rpc("promoter_decide", {
    p_enrollment: String(f.get("enrollmentId")),
    p_status: String(f.get("status")),
    p_reason: s(f, "reason"),
    p_rate_override_bps: override ? Math.round(Number(override) * 100) : undefined,
  });
  revalidatePath(`/organizer/${org.slug}/events/${String(f.get("eventId"))}`);
  return error ? fail(error) : { message: "Promoter updated." };
}

// ------------------------------------------------------------------ staff & team
export async function assignStaffAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const eventId = String(f.get("eventId"));
  const userId = String(f.get("userId"));
  const { error } =
    f.get("remove") === "1"
      ? await supabase.rpc("unassign_event_staff", { p_event: eventId, p_user: userId })
      : await supabase.rpc("assign_event_staff", {
          p_event: eventId,
          p_user: userId,
          p_door: f.get("door") === "on",
          p_comps: f.get("comps") === "on",
          p_reentry: f.get("reentry") === "on",
        });
  revalidatePath(`/organizer/${org.slug}/events/${eventId}`);
  return error ? fail(error) : { message: "Staff updated." };
}

export async function inviteMemberAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org, user } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  if (!(await rateLimit("invite", 20, 3600, user.id)))
    return { error: engineErrorMessage("rate_limited") };
  const email = (s(f, "email") ?? "").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const role = String(f.get("role")) as "owner" | "manager" | "finance" | "scanner";
  const token = randomToken(32);
  const { error } = await supabase.rpc("invite_member", {
    p_org: org.id,
    p_email: email,
    p_role: role,
    p_token_hash: sha256Hex(token),
  });
  if (error) return fail(error);
  const url = `${env().NEXT_PUBLIC_APP_URL}/invite/${token}`;
  await deliverEmail(`invite:${sha256Hex(token).slice(0, 24)}`, "team_invite", {
    to: email,
    subject: `You're invited to join ${org.name} on Project23`,
    html: layout({
      preheader: `Join ${org.name}`,
      title: `Join ${org.name} on Project23`,
      body: `<p>You've been invited as <strong>${role}</strong>. The invitation expires in 7 days and only works when you're signed in with this email address.</p>`,
      cta: { label: "Accept invitation", url },
    }),
    text: `You've been invited to join ${org.name} as ${role}: ${url}`,
  });
  revalidatePath(`/organizer/${org.slug}/team`);
  return { message: `Invitation sent to ${email}.` };
}

export async function memberAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")));
  const op = String(f.get("op"));
  const userId = String(f.get("userId"));
  const { error } =
    op === "remove"
      ? await supabase.rpc("remove_member", { p_org: org.id, p_user: userId })
      : op === "revoke"
        ? await supabase.rpc("revoke_invitation", { p_invitation: String(f.get("invitationId")) })
        : await supabase.rpc("change_member_role", {
            p_org: org.id,
            p_user: userId,
            p_role: String(f.get("role")) as "owner" | "manager" | "finance" | "scanner",
          });
  revalidatePath(`/organizer/${org.slug}/team`);
  return error ? fail(error) : { message: "Team updated." };
}

// ------------------------------------------------------------------ orders, refunds, tickets
export async function organizerRefundAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager", "finance"]);
  const itemId = s(f, "orderItemId");
  const units = Number(s(f, "units") ?? 0);
  const { error } = await supabase.rpc("refund_request_create", {
    p_order: String(f.get("orderId")),
    p_items: itemId && units > 0 ? [{ order_item_id: itemId, units }] : null,
    p_reason: s(f, "reason") ?? "",
    p_include_used: f.get("includeUsed") === "on",
  });
  revalidatePath(`/organizer/${org.slug}/orders`);
  return error
    ? fail(error)
    : {
        message: "Refund approved and queued with the payment provider. Affected tickets are void.",
      };
}

export async function reviewRefundAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager", "finance"]);
  const { error } = await supabase.rpc("refund_review", {
    p_refund: String(f.get("refundId")),
    p_approve: f.get("approve") === "true",
    p_note: s(f, "note") ?? "",
  });
  revalidatePath(`/organizer/${org.slug}/orders`);
  return error ? fail(error) : { message: "Refund request reviewed." };
}

export async function reissueTicketAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, org } = await requireOrg(String(f.get("org")), ["owner", "manager"]);
  const { error } = await supabase.rpc("ticket_reissue", {
    p_ticket: String(f.get("ticketId")),
    p_reason: s(f, "reason") ?? "",
  });
  revalidatePath(`/organizer/${org.slug}/orders`);
  return error
    ? fail(error)
    : {
        message: "Ticket reissued; the old QR code no longer works and the buyer has been emailed.",
      };
}

// ------------------------------------------------------------------ finance
export async function setPayoutRecipientAction(_: ActionState, f: FormData): Promise<ActionState> {
  const kind = String(f.get("kind")) as "organization" | "promoter";
  const ctx =
    kind === "organization"
      ? await requireOrg(String(f.get("org")), ["owner"])
      : { ...(await requireUser("/promoter")), org: null };
  const bankCode = s(f, "bankCode");
  const bank = (
    await paymentProvider()
      .listBanks()
      .catch(() => [])
  ).find((b) => b.code === bankCode);
  if (!bank) return { error: "Choose your bank from the list." };
  const p = payoutRecipientSchema.safeParse({
    bankCode,
    bankName: bank.name,
    accountNumber: s(f, "accountNumber"),
    accountName: s(f, "accountName"),
  });
  if (!p.success) return firstIssue(p.error);
  const { error } = await ctx.supabase.rpc("payout_recipient_set", {
    p_kind: kind,
    p_org: ctx.org?.id ?? (null as unknown as string),
    p_bank_code: p.data.bankCode,
    p_bank_name: p.data.bankName,
    p_account_number: p.data.accountNumber,
    p_account_name: p.data.accountName,
  });
  revalidatePath(kind === "organization" ? `/organizer/${ctx.org!.slug}/finance` : "/promoter");
  return error
    ? fail(error)
    : {
        message:
          "Bank account saved. We'll verify it with the bank before payouts can be sent; account owners were notified.",
      };
}

export async function requestPayoutAction(_: ActionState, f: FormData): Promise<ActionState> {
  const kind = String(f.get("kind")) as "organization" | "promoter";
  const ctx =
    kind === "organization"
      ? await requireOrg(String(f.get("org")), ["owner", "finance"])
      : { ...(await requireUser("/promoter")), org: null };
  const amount = parseMoneyToMinor(s(f, "amount") ?? "");
  if (!amount) return { error: "Enter an amount in naira." };
  const { error } = await ctx.supabase.rpc("payout_request", {
    p_kind: kind,
    p_org: ctx.org?.id ?? (null as unknown as string),
    p_amount_minor: amount,
    p_idempotency_key: String(f.get("idempotencyKey")),
  });
  revalidatePath(kind === "organization" ? `/organizer/${ctx.org!.slug}/finance` : "/promoter");
  return error
    ? fail(error)
    : {
        message:
          "Withdrawal requested. The amount is locked until it's paid or returned. This is not yet a bank transfer.",
      };
}

export async function cancelPayoutAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("payout_transition", {
    p_payout: String(f.get("payoutId")),
    p_to: "cancelled",
    p_note: "Cancelled by requester",
  });
  revalidatePath("/promoter");
  return error
    ? fail(error)
    : { message: "Withdrawal cancelled; funds returned to available balance." };
}

export async function acceptInvitationAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token_hash: sha256Hex(String(f.get("token") ?? "")),
  });
  if (error) return fail(error);
  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", data as string)
    .single();
  redirect(`/organizer/${org?.slug ?? ""}`);
}

export interface CreateEventInput {
  org: string;
  mode: "tickets" | "rsvp";
  title: string;
  slug: string;
  summary?: string;
  description?: string;
  categoryId: string;
  startsLocal: string;
  endsLocal: string;
  timezone: string;
  format: "in_person" | "online";
  venueName?: string;
  addressLine?: string;
  cityId?: string;
  capacity: number;
  visibility: "public" | "unlisted";
  tickets: { name: string; price: string; quantity: number; admissionsPerUnit: number }[];
}

/** One-page create (reference-style): event + ticket types in one step, then the editor. */
export async function createEventFullAction(
  input: CreateEventInput,
): Promise<{ eventId?: string; orgId?: string; error?: string }> {
  const { supabase, user, org } = await requireOrg(input.org, ["owner", "manager"]);
  if (!(await rateLimit("event-create", 30, 3600, user.id)))
    return { error: engineErrorMessage("rate_limited") };
  const basics = eventBasicsSchema.safeParse({
    title: input.title,
    slug: input.slug,
    summary: input.summary,
    categoryId: input.categoryId,
    tags: [],
  });
  if (!basics.success) return firstIssue(basics.error);
  const sched = eventScheduleSchema.safeParse({
    format: input.format,
    venueName: input.venueName,
    addressLine: input.addressLine,
    cityId: input.cityId || undefined,
    timezone: input.timezone,
    startsLocal: input.startsLocal,
    endsLocal: input.endsLocal,
    capacity: input.capacity,
    visibility: input.visibility,
  });
  if (!sched.success) return firstIssue(sched.error);
  if (input.tickets.length === 0) return { error: "Add at least one ticket." };
  const tickets = [];
  for (const [i, t] of input.tickets.entries()) {
    const price = input.mode === "rsvp" ? 0 : parseMoneyToMinor(t.price || "0");
    if (price === null) return { error: `Ticket ${i + 1}: enter a valid price in naira.` };
    const p = ticketTypeSchema.safeParse({
      name: t.name,
      kind: price === 0 ? "free" : t.admissionsPerUnit > 1 ? "group" : "general",
      priceMinor: price,
      quantityTotal: t.quantity,
      admissionsPerUnit: t.admissionsPerUnit,
      minPerOrder: 1,
      maxPerOrder: Math.min(10, Math.max(1, t.quantity)),
      visibility: "public",
      accessCode: "",
      isActive: true,
    });
    if (!p.success) return { error: `Ticket ${i + 1}: ${p.error.issues[0]?.message ?? "invalid"}` };
    tickets.push(p.data);
  }
  const v = { ...basics.data, ...sched.data };
  const { data: city } = v.cityId
    ? await supabase.from("cities").select("region_id").eq("id", v.cityId).single()
    : { data: null };
  const { data, error } = await supabase
    .from("events")
    .insert({
      organization_id: org.id,
      created_by: user.id,
      title: v.title,
      slug: v.slug,
      summary: v.summary ?? null,
      category_id: v.categoryId,
      description_html: input.description?.trim() ? textToHtml(input.description) : null,
      format: v.format,
      venue_name: v.venueName ?? null,
      address_line: v.addressLine ?? null,
      city_id: v.cityId ?? null,
      region_id: city?.region_id ?? null,
      timezone: v.timezone,
      starts_at: zonedLocalToUtc(v.startsLocal, v.timezone),
      ends_at: zonedLocalToUtc(v.endsLocal, v.timezone),
      capacity: v.capacity,
      visibility: v.visibility,
    })
    .select("id")
    .single();
  if (error)
    return {
      error: error.code === "23505" ? "That event URL is taken. Try another." : fail(error)?.error,
    };
  await supabase.from("event_private").insert({ event_id: data.id });
  const { error: tErr } = await supabase.from("ticket_types").insert(
    tickets.map((t, i) => ({
      event_id: data.id,
      organization_id: org.id,
      name: t.name,
      kind: t.kind,
      price_minor: t.priceMinor,
      quantity_total: t.quantityTotal,
      admissions_per_unit: t.admissionsPerUnit,
      min_per_order: t.minPerOrder,
      max_per_order: t.maxPerOrder,
      visibility: "public",
      sort_order: i,
    })),
  );
  if (tErr)
    return {
      eventId: data.id,
      orgId: org.id,
      error: `Event saved, but tickets couldn't be added: ${tErr.message}`,
    };
  revalidatePath(`/organizer/${org.slug}/events`);
  return { eventId: data.id, orgId: org.id };
}
