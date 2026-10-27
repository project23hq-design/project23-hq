import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const [{ data: events }, { data: orgs }] = await Promise.all([
    supabase
      .from("public_events")
      .select("slug, published_at")
      .eq("visibility", "public")
      .in("status", ["published", "paused"])
      .limit(5000),
    supabase.from("public_organizations").select("slug, created_at").limit(5000),
  ]);
  const statics = [
    "",
    "/explore",
    "/project23",
    "/about",
    "/help",
    "/contact",
    "/legal/terms",
    "/legal/privacy",
    "/legal/refund-policy",
    "/legal/organizer-terms",
  ];
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const })),
    ...(events ?? []).map((e) => ({
      url: `${base}/events/${e.slug}`,
      lastModified: e.published_at ?? undefined,
    })),
    ...(orgs ?? []).map((o) => ({ url: `${base}/organizers/${o.slug}` })),
  ];
}
