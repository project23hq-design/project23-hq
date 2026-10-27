import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  formatBps,
  formatDateTime,
  formatEventRange,
  formatMoney,
  utcToZonedLocal,
} from "@project23/domain";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Stat,
  Table,
  Td,
  Textarea,
  Th,
} from "@project23/ui";
import { requireOrg } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { EventPoster } from "@/components/poster";
import {
  assignStaffAction,
  decideEnrollmentAction,
  deleteTicketTypeAction,
  eventLifecycleAction,
  referralProgramStatusAction,
  saveReferralProgramAction,
  savePromoAction,
  saveTicketTypeAction,
  togglePromoAction,
  updateEventDetailsAction,
} from "../../actions";
import { SlugInput } from "../new/slug-input";
import { CoverUpload } from "./cover-upload";

const TABS = [
  ["details", "Details"],
  ["tickets", "Tickets"],
  ["promos", "Promo codes"],
  ["referrals", "Promoters"],
  ["staff", "Gate staff"],
  ["attendees", "Attendees"],
  ["insights", "Insights"],
  ["publish", "Publish"],
] as const;

const htmlToText = (h: string | null) =>
  (h ?? "")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>\s*<p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export default async function EventEditor({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; eventId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org: slug, eventId } = await params;
  const tab = (await searchParams).tab ?? "details";
  const { supabase, org } = await requireOrg(slug, ["owner", "manager", "finance"]);
  const { data: e } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!e) notFound();
  const editable = org.role !== "finance";
  const locked = ["cancelled", "completed", "archived"].includes(e.status);
  const base = `/organizer/${org.slug}/events/${e.id}`;
  const hidden = (
    <>
      <input type="hidden" name="org" value={org.slug} />
      <input type="hidden" name="eventId" value={e.id} />
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-fg-muted">
            <Link href={`/organizer/${org.slug}/events`} className="hover:underline">
              Events
            </Link>{" "}
            /
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">{e.title}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {formatEventRange(e.starts_at, e.ends_at, e.timezone)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              e.status === "published" ? "success" : e.status === "cancelled" ? "danger" : "neutral"
            }
          >
            {e.status.replace("_", " ")}
          </Badge>
          {["published", "paused", "completed", "cancelled"].includes(e.status) && (
            <Link
              className="inline-flex items-center gap-1 text-sm text-accent"
              href={`/events/${e.slug}`}
              target="_blank"
            >
              View public page <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
      {e.moderation_status === "changes_requested" && (
        <Alert tone="warning" className="mt-4" title="Changes requested by Project23">
          {e.moderation_notes} Update the event and resubmit from the Publish tab.
        </Alert>
      )}
      {e.moderation_status === "rejected" && (
        <Alert tone="danger" className="mt-4" title="Rejected">
          {e.moderation_notes}
        </Alert>
      )}
      {e.admissions_sold > 0 && !locked && (
        <Alert className="mt-4">
          Tickets have been sold. Date, time and venue changes notify every buyer by email and are
          recorded in the audit log.
        </Alert>
      )}

      <nav
        aria-label="Event sections"
        className="scrollbar-none -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${tab === k ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "details" && <DetailsTab />}
        {tab === "tickets" && <TicketsTab />}
        {tab === "promos" && <PromosTab />}
        {tab === "referrals" && <ReferralsTab />}
        {tab === "staff" && <StaffTab />}
        {tab === "attendees" && <AttendeesTab />}
        {tab === "insights" && <InsightsTab />}
        {tab === "publish" && <PublishTab />}
      </div>
    </div>
  );

  async function DetailsTab() {
    const [{ data: cats }, { data: cities }, { data: priv }] = await Promise.all([
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("cities").select("id, name").order("sort_order"),
      supabase
        .from("event_private")
        .select("online_access_instructions")
        .eq("event_id", e!.id)
        .maybeSingle(),
    ]);
    const ev = e!;
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-6">
          <ActionForm action={updateEventDetailsAction} submitLabel="Save event">
            {hidden}
            <fieldset disabled={!editable || locked} className="grid gap-4">
              <legend className="mb-2 font-display text-lg font-semibold">Basics</legend>
              <SlugInput title={ev.title} slug={ev.slug} />
              <Field label="Summary" htmlFor="summary">
                <Input name="summary" defaultValue={ev.summary ?? ""} maxLength={280} />
              </Field>
              <Field
                label="Description"
                htmlFor="description"
                hint="Plain text; blank lines start new paragraphs."
              >
                <Textarea
                  name="description"
                  defaultValue={htmlToText(ev.description_html)}
                  rows={8}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="categoryId">
                  <Select name="categoryId" defaultValue={ev.category_id ?? ""}>
                    {cats?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tags" htmlFor="tags" hint="Comma separated, up to 10.">
                  <Input name="tags" defaultValue={ev.tags.join(", ")} />
                </Field>
              </div>
              <legend className="mb-2 mt-4 font-display text-lg font-semibold">
                Schedule & location
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Format" htmlFor="format">
                  <Select name="format" defaultValue={ev.format}>
                    <option value="in_person">In person</option>
                    <option value="online">Online</option>
                    <option value="hybrid">Hybrid</option>
                  </Select>
                </Field>
                <Field label="Starts (local)" htmlFor="startsLocal">
                  <Input
                    type="datetime-local"
                    name="startsLocal"
                    defaultValue={utcToZonedLocal(ev.starts_at, ev.timezone)}
                  />
                </Field>
                <Field label="Ends (local)" htmlFor="endsLocal">
                  <Input
                    type="datetime-local"
                    name="endsLocal"
                    defaultValue={utcToZonedLocal(ev.ends_at, ev.timezone)}
                  />
                </Field>
              </div>
              <input type="hidden" name="timezone" value={ev.timezone} />
              <p className="-mt-2 text-xs text-fg-subtle">
                Times are in{" "}
                {ev.timezone === "Africa/Lagos" ? "West Africa Time (WAT)" : ev.timezone}.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Venue name" htmlFor="venueName">
                  <Input name="venueName" defaultValue={ev.venue_name ?? ""} />
                </Field>
                <Field label="City" htmlFor="cityId">
                  <Select name="cityId" defaultValue={ev.city_id ?? ""}>
                    <option value="">—</option>
                    {cities?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Address" htmlFor="addressLine">
                <Input name="addressLine" defaultValue={ev.address_line ?? ""} />
              </Field>
              <Field
                label="Online access instructions"
                htmlFor="onlineAccessInstructions"
                hint="Private: only sent to ticket holders."
              >
                <Textarea
                  name="onlineAccessInstructions"
                  defaultValue={priv?.online_access_instructions ?? ""}
                  rows={3}
                />
              </Field>
              <legend className="mb-2 mt-4 font-display text-lg font-semibold">
                Capacity & policies
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Total capacity (people)"
                  htmlFor="capacity"
                  hint="Counts every admission, including tables and comps."
                >
                  <Input type="number" name="capacity" min={1} defaultValue={ev.capacity} />
                </Field>
                <Field label="Visibility" htmlFor="visibility">
                  <Select name="visibility" defaultValue={ev.visibility}>
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted (link only)</option>
                    <option value="private">Private (no online sales)</option>
                  </Select>
                </Field>
                <Field label="Minimum age" htmlFor="ageRestriction">
                  <Input
                    type="number"
                    name="ageRestriction"
                    min={0}
                    max={25}
                    defaultValue={ev.age_restriction ?? ""}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Refund policy" htmlFor="refundPolicy">
                  <Select name="refundPolicy" defaultValue={ev.refund_policy}>
                    <option value="no_refunds">No refunds (except cancellation)</option>
                    <option value="until_24h">Until 24h before</option>
                    <option value="until_7d">Until 7 days before</option>
                    <option value="custom">Custom</option>
                  </Select>
                </Field>
                <Field label="Refund policy details" htmlFor="refundPolicyText">
                  <Input name="refundPolicyText" defaultValue={ev.refund_policy_text ?? ""} />
                </Field>
              </div>
              <Field label="Entry rules" htmlFor="entryRules">
                <Textarea name="entryRules" defaultValue={ev.entry_rules ?? ""} rows={2} />
              </Field>
              <Field label="Accessibility information" htmlFor="accessibilityInfo">
                <Textarea
                  name="accessibilityInfo"
                  defaultValue={ev.accessibility_info ?? ""}
                  rows={2}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="collectNames"
                  defaultChecked={ev.collect_attendee_names}
                  className="size-4 accent-[var(--accent)]"
                />{" "}
                Ask for attendee names
              </label>
              <Field label="Cover image alt text" htmlFor="coverAlt">
                <Input name="coverAlt" defaultValue={ev.cover_alt ?? ""} />
              </Field>
            </fieldset>
          </ActionForm>
        </Card>
        <div className="space-y-3">
          <EventPoster
            slug={ev.slug}
            title={ev.title}
            coverPath={ev.cover_path}
            coverAlt={ev.cover_alt}
          />
          {editable && !locked && <CoverUpload org={org.slug} orgId={org.id} eventId={ev.id} />}
        </div>
      </div>
    );
  }

  async function TicketsTab() {
    const { data: types } = await supabase
      .from("ticket_types")
      .select("*")
      .eq("event_id", e!.id)
      .order("sort_order");
    const tz = e!.timezone;
    const TicketForm = ({ t }: { t?: NonNullable<typeof types>[number] }) => (
      <ActionForm action={saveTicketTypeAction} submitLabel={t ? "Save" : "Add ticket type"}>
        {hidden}
        <input type="hidden" name="timezone" value={tz} />
        {t && <input type="hidden" name="id" value={t.id} />}
        <fieldset disabled={!editable || locked} className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" htmlFor={`name-${t?.id ?? "new"}`} className="sm:col-span-2">
            <Input name="name" defaultValue={t?.name ?? ""} required />
          </Field>
          <Field label="Type" htmlFor={`kind-${t?.id ?? "new"}`}>
            <Select name="kind" defaultValue={t?.kind ?? "regular"}>
              {[
                "early_bird",
                "regular",
                "general",
                "vip",
                "vvip",
                "student",
                "group",
                "free",
                "complimentary",
              ].map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price (₦)" htmlFor={`price-${t?.id ?? "new"}`}>
            <Input
              name="price"
              inputMode="decimal"
              defaultValue={t ? String(t.price_minor / 100) : ""}
            />
          </Field>
          <Field
            label="Units available"
            htmlFor={`q-${t?.id ?? "new"}`}
            hint={t ? `${t.units_sold} sold · ${t.units_held} held` : undefined}
          >
            <Input
              type="number"
              name="quantityTotal"
              min={0}
              defaultValue={t?.quantity_total ?? 100}
            />
          </Field>
          <Field
            label="Admissions per unit"
            htmlFor={`apu-${t?.id ?? "new"}`}
            hint="e.g. 6 for a table of six"
          >
            <Input
              type="number"
              name="admissionsPerUnit"
              min={1}
              max={50}
              defaultValue={t?.admissions_per_unit ?? 1}
              disabled={!!t && t.units_sold > 0}
            />
          </Field>
          <Field label="Min / order" htmlFor={`min-${t?.id ?? "new"}`}>
            <Input type="number" name="minPerOrder" min={1} defaultValue={t?.min_per_order ?? 1} />
          </Field>
          <Field label="Max / order" htmlFor={`max-${t?.id ?? "new"}`}>
            <Input type="number" name="maxPerOrder" min={1} defaultValue={t?.max_per_order ?? 10} />
          </Field>
          <Field label="Sales start" htmlFor={`ss-${t?.id ?? "new"}`}>
            <Input
              type="datetime-local"
              name="salesStartLocal"
              defaultValue={t?.sales_start_at ? utcToZonedLocal(t.sales_start_at, tz) : ""}
            />
          </Field>
          <Field label="Sales end" htmlFor={`se-${t?.id ?? "new"}`}>
            <Input
              type="datetime-local"
              name="salesEndLocal"
              defaultValue={t?.sales_end_at ? utcToZonedLocal(t.sales_end_at, tz) : ""}
            />
          </Field>
          <Field
            label="Opens after"
            htmlFor={`oa-${t?.id ?? "new"}`}
            hint="Opens when that type sells out or its sales end."
          >
            <Select name="opensAfter" defaultValue={t?.opens_after_ticket_type_id ?? ""}>
              <option value="">—</option>
              {types
                ?.filter((x) => x.id !== t?.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Visibility" htmlFor={`vis-${t?.id ?? "new"}`}>
            <Select name="visibility" defaultValue={t?.visibility ?? "public"}>
              <option value="public">Public</option>
              <option value="access_code">Access code</option>
              <option value="hidden">Hidden (door/comp only)</option>
            </Select>
          </Field>
          <Field
            label="Access code"
            htmlFor={`ac-${t?.id ?? "new"}`}
            hint={t?.access_code_hash ? "Set — enter to replace" : undefined}
          >
            <Input name="accessCode" autoComplete="off" />
          </Field>
          <Field label="Description" htmlFor={`d-${t?.id ?? "new"}`} className="sm:col-span-2">
            <Input name="description" defaultValue={t?.description ?? ""} />
          </Field>
          <Field label="Order" htmlFor={`so-${t?.id ?? "new"}`}>
            <Input
              type="number"
              name="sortOrder"
              defaultValue={t?.sort_order ?? (types?.length ?? 0) + 1}
            />
          </Field>
          <Field label="Active" htmlFor={`act-${t?.id ?? "new"}`}>
            <Select name="isActive" defaultValue={t?.is_active === false ? "off" : "on"}>
              <option value="on">On sale when eligible</option>
              <option value="off">Inactive</option>
            </Select>
          </Field>
        </fieldset>
      </ActionForm>
    );
    return (
      <div className="space-y-4">
        {types?.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                {t.name}{" "}
                <span className="text-fg-muted">
                  · {t.price_minor === 0 ? "Free" : formatMoney(t.price_minor)}
                  {t.admissions_per_unit > 1 ? ` · admits ${t.admissions_per_unit}` : ""}
                </span>
              </h3>
              {editable && t.units_sold === 0 && t.units_held === 0 && (
                <ActionForm
                  action={deleteTicketTypeAction}
                  submitLabel="Delete"
                  submitVariant="ghost"
                  inline
                  confirm="Delete this ticket type?"
                >
                  {hidden}
                  <input type="hidden" name="id" value={t.id} />
                </ActionForm>
              )}
            </div>
            <TicketForm t={t} />
          </Card>
        ))}
        {editable && !locked && (
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New ticket type</h3>
            <TicketForm />
          </Card>
        )}
      </div>
    );
  }

  async function PromosTab() {
    const { data: promos } = await supabase
      .from("promotions")
      .select("*")
      .eq("event_id", e!.id)
      .order("created_at");
    return (
      <div className="space-y-6">
        <p className="text-sm text-fg-muted">
          Caps count active checkout holds plus completed orders. Expired holds release their
          redemption automatically. Discounts never take a ticket below ₦0.
        </p>
        {!!promos?.length && (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Used</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono">{p.code}</Td>
                  <Td>
                    {p.discount_type === "percent"
                      ? formatBps(p.percent_bps!)
                      : formatMoney(p.amount_minor!)}
                  </Td>
                  <Td className="tabular-nums">
                    {p.redemptions_completed}
                    {p.redemptions_reserved ? ` (+${p.redemptions_reserved} in checkout)` : ""}
                    {p.max_redemptions ? ` / ${p.max_redemptions}` : ""}
                  </Td>
                  <Td>
                    <Badge tone={p.is_active ? "success" : "neutral"}>
                      {p.is_active ? "Active" : "Off"}
                    </Badge>
                  </Td>
                  <Td>
                    {editable && (
                      <ActionForm
                        action={togglePromoAction}
                        submitLabel={p.is_active ? "Disable" : "Enable"}
                        submitVariant="ghost"
                        inline
                      >
                        {hidden}
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.is_active)} />
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {editable && !locked && (
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New promo code</h3>
            <ActionForm action={savePromoAction} submitLabel="Create code" resetOnSuccess>
              {hidden}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Code" htmlFor="code">
                  <Input name="code" className="uppercase" />
                </Field>
                <Field label="Type" htmlFor="discountType">
                  <Select name="discountType">
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed amount</option>
                  </Select>
                </Field>
                <Field label="Percent (%)" htmlFor="percent">
                  <Input name="percent" inputMode="decimal" />
                </Field>
                <Field label="Amount (₦)" htmlFor="amount">
                  <Input name="amount" inputMode="decimal" />
                </Field>
                <Field label="Max uses" htmlFor="maxRedemptions">
                  <Input type="number" name="maxRedemptions" min={1} />
                </Field>
                <Field label="Valid until" htmlFor="endsLocal">
                  <Input type="datetime-local" name="endsLocal" />
                </Field>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    );
  }

  async function ReferralsTab() {
    const [{ data: program }, { data: types }] = await Promise.all([
      supabase
        .from("referral_programs")
        .select("*, referral_program_versions!referral_programs_current_version(*)")
        .eq("event_id", e!.id)
        .maybeSingle(),
      supabase
        .from("ticket_types")
        .select("id, name, price_minor")
        .eq("event_id", e!.id)
        .gt("price_minor", 0),
    ]);
    const v = program?.referral_program_versions as unknown as {
      rate_bps: number;
      attribution_window_days: number;
      maturity_days_after_event: number;
      terms_text: string;
      version: number;
      eligible_ticket_type_ids: string[] | null;
    } | null;
    const { data: enrollments } = program
      ? await supabase
          .from("promoter_enrollments")
          .select("id, user_id, status, application_note, rate_override_bps, created_at")
          .eq("program_id", program.id)
          .order("created_at")
      : { data: [] };
    const { data: summary } = await supabase.rpc("org_event_summary", { p_event: e!.id });
    const refStats =
      (
        summary as {
          referrals?: {
            enrollment_id: string;
            promoter_name: string;
            orders: number;
            commission_minor: number;
          }[];
        } | null
      )?.referrals ?? [];
    return (
      <div className="space-y-6">
        <Alert title="How promoter commission works">
          Promoters earn a percentage of the eligible ticket price after discounts, paid from your
          proceeds — buyers pay the same price and Project23&apos;s fee is unchanged. Example:
          ₦10,000 ticket, 5% platform fee, 10% commission → ₦500 platform, ₦1,000 promoter, ₦8,500
          to you. Commissions accrue only on verified paid orders and are reversed on refunds.
        </Alert>
        {program && (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={program.status === "active" ? "success" : "warning"}>
              {program.status}
            </Badge>
            {v && (
              <span className="text-sm text-fg-muted">
                v{v.version} · {formatBps(v.rate_bps)} · {v.attribution_window_days}-day window ·
                available {v.maturity_days_after_event} days after the event
              </span>
            )}
            {editable && program.status !== "closed" && (
              <ActionForm
                action={referralProgramStatusAction}
                submitLabel={program.status === "active" ? "Pause new referrals" : "Resume"}
                submitVariant="secondary"
                inline
              >
                {hidden}
                <input type="hidden" name="programId" value={program.id} />
                <input
                  type="hidden"
                  name="status"
                  value={program.status === "active" ? "paused" : "active"}
                />
              </ActionForm>
            )}
          </div>
        )}
        {editable && !locked && (
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">
              {program ? "Publish new terms (creates a new version)" : "Enable a referral program"}
            </h3>
            <ActionForm
              action={saveReferralProgramAction}
              submitLabel={program ? "Publish new version" : "Enable program"}
            >
              {hidden}
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Commission (%)" htmlFor="ratePercent">
                  <Input
                    name="ratePercent"
                    inputMode="decimal"
                    defaultValue={v ? v.rate_bps / 100 : 10}
                  />
                </Field>
                <Field label="Attribution window (days)" htmlFor="windowDays">
                  <Input
                    type="number"
                    name="windowDays"
                    defaultValue={v?.attribution_window_days ?? 7}
                    min={1}
                    max={60}
                  />
                </Field>
                <Field
                  label="Release after event (days)"
                  htmlFor="maturityDays"
                  hint="Platform minimum applies."
                >
                  <Input
                    type="number"
                    name="maturityDays"
                    defaultValue={v?.maturity_days_after_event ?? 7}
                  />
                </Field>
                <Field label="Enrollment" htmlFor="enrollmentMode">
                  <Select
                    name="enrollmentMode"
                    defaultValue={program?.enrollment_mode ?? "approval"}
                  >
                    <option value="approval">You approve promoters</option>
                    <option value="open">Open to any verified user</option>
                  </Select>
                </Field>
              </div>
              <fieldset className="grid gap-1 text-sm">
                <legend className="mb-1 font-medium">
                  Eligible tickets (none selected = all paid tickets)
                </legend>
                {types?.map((t) => (
                  <label key={t.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="eligible"
                      value={t.id}
                      defaultChecked={v?.eligible_ticket_type_ids?.includes(t.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {t.name}
                  </label>
                ))}
              </fieldset>
              <Field label="Program terms" htmlFor="terms">
                <Textarea
                  name="terms"
                  defaultValue={
                    v?.terms_text ??
                    "Earn commission on verified ticket sales made through your link. Commissions on refunded or disputed sales are reversed. Self-referrals and misleading promotion are not allowed."
                  }
                  rows={4}
                />
              </Field>
            </ActionForm>
          </Card>
        )}
        {program && (
          <Card>
            <CardHeader>
              <CardTitle>Promoters</CardTitle>
            </CardHeader>
            <CardContent>
              {!enrollments?.length ? (
                <p className="text-sm text-fg-muted">
                  No applications yet. Promoters find active programs on their dashboard, or share
                  your event and invite them to apply.
                </p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Promoter</Th>
                      <Th>Status</Th>
                      <Th>Orders</Th>
                      <Th>Commission</Th>
                      <Th>Decision</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((en) => {
                      const st = refStats.find((r) => r.enrollment_id === en.id);
                      return (
                        <tr key={en.id}>
                          <Td>
                            {st?.promoter_name ?? "Promoter"}
                            {en.application_note && (
                              <p className="text-xs text-fg-subtle">“{en.application_note}”</p>
                            )}
                          </Td>
                          <Td>
                            <Badge
                              tone={
                                en.status === "approved"
                                  ? "success"
                                  : en.status === "pending"
                                    ? "info"
                                    : "danger"
                              }
                            >
                              {en.status}
                            </Badge>
                            {en.rate_override_bps && (
                              <span className="ml-1 text-xs">
                                {formatBps(en.rate_override_bps)}
                              </span>
                            )}
                          </Td>
                          <Td className="tabular-nums">{st?.orders ?? 0}</Td>
                          <Td className="tabular-nums">{formatMoney(st?.commission_minor ?? 0)}</Td>
                          <Td>
                            {editable && (
                              <ActionForm
                                action={decideEnrollmentAction}
                                submitLabel="Apply"
                                submitVariant="secondary"
                                inline
                              >
                                {hidden}
                                <input type="hidden" name="enrollmentId" value={en.id} />
                                <Select
                                  name="status"
                                  className="h-9 w-32"
                                  defaultValue={en.status === "pending" ? "approved" : en.status}
                                >
                                  <option value="approved">Approve</option>
                                  <option value="rejected">Reject</option>
                                  <option value="suspended">Suspend</option>
                                  <option value="revoked">Revoke</option>
                                </Select>
                                <Input name="reason" placeholder="Reason" className="h-9 w-36" />
                                <Input
                                  name="ratePercent"
                                  placeholder="Rate %"
                                  className="h-9 w-20"
                                />
                              </ActionForm>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  async function StaffTab() {
    const [{ data: staff }, { data: members }] = await Promise.all([
      supabase.from("event_staff").select("*").eq("event_id", e!.id),
      supabase.rpc("org_members", { p_org: org.id }),
    ]);
    const eligible = (members ?? []).filter((m) =>
      ["owner", "manager", "scanner"].includes(m.role),
    );
    return (
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          Assigned staff can scan tickets for this event only. Door sales, complimentary tickets and
          re-entry overrides are separate permissions; every action is logged.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Role</Th>
              <Th>Permissions</Th>
            </tr>
          </thead>
          <tbody>
            {eligible.map((m) => {
              const st = staff?.find((x) => x.user_id === m.user_id);
              return (
                <tr key={m.user_id}>
                  <Td>
                    {m.full_name ?? m.email}
                    <p className="text-xs text-fg-subtle">{m.email}</p>
                  </Td>
                  <Td>{m.role}</Td>
                  <Td>
                    {editable ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionForm
                          action={assignStaffAction}
                          submitLabel={st ? "Update" : "Assign"}
                          submitVariant="secondary"
                          inline
                        >
                          {hidden}
                          <input type="hidden" name="userId" value={m.user_id} />
                          <label className="text-xs">
                            <input
                              type="checkbox"
                              name="door"
                              defaultChecked={st?.can_door_sell}
                              className="mr-1 accent-[var(--accent)]"
                            />
                            Door sales
                          </label>
                          <label className="text-xs">
                            <input
                              type="checkbox"
                              name="comps"
                              defaultChecked={st?.can_issue_comps}
                              className="mr-1 accent-[var(--accent)]"
                            />
                            Comps
                          </label>
                          <label className="text-xs">
                            <input
                              type="checkbox"
                              name="reentry"
                              defaultChecked={st?.can_override_reentry}
                              className="mr-1 accent-[var(--accent)]"
                            />
                            Re-entry
                          </label>
                        </ActionForm>
                        {st && (
                          <ActionForm
                            action={assignStaffAction}
                            submitLabel="Remove"
                            submitVariant="ghost"
                            inline
                          >
                            {hidden}
                            <input type="hidden" name="userId" value={m.user_id} />
                            <input type="hidden" name="remove" value="1" />
                          </ActionForm>
                        )}
                      </div>
                    ) : st ? (
                      "Assigned"
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="text-sm text-fg-muted">
          Need someone new?{" "}
          <Link className="text-accent" href={`/organizer/${org.slug}/team`}>
            Invite them as event staff
          </Link>
          .
        </p>
      </div>
    );
  }

  async function AttendeesTab() {
    if (org.role === "finance")
      return <Alert>Attendee details are available to owners and managers.</Alert>;
    const { data: tickets } = await supabase
      .from("tickets")
      .select(
        "id, public_ref, status, attendee_name, first_checked_in_at, unit_number, admission_number, order_id, ticket_type_id",
      )
      .eq("event_id", e!.id)
      .order("issued_at")
      .limit(1000);
    const orderIds = [...new Set((tickets ?? []).map((t) => t.order_id))];
    const [{ data: orders }, { data: types }] = await Promise.all([
      orderIds.length
        ? supabase
            .from("orders")
            .select("id, public_ref, buyer_name, buyer_email, channel")
            .in("id", orderIds)
        : Promise.resolve({ data: [] }),
      supabase.from("ticket_types").select("id, name").eq("event_id", e!.id),
    ]);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-fg-muted">
            {tickets?.length ?? 0} tickets ·{" "}
            {tickets?.filter((t) => t.first_checked_in_at && t.status === "valid").length ?? 0}{" "}
            checked in
          </p>
          <a className="text-sm text-accent" href={`/api/organizer/events/${e!.id}/attendees.csv`}>
            Export CSV
          </a>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ticket</Th>
              <Th>Holder</Th>
              <Th>Type</Th>
              <Th>Order</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {tickets?.map((t) => {
              const o = orders?.find((x) => x.id === t.order_id);
              return (
                <tr key={t.id}>
                  <Td className="font-mono text-xs">{t.public_ref}</Td>
                  <Td>
                    {t.attendee_name ?? o?.buyer_name}
                    <p className="text-xs text-fg-subtle">{o?.buyer_email}</p>
                  </Td>
                  <Td>{types?.find((x) => x.id === t.ticket_type_id)?.name}</Td>
                  <Td className="font-mono text-xs">
                    {o?.public_ref}
                    {o?.channel !== "online" ? ` · ${o?.channel}` : ""}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        t.status !== "valid" ? "danger" : t.first_checked_in_at ? "info" : "success"
                      }
                    >
                      {t.status !== "valid"
                        ? t.status
                        : t.first_checked_in_at
                          ? `In ${formatDateTime(t.first_checked_in_at, e!.timezone)}`
                          : "Valid"}
                    </Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    );
  }

  async function InsightsTab() {
    const { data } = await supabase.rpc("org_event_summary", { p_event: e!.id });
    const s = data as {
      views: number;
      orders_paid: number;
      online_orders: number;
      admissions_sold: number;
      capacity: number;
      gross_minor: number;
      discount_minor: number;
      platform_fee_minor: number;
      commission_minor: number;
      organizer_net_minor: number;
      door_cash_minor: number;
      refunded_minor: number;
      checked_in: number;
      valid_tickets: number;
      by_ticket_type: {
        id: string;
        name: string;
        units_sold: number;
        quantity_total: number;
        admissions_per_unit: number;
        checked_in: number;
        price_minor: number;
      }[];
    };
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Admissions sold" value={`${s.admissions_sold} / ${s.capacity}`} />
          <Stat label="Checked in" value={`${s.checked_in} / ${s.valid_tickets}`} />
          <Stat
            label="Page views"
            value={s.views}
            hint={
              s.views > 0
                ? `Online orders per 100 views: ${((s.online_orders / s.views) * 100).toFixed(1)} (views are approximate)`
                : "Views are counted per browser session"
            }
          />
          <Stat label="Paid orders" value={s.orders_paid} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Online sales economics (NGN)</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:max-w-md">
              {[
                ["Ticket sales (before discounts)", s.gross_minor],
                ["Discounts", -s.discount_minor],
                ["Project23 platform fee", -s.platform_fee_minor],
                ["Promoter commission", -s.commission_minor],
                ["Net proceeds (before refunds)", s.organizer_net_minor],
                ["Refunded to buyers", -s.refunded_minor],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between border-b border-line py-1.5">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="tabular-nums">{formatMoney(v as number)}</dd>
                </div>
              ))}
              {s.door_cash_minor > 0 && (
                <div className="flex justify-between py-1.5">
                  <dt className="text-fg-muted">
                    Door cash/POS collected by you (not via Paystack)
                  </dt>
                  <dd className="tabular-nums">{formatMoney(s.door_cash_minor)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs text-fg-subtle">
              This is sales reporting. Withdrawable balances (after holding periods and refunds) are
              on the Finance page.
            </p>
          </CardContent>
        </Card>
        <Table>
          <thead>
            <tr>
              <Th>Ticket type</Th>
              <Th>Units sold</Th>
              <Th>Admissions</Th>
              <Th>Checked in</Th>
            </tr>
          </thead>
          <tbody>
            {s.by_ticket_type.map((t) => (
              <tr key={t.id}>
                <Td>{t.name}</Td>
                <Td className="tabular-nums">
                  {t.units_sold} / {t.quantity_total}
                </Td>
                <Td className="tabular-nums">{t.units_sold * t.admissions_per_unit}</Td>
                <Td className="tabular-nums">{t.checked_in}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  async function PublishTab() {
    const ev = e!;
    const LifecycleForm = ({
      op,
      label,
      variant,
      confirm,
      reason,
    }: {
      op: string;
      label: string;
      variant?: "primary" | "secondary" | "danger";
      confirm?: string;
      reason?: boolean;
    }) => (
      <ActionForm
        action={eventLifecycleAction}
        submitLabel={label}
        submitVariant={variant}
        confirm={confirm}
      >
        {hidden}
        <input type="hidden" name="op" value={op} />
        {reason && (
          <Field label="Reason (shared with buyers)" htmlFor={`reason-${op}`}>
            <Textarea name="reason" required minLength={5} rows={2} />
          </Field>
        )}
      </ActionForm>
    );
    if (!editable) return <Alert>Publishing is managed by owners and managers.</Alert>;
    return (
      <div className="grid max-w-2xl gap-4">
        {ev.status === "draft" && (
          <Card className="p-5">
            <h3 className="font-semibold">Submit for review</h3>
            <p className="mb-4 mt-1 text-sm text-fg-muted">
              We check that details, venue and tickets are complete and the listing meets our
              guidelines. Approved events go live immediately.
            </p>
            <LifecycleForm op="submit" label="Submit for review" />
          </Card>
        )}
        {ev.status === "pending_review" && (
          <Alert title="In review">
            You&apos;ll get an email when it&apos;s approved or if changes are needed.
          </Alert>
        )}
        {ev.status === "published" && (
          <Card className="p-5">
            <h3 className="font-semibold">Pause sales</h3>
            <p className="mb-4 mt-1 text-sm text-fg-muted">
              Stops new purchases; existing tickets stay valid.
            </p>
            <LifecycleForm op="paused" label="Pause sales" variant="secondary" />
          </Card>
        )}
        {ev.status === "paused" && (
          <Card className="p-5">
            <h3 className="font-semibold">Resume sales</h3>
            <LifecycleForm op="published" label="Resume sales" />
          </Card>
        )}
        {["published", "paused"].includes(ev.status) && (
          <Card className="border-danger/40 p-5">
            <h3 className="font-semibold text-danger">Cancel event</h3>
            <p className="mb-4 mt-1 text-sm text-fg-muted">
              Stops sales, refunds every paid order automatically (including used tickets), reverses
              promoter commissions and emails all buyers. This can&apos;t be undone.
            </p>
            <LifecycleForm
              op="cancel"
              label="Cancel event and refund buyers"
              variant="danger"
              reason
              confirm="Cancel this event and refund all buyers?"
            />
          </Card>
        )}
        {["draft", "cancelled", "completed"].includes(ev.status) && (
          <Card className="p-5">
            <h3 className="font-semibold">Archive</h3>
            <LifecycleForm op="archived" label="Archive" variant="secondary" />
          </Card>
        )}
      </div>
    );
  }
}
