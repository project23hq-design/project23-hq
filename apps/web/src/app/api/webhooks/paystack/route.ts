import { NextResponse } from "next/server";
import { sha256Hex } from "@project23/domain/server";
import { paymentProvider, confirmPayment } from "@/lib/payments";
import { adminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook. Signature is verified against the RAW body before parsing.
 * Every delivery is recorded (dedupe by body hash) so duplicates/replays are no-ops; the
 * actual state change always re-verifies with the provider API and runs through the
 * idempotent database functions, so ordering of events does not matter.
 */
export async function POST(request: Request) {
  const log = logger({
    scope: "webhook.paystack",
    correlationId: request.headers.get("x-correlation-id") ?? undefined,
  });
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const provider = paymentProvider();
  const valid = provider.verifyWebhookSignature(raw, request.headers);
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* malformed */
  }
  const evt = payload
    ? provider.parseWebhook(payload)
    : { kind: "ignored" as const, type: "malformed" };
  const reference =
    evt.kind === "charge"
      ? evt.reference
      : evt.kind === "refund"
        ? evt.transactionReference
        : evt.kind === "transfer"
          ? evt.reference
          : evt.kind === "dispute"
            ? evt.transactionReference
            : null;
  const db = adminClient();
  const { data: rec } = await db.rpc("provider_event_record", {
    p_provider: provider.name,
    p_dedupe_key: sha256Hex(raw),
    p_event_type: (payload as { event?: string })?.event ?? "malformed",
    p_reference: reference ?? undefined,
    p_signature_valid: valid,
    // store only minimal fields; never full card/customer payloads
    p_payload: { event: (payload as { event?: string })?.event ?? null, reference },
  });
  if (!valid) {
    log.warn("rejected webhook with invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (!payload) return NextResponse.json({ error: "malformed" }, { status: 400 });
  const recId = (rec as { id: string | null; duplicate: boolean } | null)?.id;
  if (!recId) return NextResponse.json({ ok: true, duplicate: true });

  let outcome = "ignored";
  try {
    if (evt.kind === "charge") {
      outcome = (await confirmPayment(evt.reference, "webhook")).outcome;
    } else if (evt.kind === "refund") {
      const { data: attempt } = await db
        .from("refund_attempts")
        .select("refund_request_id")
        .eq("provider_refund_id", evt.providerRefundId)
        .maybeSingle();
      if (attempt && (evt.status === "processed" || evt.status === "failed")) {
        await db.rpc("refund_mark_result", {
          p_refund: attempt.refund_request_id,
          p_status: evt.status,
          p_provider_refund_id: evt.providerRefundId,
        });
        outcome = `refund_${evt.status}`;
      }
    } else if (evt.kind === "transfer") {
      const { data: po } = await db
        .from("payout_requests")
        .select("id, status")
        .eq("reference", evt.reference)
        .maybeSingle();
      if (po) {
        const to =
          evt.status === "success" ? "paid" : evt.status === "failed" ? "failed" : "reversed";
        const allowed =
          to === "paid" || to === "failed"
            ? ["approved", "processing"].includes(po.status)
            : po.status === "paid";
        if (allowed)
          await db.rpc("payout_transition", {
            p_payout: po.id,
            p_to: to,
            p_note: evt.reason ?? `Provider: transfer ${evt.status}`,
            p_external_ref: evt.reference,
          });
        outcome = `transfer_${evt.status}`;
      }
    } else if (evt.kind === "dispute") {
      await db.rpc("dispute_record", {
        p_provider: provider.name,
        p_dispute_id: evt.disputeId,
        p_reference: evt.transactionReference,
        p_status: evt.status,
        p_amount_minor: evt.amountMinor,
        p_reason: evt.reason ?? "",
      });
      outcome = `dispute_${evt.status}`;
    }
    await db.rpc("provider_event_mark", { p_id: recId, p_outcome: outcome });
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    log.error("webhook processing failed; provider will retry", { error: String(e) });
    await db.rpc("provider_event_mark", {
      p_id: recId,
      p_outcome: "error",
      p_error: String(e).slice(0, 500),
    });
    // Allow the provider's retry to re-run processing: the dedupe row must not block it.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
