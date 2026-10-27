import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ics = (d: string) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("public_events")
    .select("id, slug, title, summary, starts_at, ends_at, venue_name, address_line, city_name")
    .eq("id", eventId)
    .maybeSingle();
  if (!e) return new NextResponse("Not found", { status: 404 });
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/events/${e.slug}`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project23//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@project23`,
    `DTSTAMP:${ics(new Date().toISOString())}`,
    `DTSTART:${ics(e.starts_at!)}`,
    `DTEND:${ics(e.ends_at!)}`,
    `SUMMARY:${esc(e.title!)}`,
    `DESCRIPTION:${esc(`${e.summary ?? ""}\n${url}`)}`,
    `LOCATION:${esc([e.venue_name, e.address_line, e.city_name].filter(Boolean).join(", "))}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.slug}.ics"`,
    },
  });
}
