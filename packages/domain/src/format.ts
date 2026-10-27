export const DEFAULT_TIMEZONE = "Africa/Lagos";

/** "Sat, 14 Nov · 7:00 PM" in the event's own timezone. */
export function formatEventDate(startsAt: string | Date, timezone = DEFAULT_TIMEZONE): string {
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(d);
  const time = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone })
    .format(d)
    .toUpperCase();
  return `${day} · ${time}`;
}

export function formatEventRange(startsAt: string | Date, endsAt: string | Date, timezone = DEFAULT_TIMEZONE): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const dayFmt = new Intl.DateTimeFormat("en-NG", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: timezone,
  });
  const timeFmt = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone });
  const sameDay = dayFmt.format(s) === dayFmt.format(e);
  const tzLabel = timezone === "Africa/Lagos" ? "WAT" : timezone;
  return sameDay
    ? `${dayFmt.format(s)}, ${timeFmt.format(s)} – ${timeFmt.format(e)} ${tzLabel}`
    : `${dayFmt.format(s)}, ${timeFmt.format(s)} – ${dayFmt.format(e)}, ${timeFmt.format(e)} ${tzLabel}`;
}

export function formatDateTime(at: string | Date, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone,
  }).format(new Date(at));
}

/** Calendar day key (YYYY-MM-DD) of an instant in a timezone. */
export function dayKey(at: string | Date, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(new Date(at));
}

/**
 * Convert a wall-clock "YYYY-MM-DDTHH:mm" in an IANA timezone to a UTC ISO string.
 * Works for fixed and DST zones by correcting with the zone's offset at that instant.
 */
export function zonedLocalToUtc(local: string, timezone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new RangeError("Expected YYYY-MM-DDTHH:mm");
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(guess), timezone);
  const first = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(new Date(first), timezone);
  return new Date(guess - offset2 * 60_000).toISOString();
}

export function utcToZonedLocal(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function tzOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Normalize Nigerian numbers to E.164 (+234…). Accepts 0803…, 234803…, +234 803…. */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let national: string | null = null;
  if (/^\+234\d{10}$/.test(digits)) national = digits.slice(4);
  else if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) national = digits;
  if (!national || !/^[789]\d{9}$/.test(national)) return null;
  return `+234${national}`;
}

export function slugify(input: string, max = 80): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export type TicketAvailability = "available" | "sold_out" | "sales_ended" | "not_started" | "locked" | "on_hold" | "unavailable";

export function availabilityLabel(a: TicketAvailability, opensAfter?: string | null): string {
  switch (a) {
    case "available": return "Available";
    case "sold_out": return "Sold out";
    case "sales_ended": return "Sales ended";
    case "not_started": return "Not on sale yet";
    case "locked": return opensAfter ? `Opens after ${opensAfter}` : "Not on sale yet";
    case "on_hold": return "All remaining tickets are in checkout — check back shortly";
    default: return "Unavailable";
  }
}

/** Honest card price label from public projection fields. */
export function priceLabel(e: {
  min_price_minor: number | null; max_price_minor: number | null; is_sold_out: boolean; sales_ended: boolean; status: string;
}, format: (minor: number) => string): string {
  if (e.status === "cancelled") return "Cancelled";
  if (e.status === "completed") return "Ended";
  if (e.sales_ended) return "Sales ended";
  if (e.is_sold_out) return "Sold out";
  if (e.min_price_minor === null) return "Tickets coming soon";
  if (e.max_price_minor === 0) return "Free";
  if (e.min_price_minor === 0) return "Free & paid tickets";
  return e.min_price_minor === e.max_price_minor ? format(e.min_price_minor) : `From ${format(e.min_price_minor)}`;
}
