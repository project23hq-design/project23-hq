import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { PublicEvent, PublicTicketType } from "@project23/database";

export type EventCardData = Pick<PublicEvent,
  "id" | "slug" | "title" | "starts_at" | "ends_at" | "timezone" | "venue_name" | "city_name" | "organization_name" |
  "organization_slug" | "is_first_party" | "organization_verified" | "cover_path" | "cover_alt" | "min_price_minor" |
  "max_price_minor" | "is_sold_out" | "sales_ended" | "status" | "category_slug" | "category_name">;

const CARD_COLUMNS = "id, slug, title, starts_at, ends_at, timezone, venue_name, city_name, organization_name, organization_slug, is_first_party, organization_verified, cover_path, cover_alt, min_price_minor, max_price_minor, is_sold_out, sales_ended, status, category_slug, category_name";

export interface ExploreFilters {
  q?: string; city?: string; region?: string; category?: string; when?: "today" | "weekend" | "week" | "month" | "all";
  price?: "free" | "paid" | "all"; sort?: "soonest" | "price_low" | "price_high" | "newest"; page?: number;
}

export const PAGE_SIZE = 12;

function windowFor(when: ExploreFilters["when"]): { from: string; to?: string } {
  const now = new Date();
  const lagosNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const startOfDay = new Date(now.getTime() - (lagosNow.getHours() * 3600 + lagosNow.getMinutes() * 60) * 1000);
  const day = 86_400_000;
  switch (when) {
    case "today": return { from: now.toISOString(), to: new Date(startOfDay.getTime() + day).toISOString() };
    case "weekend": {
      const dow = lagosNow.getDay(); // 0 Sun
      const toFri = (5 - dow + 7) % 7;
      const fri = new Date(startOfDay.getTime() + toFri * day + 12 * 3600_000);
      const from = dow === 0 || dow === 6 ? now : fri;
      const mon = new Date(startOfDay.getTime() + ((8 - dow) % 7 || 7) * day);
      return { from: from.toISOString(), to: mon.toISOString() };
    }
    case "week": return { from: now.toISOString(), to: new Date(now.getTime() + 7 * day).toISOString() };
    case "month": return { from: now.toISOString(), to: new Date(now.getTime() + 30 * day).toISOString() };
    default: return { from: now.toISOString() };
  }
}

export async function exploreEvents(f: ExploreFilters) {
  const supabase = await createClient();
  const page = Math.max(1, f.page ?? 1);
  let q = supabase.from("public_events").select(CARD_COLUMNS, { count: "exact" })
    .eq("visibility", "public").eq("status", "published");
  const w = windowFor(f.when);
  q = q.gte("ends_at", w.from);
  if (w.to) q = q.lt("starts_at", w.to);
  if (f.city) q = q.eq("city_slug", f.city);
  if (f.region) q = q.ilike("region_name", f.region.replace(/[^a-z ]/gi, ""));
  if (f.category) q = q.eq("category_slug", f.category);
  if (f.price === "free") q = q.eq("max_price_minor", 0);
  if (f.price === "paid") q = q.gt("max_price_minor", 0);
  if (f.q && f.q.trim().length >= 2) {
    const terms = f.q.trim().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 6);
    if (terms.length) q = q.textSearch("search_vector", terms.map((t) => `${t}:*`).join(" & "), { config: "simple" });
  }
  switch (f.sort) {
    case "price_low": q = q.order("min_price_minor", { ascending: true, nullsFirst: false }); break;
    case "price_high": q = q.order("max_price_minor", { ascending: false, nullsFirst: false }); break;
    case "newest": q = q.order("published_at", { ascending: false }); break;
    default: q = q.order("starts_at", { ascending: true });
  }
  q = q.order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error) throw error;
  return { events: (data ?? []) as EventCardData[], total: count ?? 0, page, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function homeCollections() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const base = () => supabase.from("public_events").select(CARD_COLUMNS).eq("visibility", "public").eq("status", "published").gte("ends_at", nowIso);
  const [featured, upcoming, osun, project23, trendingIds, cities, categories] = await Promise.all([
    base().eq("is_featured", true).order("featured_rank", { ascending: true, nullsFirst: false }).order("starts_at").limit(8),
    base().order("starts_at").limit(12),
    base().eq("region_name", "Osun").order("starts_at").limit(12),
    base().eq("is_first_party", true).order("starts_at").limit(8),
    supabase.from("trending_events").select("event_id, trend_rank").order("trend_rank").limit(8),
    supabase.from("cities").select("slug, name, regions(name, is_launch_region)").order("sort_order").limit(12),
    supabase.from("categories").select("slug, name, icon").order("sort_order"),
  ]);
  let trending: EventCardData[] = [];
  const ids = (trendingIds.data ?? []).map((t) => t.event_id!).filter(Boolean);
  if (ids.length) {
    const { data } = await base().in("id", ids);
    trending = ids.map((id) => (data ?? []).find((e) => e.id === id)).filter(Boolean) as EventCardData[];
  }
  return {
    featured: (featured.data ?? []) as EventCardData[], upcoming: (upcoming.data ?? []) as EventCardData[],
    osun: (osun.data ?? []) as EventCardData[], project23: (project23.data ?? []) as EventCardData[], trending,
    cities: cities.data ?? [], categories: categories.data ?? [],
  };
}

export const getPublicEvent = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: event } = await supabase.from("public_events").select("*").eq("slug", slug).maybeSingle();
  if (!event) return null;
  const [{ data: tickets }, { data: media }] = await Promise.all([
    supabase.from("public_ticket_types").select("*").eq("event_id", event.id!).order("sort_order"),
    supabase.from("public_event_media").select("*").eq("event_id", event.id!).order("sort_order"),
  ]);
  return { event, tickets: (tickets ?? []) as PublicTicketType[], media: media ?? [] };
});

export async function filterOptions() {
  const supabase = await createClient();
  const [cities, categories] = await Promise.all([
    supabase.from("cities").select("slug, name").order("sort_order"),
    supabase.from("categories").select("slug, name").order("sort_order"),
  ]);
  return { cities: cities.data ?? [], categories: categories.data ?? [] };
}
