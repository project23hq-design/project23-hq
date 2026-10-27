import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadOrderForViewer } from "@/lib/orders";
import { buildTicketPdfData } from "@/lib/jobs/handlers";
import { renderTicketPdf } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private: only viewers who can see the parent order get the PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return new NextResponse("Not found", { status: 404 });
  const { data: t } = await adminClient()
    .from("tickets")
    .select("order_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t || !(await loadOrderForViewer(t.order_id)))
    return new NextResponse("Not found", { status: 404 });
  const all = await buildTicketPdfData(t.order_id);
  const pdf = await renderTicketPdf(all.filter((x) => x.ticket.id === ticketId));
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ticket-${ticketId.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
