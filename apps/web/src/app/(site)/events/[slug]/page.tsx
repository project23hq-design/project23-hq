import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accessibility, CalendarPlus, Clock, Globe2, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { formatEventRange, formatMoney } from "@project23/domain";
import { Alert, Badge, Button } from "@project23/ui";
import { getPublicEvent } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { readReferrals } from "@/lib/security";
import { publicStorageUrl } from "@/lib/supabase/storage";
import { EventPoster } from "@/components/poster";
import { OrganizerMark } from "@/components/event-card";
import { TicketSelector, type SelectorTicket } from "./ticket-selector";
import { FavoriteButton, ViewBeacon } from "./client-bits";

type Params = Promise<{ slug: string }>;

const REFUND_COPY: Record<string, string> = {
  no_refunds: "No refunds unless the event is cancelled.",
  until_24h: "Refunds available until 24 hours before the event starts.",
  until_7d: "Refunds available until 7 days before the event starts.",
  custom: "See the organizer's refund terms below.",
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicEvent(slug);
  if (!data) return { title: "Event not found" };
  const e = data.event;
  const img = publicStorageUrl(e.cover_path);
  return {
    title: e.title!,
    description: e.summary ?? `${e.title} — ${formatEventRange(e.starts_at!, e.ends_at!, e.timezone!)}${e.city_name ? ` in ${e.city_name}` : ""}.`,
    alternates: { canonical: `/events/${e.slug}` },
    robots: e.visibility === "unlisted" ? { index: false, follow: false } : undefined,
    openGraph: { title: e.title!, description: e.summary ?? undefined, type: "website", images: img ? [{ url: img }] : undefined },
  };
}

export default async function EventPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getPublicEvent(slug);
  if (!data) notFound();
  const { event: e, tickets } = data;
  const { user, supabase } = await getSession();
  let favorite = false;
  let defaultBuyer: { name?: string; email?: string; phone?: string } | undefined;
  if (user) {
    const [{ data: fav }, { data: profile }] = await Promise.all([
      supabase.from("favorites").select("event_id").eq("event_id", e.id!).maybeSingle(),
      supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    ]);
    favorite = !!fav;
    defaultBuyer = { name: profile?.full_name ?? undefined, email: user.email ?? undefined, phone: profile?.phone ?? undefined };
  }
  const referralActive = (await readReferrals()).some((r) => r.e === e.id);
  const onSale = e.status === "published" && new Date(e.ends_at!) > new Date();
  const range = formatEventRange(e.starts_at!, e.ends_at!, e.timezone!);
  const place = [e.venue_name, e.address_line, e.city_name, e.region_name].filter(Boolean).join(", ");
  const mapUrl = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const priced = tickets.filter((t) => t.price_minor !== null);

  // Event structured data (only for public, indexable pages with real ticket offers).
  const jsonLd = e.visibility === "public" ? {
    "@context": "https://schema.org", "@type": "Event", name: e.title, startDate: e.starts_at, endDate: e.ends_at,
    eventStatus: e.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: e.format === "online" ? "https://schema.org/OnlineEventAttendanceMode" : e.format === "hybrid" ? "https://schema.org/MixedEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: e.format === "online" ? { "@type": "VirtualLocation", url: `${appUrl}/events/${e.slug}` } : {
      "@type": "Place", name: e.venue_name ?? e.city_name,
      address: { "@type": "PostalAddress", streetAddress: e.address_line ?? undefined, addressLocality: e.city_name ?? undefined, addressRegion: e.region_name ?? undefined, addressCountry: "NG" },
    },
    image: publicStorageUrl(e.cover_path) ?? undefined, description: e.summary ?? undefined,
    organizer: { "@type": "Organization", name: e.organization_name, url: `${appUrl}/organizers/${e.organization_slug}` },
    offers: priced.map((t) => ({
      "@type": "Offer", name: t.name, price: ((t.price_minor ?? 0) / 100).toFixed(2), priceCurrency: "NGN", url: `${appUrl}/events/${e.slug}`,
      availability: t.availability === "available" ? "https://schema.org/InStock" : t.availability === "sold_out" ? "https://schema.org/SoldOut" : "https://schema.org/PreOrder",
      validFrom: t.sales_start_at ?? undefined,
    })),
  } : null;

  return (
    <article className="container-page pt-6 sm:pt-10">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <ViewBeacon eventId={e.id!} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
        <div className="min-w-0">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,280px)_1fr] sm:items-end">
            <EventPoster slug={e.slug!} title={e.title!} coverPath={e.cover_path} coverAlt={e.cover_alt} category={e.category_slug} priority sizes="(max-width:640px) 100vw, 280px" className="mx-auto w-full max-w-sm shadow-pop sm:max-w-none" />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {e.is_first_party && <Badge tone="accent">Project23 Events</Badge>}
                {e.category_name && <Badge>{e.category_name}</Badge>}
                {e.age_restriction ? <Badge tone="warning">{e.age_restriction}+</Badge> : null}
                {e.status === "paused" && <Badge tone="warning">Sales paused</Badge>}
                {e.status === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
                {e.status === "completed" && <Badge>Ended</Badge>}
              </div>
              <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">{e.title}</h1>
              <Link href={`/organizers/${e.organization_slug}`} className="inline-block hover:underline">
                <OrganizerMark name={`By ${e.organization_name}`} firstParty={e.is_first_party} verified={e.organization_verified} />
              </Link>
              <div className="flex gap-2 pt-1">
                <FavoriteButton eventId={e.id!} initial={favorite} signedIn={!!user} />
                <Button asChild variant="secondary" size="sm"><a href={`/api/events/${e.id}/calendar`} download><CalendarPlus /> Add to calendar</a></Button>
              </div>
            </div>
          </div>

          {e.status === "cancelled" && (
            <Alert tone="danger" title="This event was cancelled" className="mt-6">
              {e.cancellation_reason} Paid ticket holders are refunded automatically. Questions? <Link className="underline" href="/help">Contact support</Link>.
            </Alert>
          )}

          <dl className="mt-8 grid gap-4 rounded-2xl border border-line bg-surface-1 p-5 sm:grid-cols-2">
            <div className="flex gap-3"><Clock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden /><div><dt className="text-xs uppercase tracking-wider text-fg-subtle">When</dt><dd className="font-medium">{range}</dd></div></div>
            <div className="flex gap-3">
              {e.format === "online" ? <Globe2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden /> : <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />}
              <div><dt className="text-xs uppercase tracking-wider text-fg-subtle">Where</dt>
                <dd className="font-medium">{e.format === "online" ? "Online — access details are sent to ticket holders" : place || "Venue to be announced"}</dd>
                {mapUrl && e.format !== "online" && <dd><a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline-offset-4 hover:underline">Open in Maps</a></dd>}
              </div>
            </div>
          </dl>

          <section aria-labelledby="about" className="mt-10">
            <h2 id="about" className="mb-3 text-xl font-bold">About this event</h2>
            {/* description_html is sanitized server-side on write (allow-listed tags only). */}
            <div className="prose-event" dangerouslySetInnerHTML={{ __html: e.description_html ?? "" }} />
            {e.tags && e.tags.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">{e.tags.map((t) => <li key={t}><Link href={`/explore?q=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:text-fg">#{t}</Link></li>)}</ul>
            )}
          </section>

          <section aria-labelledby="good-to-know" className="mt-10 grid gap-4 sm:grid-cols-2">
            <h2 id="good-to-know" className="sr-only">Good to know</h2>
            {e.entry_rules && <InfoCard icon={<Ticket />} title="Entry">{e.entry_rules}</InfoCard>}
            <InfoCard icon={<ShieldCheck />} title="Refund policy">{REFUND_COPY[e.refund_policy ?? "no_refunds"]} {e.refund_policy_text}</InfoCard>
            {e.accessibility_info && <InfoCard icon={<Accessibility />} title="Accessibility">{e.accessibility_info}</InfoCard>}
            <InfoCard icon={<Globe2 />} title="Timezone">All times are shown in {e.timezone === "Africa/Lagos" ? "West Africa Time (WAT, UTC+1)" : e.timezone}.</InfoCard>
          </section>
        </div>

        <aside aria-label="Tickets" className="lg:sticky lg:top-24 lg:self-start">
          <TicketSelector
            eventId={e.id!} eventTitle={e.title!} onSale={onSale} defaultBuyer={defaultBuyer} referralActive={referralActive}
            tickets={tickets.map<SelectorTicket>((t) => ({
              id: t.id!, name: t.name!, description: t.description, price_minor: t.price_minor ?? 0, admissions_per_unit: t.admissions_per_unit ?? 1,
              min_per_order: t.min_per_order ?? 1, max_per_order: Math.max(0, t.max_per_order ?? 0), availability: (t.availability ?? "unavailable") as SelectorTicket["availability"],
              requires_access_code: !!t.requires_access_code, opens_after_name: t.opens_after_name, few_left: !!t.few_left, sales_end_at: t.sales_end_at,
            }))}
          />
          {priced.length > 0 && <p className="mt-3 text-center text-xs text-fg-subtle">Prices in Nigerian naira. From {formatMoney(Math.min(...priced.map((t) => t.price_minor ?? 0)))}.</p>}
        </aside>
      </div>
    </article>
  );
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-accent">{icon}{title}</h3>
      <p className="text-sm text-fg-muted">{children}</p>
    </div>
  );
}
