import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Admin-only export; authorization enforced by RLS (is_platform_admin requires aal2). */
export async function GET() {
  const supabase = await createClient();
  const { data: roles } = await supabase.rpc("my_platform_roles");
  if (!roles?.length) return new NextResponse("Forbidden", { status: 403 });
  const { data, error } = await supabase
    .from("orders")
    .select(
      "public_ref, created_at, paid_at, status, channel, payment_method, currency, subtotal_minor, discount_minor, buyer_fee_minor, total_minor, platform_fee_minor, promoter_commission_minor, organizer_net_minor, organization_id, event_id",
    )
    .order("created_at", { ascending: false })
    .limit(50000);
  if (error) return new NextResponse("Forbidden", { status: 403 });
  const head = Object.keys(data?.[0] ?? { public_ref: "" });
  const rows = [
    head.join(","),
    ...(data ?? []).map((r) => head.map((k) => cell((r as Record<string, unknown>)[k])).join(",")),
  ];
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orders.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
