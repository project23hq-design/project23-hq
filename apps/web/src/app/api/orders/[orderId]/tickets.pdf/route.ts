import { NextResponse } from "next/server";
import { loadOrderForViewer } from "@/lib/orders";
import { buildTicketPdfData } from "@/lib/jobs/handlers";
import { renderTicketPdf } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bundle = await loadOrderForViewer(orderId);
  if (!bundle || bundle.tickets.length === 0) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderTicketPdf(await buildTicketPdfData(orderId));
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="project23-${bundle.order.public_ref}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
