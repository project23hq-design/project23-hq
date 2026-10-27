import "server-only";
import { formatEventRange, formatMoney } from "@project23/domain";
import { randomToken, sha256Hex } from "@project23/domain/server";
import { adminClient } from "../supabase/admin";
import { env } from "../env";
import { deliverEmail } from "../email";
import { esc, layout, text } from "../email/templates";
import { issueTicketCredentials, renderTicketPdf, type TicketPdfData } from "../tickets";
import { confirmPayment, paymentProvider } from "../payments";
import { logger } from "../log";

type PayloadKey = "order_id" | "ticket_id" | "refund_id" | "event_id" | "reference" | "recipient_id" | "payout_id" | "status" | "batch_id" | "resend";
type Payload = Record<PayloadKey, string>;
type Handler = (payload: Payload, jobId: number) => Promise<void>;

const db = () => adminClient();
const appUrl = () => env().NEXT_PUBLIC_APP_URL;

async function loadOrderBundle(orderId: string) {
  const { data: order, error } = await db().from("orders").select("*").eq("id", orderId).single();
  if (error || !order) throw new Error(`order ${orderId} not found`);
  const { data: event } = await db().from("events")
    .select("id, title, slug, starts_at, ends_at, timezone, venue_name, address_line, entry_rules, organization_id, cities(name), organizations(name)")
    .eq("id", order.event_id).single();
  const { data: items } = await db().from("order_items").select("*").eq("order_id", orderId);
  const { data: tickets } = await db().from("tickets").select("*").eq("order_id", orderId).order("unit_number").order("admission_number");
  return { order, event: event!, items: items ?? [], tickets: tickets ?? [] };
}

/** Long-lived per-order access link (hashed at rest). */
async function orderAccessLink(orderId: string, email: string) {
  const token = randomToken(32);
  await db().rpc("access_token_create", { p_hash: sha256Hex(token), p_purpose: "order_link", p_order: orderId, p_email: email, p_minutes: 60 * 24 * 120 });
  return `${appUrl()}/orders/access/${token}`;
}

export async function buildTicketPdfData(orderId: string): Promise<TicketPdfData[]> {
  const { order, event, items, tickets } = await loadOrderBundle(orderId);
  const ev = event as unknown as { title: string; starts_at: string; ends_at: string; timezone: string; venue_name: string | null; address_line: string | null; entry_rules: string | null; cities: { name: string } | null; organizations: { name: string } | null };
  return tickets.map((t) => {
    const item = items.find((i) => i.id === t.order_item_id)!;
    return {
      ticket: t, ticketTypeName: item.ticket_type_name, admissionsPerUnit: item.admissions_per_unit,
      order: { public_ref: order.public_ref, buyer_name: order.buyer_name },
      event: { ...ev, city_name: ev.cities?.name, organization_name: ev.organizations?.name ?? "" },
      pricePaidMinor: Math.floor((item.line_net_minor / item.quantity) / item.admissions_per_unit),
    };
  });
}

const handlers: Record<string, Handler> = {
  async "order.deliver"({ order_id, resend }) {
    await issueTicketCredentials(order_id);
    const { order, event, items, tickets } = await loadOrderBundle(order_id);
    if (order.buyer_email.endsWith(".invalid")) return; // walk-in door sale without an email address
    const ev = event as unknown as { title: string; starts_at: string; ends_at: string; timezone: string; venue_name: string | null; address_line: string | null };
    const link = await orderAccessLink(order.id, order.buyer_email);
    const pdf = await renderTicketPdf(await buildTicketPdfData(order_id));
    const rows = items.map((i) => `<li>${i.quantity} × ${esc(i.ticket_type_name)}${i.admissions_per_unit > 1 ? ` (${i.admissions_per_unit} admissions each)` : ""}</li>`).join("");
    const isPaid = order.total_minor > 0;
    await deliverEmail(`order.deliver:${order.id}${resend ? `:resend:${resend}` : ""}`, "order_tickets", {
      to: order.buyer_email,
      subject: `Your tickets: ${ev.title} (${order.public_ref})`,
      html: layout({
        preheader: `${tickets.length} ticket(s) for ${ev.title}`,
        title: `You're going to ${ev.title}`,
        body: `<p>Hi ${esc(order.buyer_name)},</p><p>Your order <strong>${order.public_ref}</strong> is confirmed.</p>
          <p><strong>${esc(formatEventRange(ev.starts_at, ev.ends_at, ev.timezone))}</strong><br>${esc([ev.venue_name, ev.address_line].filter(Boolean).join(", "))}</p>
          <ul>${rows}</ul><p>${isPaid ? `Total paid: <strong>${formatMoney(order.total_minor)}</strong>` : "This was a free order."}</p>
          <p>Your ${tickets.length} ticket(s) are attached as a PDF. Each QR code admits one person once.</p>`,
        cta: { label: "View my tickets", url: link },
      }),
      text: text(`Your order ${order.public_ref} for ${ev.title} is confirmed.`, formatEventRange(ev.starts_at, ev.ends_at, ev.timezone), `View tickets: ${link}`),
      attachments: [{ filename: `project23-${order.public_ref}.pdf`, content: Buffer.from(pdf) }],
    }, order.id);
  },

  async "ticket.reissued"({ ticket_id }) {
    const { data: t } = await db().from("tickets").select("order_id, token_version").eq("id", ticket_id).single();
    if (!t) return;
    await issueTicketCredentials(t.order_id);
    const { order } = await loadOrderBundle(t.order_id);
    const link = await orderAccessLink(order.id, order.buyer_email);
    await deliverEmail(`ticket.reissued:${ticket_id}:${t.token_version}`, "ticket_reissued", {
      to: order.buyer_email, subject: `Updated ticket for order ${order.public_ref}`,
      html: layout({ preheader: "A ticket was reissued", title: "A ticket on your order was reissued", body: "<p>The previous QR code for one of your tickets no longer works. Use the link below to get the new one.</p>", cta: { label: "View tickets", url: link } }),
      text: `A ticket on order ${order.public_ref} was reissued. New ticket: ${link}`,
    }, order.id);
  },

  async "order.exception_notice"({ order_id }) {
    const { order, event } = await loadOrderBundle(order_id);
    logger({ scope: "ops.alert" }).error("fulfillment exception — payment captured without tickets", { orderId: order_id, reason: order.exception_reason });
    await deliverEmail(`order.exception:${order_id}`, "order_exception", {
      to: order.buyer_email, subject: `We couldn't complete your order ${order.public_ref}`,
      html: layout({ preheader: "Your payment will be refunded", title: "Your tickets were no longer available",
        body: `<p>Hi ${esc(order.buyer_name)}, your payment for <strong>${esc((event as { title: string }).title)}</strong> arrived after the tickets you selected were no longer available, so no tickets were issued. A full refund of <strong>${formatMoney(order.total_minor)}</strong> has been started automatically. Refunds usually reach your account within a few working days depending on your bank.</p>` }),
      text: `Your payment for order ${order.public_ref} arrived after tickets became unavailable. A full refund has been started.`,
    }, order_id);
  },

  async "refund.process"({ refund_id }) {
    const { data: rr } = await db().from("refund_requests").select("*, payment_attempts(reference, provider)").eq("id", refund_id).single();
    if (!rr || rr.status !== "processing") return;
    const attempt = rr.payment_attempts as unknown as { reference: string; provider: string } | null;
    if (!attempt) throw new Error("refund has no captured payment attempt");
    const res = await paymentProvider().refund({ transactionReference: attempt.reference, amountMinor: rr.amount_minor });
    await db().rpc("refund_mark_result", {
      p_refund: refund_id, p_status: res.status === "processed" ? "processed" : res.status === "failed" ? "failed" : "processing",
      p_provider_refund_id: res.providerRefundId,
    });
  },

  async "refund.completed_notice"({ refund_id }) {
    const { data: rr } = await db().from("refund_requests").select("amount_minor, order_id, kind").eq("id", refund_id).single();
    if (!rr || rr.kind === "exception") return;
    const { order } = await loadOrderBundle(rr.order_id);
    await deliverEmail(`refund.completed:${refund_id}`, "refund_completed", {
      to: order.buyer_email, subject: `Refund for order ${order.public_ref}`,
      html: layout({ preheader: "Your refund has been processed", title: "Your refund has been processed",
        body: `<p>We've processed a refund of <strong>${formatMoney(rr.amount_minor)}</strong> for order ${order.public_ref}. The refunded tickets are no longer valid. Depending on your bank, funds can take several working days to appear.</p>` }),
      text: `Refund of ${formatMoney(rr.amount_minor)} processed for order ${order.public_ref}.`,
    }, order.id);
  },

  async "event.cancelled"({ event_id }) {
    const { data: ev } = await db().from("events").select("title, cancellation_reason").eq("id", event_id).single();
    const { data: orders } = await db().from("orders").select("id, buyer_email, buyer_name, public_ref").eq("event_id", event_id)
      .in("status", ["paid", "partially_refunded", "refunded"]);
    for (const o of orders ?? []) {
      await deliverEmail(`event.cancelled:${event_id}:${o.id}`, "event_cancelled", {
        to: o.buyer_email, subject: `Cancelled: ${ev!.title}`,
        html: layout({ preheader: "This event has been cancelled", title: `${ev!.title} has been cancelled`,
          body: `<p>Hi ${esc(o.buyer_name)}, the organizer cancelled this event${ev!.cancellation_reason ? `: “${esc(ev!.cancellation_reason)}”` : ""}.</p><p>Paid orders are refunded automatically to the original payment method. You'll get a separate email when your refund (order ${o.public_ref}) is processed.</p>` }),
        text: `${ev!.title} was cancelled. Refunds for order ${o.public_ref} are being processed automatically.`,
      }, o.id);
    }
  },

  async "event.material_change"({ event_id }) {
    const { data: ev } = await db().from("events").select("title, slug, starts_at, ends_at, timezone, venue_name, address_line").eq("id", event_id).single();
    if (!ev) return;
    const { data: orders } = await db().from("orders").select("id, buyer_email, buyer_name").eq("event_id", event_id).in("status", ["paid", "partially_refunded"]);
    const stamp = new Date(ev.starts_at).getTime();
    for (const o of orders ?? []) {
      await deliverEmail(`event.change:${event_id}:${o.id}:${stamp}:${ev.venue_name}`, "event_changed", {
        to: o.buyer_email, subject: `Update: ${ev.title} details changed`,
        html: layout({ preheader: "Important event update", title: "Event details have changed",
          body: `<p>Hi ${esc(o.buyer_name)}, the organizer updated <strong>${esc(ev.title)}</strong>:</p><p><strong>${esc(formatEventRange(ev.starts_at, ev.ends_at, ev.timezone))}</strong><br>${esc([ev.venue_name, ev.address_line].filter(Boolean).join(", "))}</p><p>Your tickets remain valid. If you can no longer attend, contact the organizer about a refund.</p>`,
          cta: { label: "View event", url: `${appUrl()}/events/${ev.slug}` } }),
        text: `${ev.title} details changed: ${formatEventRange(ev.starts_at, ev.ends_at, ev.timezone)}`,
      }, o.id);
    }
  },

  async "event.moderation_feedback"({ event_id }) {
    const { data: ev } = await db().from("events").select("title, moderation_status, moderation_notes, organization_id, organizations(slug)").eq("id", event_id).single();
    if (!ev) return;
    const { data: owners } = await db().from("memberships").select("user_id").eq("organization_id", ev.organization_id).in("role", ["owner", "manager"]);
    for (const m of owners ?? []) {
      const { data: u } = await db().auth.admin.getUserById(m.user_id);
      if (!u.user?.email) continue;
      await deliverEmail(`moderation:${event_id}:${m.user_id}:${ev.moderation_status}:${sha256Hex(ev.moderation_notes ?? "").slice(0, 8)}`, "moderation_feedback", {
        to: u.user.email, subject: `Review update: ${ev.title}`,
        html: layout({ preheader: "Moderation feedback", title: "Your event needs changes",
          body: `<p>Our team reviewed <strong>${esc(ev.title)}</strong> and returned it with this feedback:</p><blockquote>${esc(ev.moderation_notes ?? "")}</blockquote><p>Update the event and resubmit when ready.</p>`,
          cta: { label: "Open event", url: `${appUrl()}/organizer/${(ev.organizations as unknown as { slug: string }).slug}/events/${event_id}` } }),
        text: `Feedback on ${ev.title}: ${ev.moderation_notes}`,
      });
    }
  },

  async "payment.reconcile"({ reference }) {
    await confirmPayment(reference, "reconcile");
  },

  async "payout_recipient.verify"({ recipient_id }) {
    const { data: r } = await db().from("payout_recipients").select("*").eq("id", recipient_id).single();
    if (!r || r.status !== "pending_verification") return;
    const { data: acct } = await db().rpc("payout_recipient_secret", { p_recipient: recipient_id });
    if (!acct) throw new Error("missing account number");
    const p = paymentProvider();
    const resolved = await p.resolveAccount({ accountNumber: acct as string, bankCode: r.bank_code });
    if (!resolved) throw new Error("account could not be resolved (will retry; check bank code/number)");
    const { recipientCode } = await p.createRecipient({ name: resolved.accountName, accountNumber: acct as string, bankCode: r.bank_code });
    await db().rpc("payout_recipient_mark_verified", { p_recipient: recipient_id, p_recipient_code: recipientCode, p_resolved_name: resolved.accountName });
  },

  async "payout_recipient.changed_notice"({ recipient_id }) {
    const { data: r } = await db().from("payout_recipients").select("*").eq("id", recipient_id).single();
    if (!r) return;
    const userIds: string[] = r.user_id ? [r.user_id]
      : ((await db().from("memberships").select("user_id").eq("organization_id", r.organization_id!).eq("role", "owner")).data ?? []).map((m) => m.user_id);
    for (const uid of userIds) {
      const { data: u } = await db().auth.admin.getUserById(uid);
      if (!u.user?.email) continue;
      await deliverEmail(`recipient.changed:${recipient_id}:${uid}`, "security_bank_changed", {
        to: u.user.email, subject: "Security alert: payout bank account changed",
        html: layout({ preheader: "Your payout account was changed", title: "Payout bank account changed",
          body: `<p>The payout account was changed to <strong>${esc(r.bank_name)} ••••${r.account_last4}</strong>. If you didn't make this change, contact Project23 support immediately.</p>` }),
        text: `Payout account changed to ${r.bank_name} ****${r.account_last4}. If this wasn't you, contact support.`,
      });
    }
  },

  async "payout.transfer"({ payout_id }) {
    const { data: po } = await db().from("payout_requests").select("*, payout_recipients(provider_recipient_code)").eq("id", payout_id).single();
    if (!po || !["approved", "processing"].includes(po.status)) return;
    const p = paymentProvider();
    // Reconcile before (re)trying: an earlier ambiguous attempt may have succeeded.
    const existing = await p.verifyTransfer(po.reference);
    if (existing.status === "success") { await db().rpc("payout_transition", { p_payout: payout_id, p_to: "paid", p_external_ref: po.reference }); return; }
    if (existing.status === "pending") {
      if (po.status === "approved") await db().rpc("payout_transition", { p_payout: payout_id, p_to: "processing" });
      throw new Error("transfer pending at provider; will re-check");
    }
    if (existing.status === "failed" || existing.status === "reversed") {
      await db().rpc("payout_transition", { p_payout: payout_id, p_to: "failed", p_note: `Provider reported ${existing.status}` });
      return;
    }
    const recipientCode = (po.payout_recipients as unknown as { provider_recipient_code: string | null })?.provider_recipient_code;
    if (!recipientCode) throw new Error("recipient not verified with provider");
    if (po.status === "approved") await db().rpc("payout_transition", { p_payout: payout_id, p_to: "processing" });
    const res = await p.transfer({ amountMinor: po.amount_minor, recipientCode, reference: po.reference, reason: `Project23 payout ${po.reference}` });
    if (res.status === "success") await db().rpc("payout_transition", { p_payout: payout_id, p_to: "paid", p_external_ref: res.transferCode ?? po.reference });
    else if (res.status === "failed") await db().rpc("payout_transition", { p_payout: payout_id, p_to: "failed", p_note: "Provider rejected transfer" });
    else throw new Error(`transfer status ${res.status}; awaiting webhook or re-check`);
  },

  async "payout.status_notice"({ payout_id, status }) {
    const { data: po } = await db().from("payout_requests").select("*").eq("id", payout_id).single();
    if (!po) return;
    const { data: u } = await db().auth.admin.getUserById(po.requested_by);
    if (!u.user?.email) return;
    const copy: Record<string, string> = {
      approved: "was approved and will be sent shortly", rejected: "was not approved", processing: "is being processed",
      paid: "has been paid", failed: "failed and the amount was returned to your available balance", reversed: "was reversed by the bank",
      cancelled: "was cancelled",
    };
    if (!copy[status!]) return;
    await deliverEmail(`payout.notice:${payout_id}:${status}`, "payout_status", {
      to: u.user.email, subject: `Payout ${po.reference}: ${status}`,
      html: layout({ preheader: `Payout ${status}`, title: `Payout ${po.reference}`, body: `<p>Your withdrawal of <strong>${formatMoney(po.amount_minor)}</strong> ${copy[status!]}.${po.review_note ? ` Note: ${esc(po.review_note)}` : ""}</p>` }),
      text: `Payout ${po.reference} of ${formatMoney(po.amount_minor)} ${copy[status!]}.`,
    });
  },
};

export async function runJob(kind: string, payload: Record<string, string>, jobId: number) {
  const h = handlers[kind];
  if (!h) throw new Error(`no handler for job kind ${kind}`);
  await h(payload as Payload, jobId);
}
