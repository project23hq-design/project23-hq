"use server";
import { engineCode, engineErrorMessage } from "@project23/domain";
import { ticketQrHash } from "@project23/domain/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/security";

export type ScanResult = {
  result: "admitted" | "reentry" | "already_checked_in" | "invalid" | "wrong_event" | "void" | "refunded" | "event_not_active" | "error";
  ticket_id?: string; ticket_ref?: string; ticket_type?: string; attendee_name?: string | null; admission?: number;
  admissions_in_unit?: number; first_checked_in_at?: string; check_in_count?: number; message?: string;
};

const clean = (s: string) => s.trim().slice(0, 200);

/** The raw QR token never leaves the server: we hash it and the database matches the hash. */
export async function scanAction(eventId: string, token: string, deviceId: string): Promise<ScanResult> {
  const { supabase, user } = await requireUser("/gate");
  if (!(await rateLimit("scan", 240, 60, user.id))) return { result: "error", message: engineErrorMessage("rate_limited") };
  if (!/^P23T\.[A-Za-z0-9_-]{20,64}$/.test(clean(token))) return { result: "invalid" };
  const { data, error } = await supabase.rpc("gate_check_in", { p_event: eventId, p_qr_hash: ticketQrHash(clean(token)), p_device: deviceId.slice(0, 64) });
  if (error) return { result: "error", message: engineErrorMessage(engineCode(error)) };
  return data as ScanResult;
}

export async function admitTicketAction(eventId: string, ticketId: string, deviceId: string): Promise<ScanResult> {
  const { supabase, user } = await requireUser("/gate");
  if (!(await rateLimit("scan", 240, 60, user.id))) return { result: "error", message: engineErrorMessage("rate_limited") };
  const { data, error } = await supabase.rpc("gate_check_in_ticket", { p_event: eventId, p_ticket: ticketId, p_device: deviceId.slice(0, 64) });
  if (error) return { result: "error", message: engineErrorMessage(engineCode(error)) };
  return data as ScanResult;
}

export async function reentryAction(eventId: string, ticketId: string, reason: string, deviceId: string): Promise<ScanResult> {
  const { supabase } = await requireUser("/gate");
  const { data, error } = await supabase.rpc("gate_reentry", { p_event: eventId, p_ticket: ticketId, p_reason: reason, p_device: deviceId.slice(0, 64) });
  if (error) return { result: "error", message: engineErrorMessage(engineCode(error)) };
  return data as ScanResult;
}

export async function lookupAction(eventId: string, query: string) {
  const { supabase, user } = await requireUser("/gate");
  // Manual search is deliberately limited and rate limited (it reveals names).
  if (!(await rateLimit("gate-lookup", 30, 60, user.id))) return { error: engineErrorMessage("rate_limited"), rows: [] };
  const { data, error } = await supabase.rpc("gate_lookup", { p_event: eventId, p_query: clean(query) });
  if (error) return { error: engineErrorMessage(engineCode(error)), rows: [] };
  return { rows: data as { ticket_id: string; ticket_ref: string; ticket_type: string; status: string; holder_name: string; first_checked_in_at: string | null; admission_number: number }[] };
}

export async function statsAction(eventId: string) {
  const { supabase } = await requireUser("/gate");
  const { data } = await supabase.rpc("gate_event_stats", { p_event: eventId });
  return data as { valid: number; checked_in: number } | null;
}

export async function doorSaleAction(eventId: string, input: { ticketTypeId: string; quantity: number; method: "cash" | "pos_external"; name: string; email: string; idem: string }) {
  const { supabase } = await requireUser("/gate");
  const email = input.email.trim().toLowerCase() || `door+${input.idem.slice(0, 8)}@walkin.project23.invalid`;
  const { data, error } = await supabase.rpc("door_sale", {
    p_event: eventId, p_items: [{ ticket_type_id: input.ticketTypeId, quantity: input.quantity }],
    p_buyer: { name: input.name.trim() || "Walk-in guest", email }, p_method: input.method, p_idempotency_key: input.idem,
  });
  if (error) return { error: engineErrorMessage(engineCode(error)) + (error.details ? ` (${error.details})` : "") };
  return { ok: true as const, order: data as { order_id: string; public_ref: string; total_minor: number } };
}

export async function compAction(eventId: string, input: { ticketTypeId: string; quantity: number; name: string; email: string; reason: string; idem: string }) {
  const { supabase } = await requireUser("/gate");
  const { data, error } = await supabase.rpc("issue_complimentary", {
    p_event: eventId, p_ticket_type: input.ticketTypeId, p_quantity: input.quantity,
    p_recipient: { name: input.name.trim(), email: input.email.trim().toLowerCase() }, p_reason: input.reason, p_idempotency_key: input.idem,
  });
  if (error) return { error: engineErrorMessage(engineCode(error)) + (error.details ? ` (${error.details})` : "") };
  return { ok: true as const, order: data as { order_id: string; public_ref: string } };
}
