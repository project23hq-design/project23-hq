import "server-only";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatEventRange, formatMoney } from "@project23/domain";
import { ticketQrHash, ticketQrToken } from "@project23/domain/server";
import { env } from "./env";
import { adminClient } from "./supabase/admin";

/** Compute deterministic QR credentials for an order's tickets and store only their hashes. Idempotent. */
export async function issueTicketCredentials(orderId: string) {
  const db = adminClient();
  const { data: tickets, error } = await db.from("tickets").select("id, token_version, qr_hash, status").eq("order_id", orderId);
  if (error) throw error;
  const items = (tickets ?? [])
    .filter((t) => t.status === "valid")
    .map((t) => ({ id: t.id, version: t.token_version, hash: ticketQrHash(ticketQrToken(t.id, t.token_version, env().TICKET_QR_SECRET)) }))
    .filter((x) => (tickets ?? []).find((t) => t.id === x.id)?.qr_hash !== x.hash);
  if (items.length === 0) return 0;
  const { data, error: e2 } = await db.rpc("tickets_set_qr_hashes", { p_items: items });
  if (e2) throw e2;
  return data as number;
}

export function qrTokenFor(ticket: { id: string; token_version: number }) {
  return ticketQrToken(ticket.id, ticket.token_version, env().TICKET_QR_SECRET);
}

export async function qrDataUrl(token: string) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#0b0b0d", light: "#ffffff" } });
}

export interface TicketPdfData {
  ticket: { id: string; public_ref: string; token_version: number; unit_number: number; admission_number: number; status: string; attendee_name: string | null };
  ticketTypeName: string;
  admissionsPerUnit: number;
  order: { public_ref: string; buyer_name: string };
  event: { title: string; starts_at: string; ends_at: string; timezone: string; venue_name: string | null; address_line: string | null; city_name?: string | null; organization_name: string; entry_rules: string | null };
  pricePaidMinor?: number;
}

/** Printable A6-style ticket PDF. Generated on demand; never stored in a public bucket. */
export async function renderTicketPdf(tickets: TicketPdfData[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Project23 tickets");
  pdf.setProducer("Project23");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.05, 0.05, 0.06);
  const muted = rgb(0.38, 0.38, 0.42);
  const accent = rgb(0.96, 0.62, 0.11);
  // Standard fonts are WinAnsi: keep text ASCII-safe (₦ -> NGN).
  const safe = (s: string) => s.replace(/₦/g, "NGN ").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "");

  for (const t of tickets) {
    const page = pdf.addPage([420, 640]);
    const { width } = page.getSize();
    page.drawRectangle({ x: 0, y: 590, width, height: 50, color: ink });
    page.drawText("PROJECT23", { x: 24, y: 608, size: 16, font: bold, color: accent });
    page.drawText("ADMIT ONE", { x: width - 110, y: 608, size: 12, font: bold, color: rgb(1, 1, 1) });

    let y = 555;
    const wrap = (text: string, size: number, font = regular, color = ink, max = 372) => {
      const words = safe(text).split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > max) {
          page.drawText(line, { x: 24, y, size, font, color });
          y -= size + 5;
          line = w;
        } else line = test;
      }
      if (line) { page.drawText(line, { x: 24, y, size, font, color }); y -= size + 8; }
    };
    wrap(t.event.title, 20, bold);
    wrap(formatEventRange(t.event.starts_at, t.event.ends_at, t.event.timezone), 10, regular, muted);
    wrap([t.event.venue_name, t.event.address_line, t.event.city_name].filter(Boolean).join(", "), 10, regular, muted);
    y -= 4;
    wrap(`${t.ticketTypeName}${t.admissionsPerUnit > 1 ? ` - seat ${t.ticket.admission_number} of ${t.admissionsPerUnit} (unit ${t.ticket.unit_number})` : ""}`, 12, bold);
    if (t.ticket.attendee_name) wrap(`Attendee: ${t.ticket.attendee_name}`, 10);
    wrap(`Purchased by: ${t.order.buyer_name}`, 10, regular, muted);

    if (t.ticket.status === "valid") {
      const token = qrTokenFor(t.ticket);
      const png = await QRCode.toBuffer(token, { errorCorrectionLevel: "M", margin: 1, width: 600 });
      const img = await pdf.embedPng(png);
      page.drawImage(img, { x: (width - 220) / 2, y: 120, width: 220, height: 220 });
    } else {
      page.drawText(safe(`THIS TICKET IS ${t.ticket.status.toUpperCase()}`), { x: 60, y: 220, size: 18, font: bold, color: rgb(0.8, 0.1, 0.1) });
    }
    page.drawText(safe(`Ticket ${t.ticket.public_ref}`), { x: 24, y: 92, size: 12, font: bold, color: ink });
    page.drawText(safe(`Order ${t.order.public_ref} - ${t.event.organization_name}`), { x: 24, y: 76, size: 9, font: regular, color: muted });
    if (t.pricePaidMinor !== undefined) page.drawText(safe(`Price: ${formatMoney(t.pricePaidMinor)}`), { x: 24, y: 62, size: 9, font: regular, color: muted });
    page.drawText("Each QR admits one person once. Keep it private; screenshots can be copied.", { x: 24, y: 36, size: 8, font: regular, color: muted });
  }
  return pdf.save();
}
