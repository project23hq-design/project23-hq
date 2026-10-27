import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BadgeCheck, ChevronRight, MapPin } from "lucide-react";
import { formatEventLine, formatEventRange, formatMoney } from "@project23/domain";
import { Alert } from "@project23/ui";
import { getPublicEvent } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { readReferrals } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/supabase/storage";
import { EventPoster, posterTint } from "@/components/poster";
import { TicketSelector, type SelectorTicket } from "./ticket-selector";
import { FavoriteButton, ShareButton, ViewBeacon } from "./client-bits";

type Params = Promise<{ slug: string }>;

const REFUND_COPY: Record<string, string> = {
  no_refunds: "No refunds unless the event is cancelled.",
  until_24h: "Refunds available until 24 hours before the event starts.",
  until_7d: "Refunds available until 7 days before the event starts.",
  custom: "",
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s*\(fictional\)/gi, "");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicEvent(slug);
  if (!data) return { title: "Event not found" };
  const e = data.event;
  const img = publicStorageUrl(e.cover_path);
  return {
    title: `${e.title} | ${e.organization_name}`,
    description:
      e.summary ??
      `${e.title} — ${formatEventRange(e.starts_at!, e.ends_at!, e.timezone!)}${e.city_name ? ` in ${e.city_name}` : ""}.`,
    alternates: { canonical: `/events/${e.slug}` },
    robots: e.visibility === "unlisted" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: e.title!,
      description: e.summary ?? undefined,
      type: "website",
      images: img ? [{ url: img }] : undefined,
    },
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
    defaultBuyer = {
      name: profile?.full_name ?? undefined,
      email: user.email ?? undefined,
      phone: profile?.phone ?? undefined,
    };
  }
  const anon = await createClient();
  const [{ data: org }, { count: orgEvents }] = await Promise.all([
    anon
      .from("public_organizations")
      .select("slug, name, description, is_verified, is_first_party")
      .eq("id", e.organization_id!)
      .maybeSingle(),
    anon
      .from("public_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", e.organization_id!),
  ]);
  const referralActive = (await readReferrals()).some((r) => r.e === e.id);
  const onSale = e.status === "published" && new Date(e.ends_at!) > new Date();
  const venue = clean(e.venue_name) || e.city_name || "Venue to be announced";
  const dateLine = formatEventLine(e.starts_at!, e.ends_at!, e.timezone!);
  const fullAddress = [
    clean(e.venue_name),
    e.address_line,
    e.city_name,
    e.region_name ? `${e.region_name} State` : null,
    "Nigeria",
  ]
    .filter(
      (p, i, all): p is string =>
        !!p && !all.slice(0, i).some((prev) => prev?.toLowerCase().includes(p.toLowerCase())),
    )
    .join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const buyable = tickets.filter((t) => t.availability === "available");
  const minPrice = (buyable.length ? buyable : tickets).reduce(
    (m, t) => Math.min(m, t.price_minor ?? 0),
    Number.POSITIVE_INFINITY,
  );
  const fromLabel = !Number.isFinite(minPrice)
    ? "Get tickets"
    : buyable.length === 0
      ? tickets.length > 0 &&
        tickets.every((t) => t.availability === "sold_out" || t.availability === "on_hold")
        ? "Sold out"
        : tickets.some((t) => t.availability === "sales_ended")
          ? "Sales ended"
          : "Not on sale yet"
      : minPrice === 0
        ? tickets.every((t) => (t.price_minor ?? 0) === 0)
          ? "Get free tickets"
          : "Get tickets"
        : `Buy tickets from ${formatMoney(minPrice)}`;
  const poster = {
    slug: e.slug!,
    title: e.title!,
    coverPath: e.cover_path,
    coverAlt: e.cover_alt,
    category: e.category_slug,
    startsAt: e.starts_at,
    timezone: e.timezone,
    venue: e.venue_name,
    city: e.city_name,
    organizer: e.organization_name,
    tags: e.tags,
  };
  const coverUrl = publicStorageUrl(e.cover_path);
  const tint = posterTint(e.slug!, e.category_slug);

  const jsonLd =
    e.visibility === "public"
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: e.title,
          startDate: e.starts_at,
          endDate: e.ends_at,
          eventStatus:
            e.status === "cancelled"
              ? "https://schema.org/EventCancelled"
              : "https://schema.org/EventScheduled",
          eventAttendanceMode:
            e.format === "online"
              ? "https://schema.org/OnlineEventAttendanceMode"
              : e.format === "hybrid"
                ? "https://schema.org/MixedEventAttendanceMode"
                : "https://schema.org/OfflineEventAttendanceMode",
          location:
            e.format === "online"
              ? { "@type": "VirtualLocation", url: `${appUrl}/events/${e.slug}` }
              : {
                  "@type": "Place",
                  name: venue,
                  address: {
                    "@type": "PostalAddress",
                    streetAddress: e.address_line ?? undefined,
                    addressLocality: e.city_name ?? undefined,
                    addressRegion: e.region_name ?? undefined,
                    addressCountry: "NG",
                  },
                },
          image: coverUrl ?? undefined,
          description: e.summary ?? undefined,
          organizer: {
            "@type": "Organization",
            name: e.organization_name,
            url: `${appUrl}/organizers/${e.organization_slug}`,
          },
          offers: tickets.map((t) => ({
            "@type": "Offer",
            name: t.name,
            price: ((t.price_minor ?? 0) / 100).toFixed(2),
            priceCurrency: "NGN",
            url: `${appUrl}/events/${e.slug}`,
            availability:
              t.availability === "available"
                ? "https://schema.org/InStock"
                : t.availability === "sold_out"
                  ? "https://schema.org/SoldOut"
                  : "https://schema.org/PreOrder",
          })),
        }
      : null;

  return (
    <div className="relative">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      <ViewBeacon eventId={e.id!} />

      {/* blurred flyer backdrop, like the reference */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 h-[640px] overflow-hidden"
      >
        <div className="absolute inset-0 scale-125 opacity-50 blur-[80px] saturate-150">
          <EventPoster {...poster} shape="square" className="h-full w-full" sizes="200px" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />
      </div>

      <article className="relative mx-auto grid max-w-[1120px] gap-10 px-4 pt-2 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.66fr)] md:gap-6 lg:gap-8">
        {/* mobile flyer first */}
        <div className="md:hidden">
          <EventPoster {...poster} rounded="md" priority sizes="100vw" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 border-t border-white/[0.1] pt-4">
            <Link
              href={`/organizers/${e.organization_slug}`}
              className="inline-flex min-w-0 items-center gap-2 hover:underline"
            >
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[10px] font-semibold"
              >
                {e.organization_name?.slice(0, 1)}
              </span>
              <span className="truncate text-base font-medium uppercase text-fg/80">
                {e.organization_name}
              </span>
              {(e.is_first_party || e.organization_verified) && (
                <BadgeCheck
                  className="size-4 shrink-0 fill-fg text-bg"
                  aria-label={e.is_first_party ? "Official Project23 event" : "Verified organizer"}
                />
              )}
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <FavoriteButton eventId={e.id!} initial={favorite} signedIn={!!user} />
              <ShareButton title={e.title!} />
            </div>
          </div>

          <h1 className="mt-8 font-display text-[40px] sm:mt-12 font-medium leading-[1.05] tracking-[-0.01em] sm:text-5xl sm:leading-[48px]">
            {e.title}
          </h1>
          {e.age_restriction ? (
            <p className="mt-3 text-sm text-fg-muted">{e.age_restriction}+ only</p>
          ) : null}

          <div className="mt-12">
            <p className="text-base font-medium">
              {e.format === "online" ? "Online event" : venue}
            </p>
            <p className="text-base">{dateLine}</p>
          </div>

          {e.status === "cancelled" && (
            <Alert tone="danger" title="This event was cancelled" className="mt-6">
              {e.cancellation_reason} Paid ticket holders are refunded automatically.
            </Alert>
          )}
          {e.status === "paused" && (
            <Alert tone="warning" className="mt-6">
              Ticket sales are paused by the organizer.
            </Alert>
          )}

          <section aria-labelledby="about" className="mt-8 border-t border-white/[0.1] pt-8">
            <h2 id="about" className="text-base font-medium">
              About this event
            </h2>
            {/* description_html is sanitized server-side on write (allow-listed tags only). */}
            <div
              className="prose-event mt-4"
              dangerouslySetInnerHTML={{
                __html: (e.description_html ?? "").replace(/\s*\(fictional\)/gi, ""),
              }}
            />
          </section>

          {(e.entry_rules || e.accessibility_info || e.refund_policy) && (
            <dl className="mt-8 space-y-5 border-t border-white/[0.1] pt-8 text-base">
              {e.entry_rules && (
                <div>
                  <dt className="font-medium">Entry</dt>
                  <dd className="mt-1 text-fg/90">{e.entry_rules}</dd>
                </div>
              )}
              <div>
                <dt className="font-medium">Refunds</dt>
                <dd className="mt-1 text-fg/90">
                  {REFUND_COPY[e.refund_policy ?? "no_refunds"]} {e.refund_policy_text}
                </dd>
              </div>
              {e.accessibility_info && (
                <div>
                  <dt className="font-medium">Accessibility</dt>
                  <dd className="mt-1 text-fg/90">{e.accessibility_info}</dd>
                </div>
              )}
            </dl>
          )}

          {e.format !== "online" && (
            <section aria-labelledby="loc" className="mt-8 border-t border-white/[0.1] pt-8">
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex h-56 items-center justify-center overflow-hidden rounded-lg bg-[#16161a] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.1] ring-8 ring-white/[0.04]">
                  <MapPin className="size-5" />
                </span>
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur group-hover:bg-black/80">
                  Open in Maps <ArrowUpRight className="size-3.5" />
                </span>
              </a>
              <h2 id="loc" className="mt-5 text-base font-medium">
                Location
              </h2>
              <p className="mt-1 text-base">{fullAddress}</p>
            </section>
          )}

          {org && (
            <section aria-label="Organizer" className="mt-8 rounded-lg bg-white/[0.05] p-4">
              <div className="flex items-center text-sm">
                <span className="text-fg-muted">Hosted by</span>
                <span className="ml-1.5 font-medium uppercase">{org.name}</span>
                {(org.is_verified || org.is_first_party) && (
                  <BadgeCheck className="ml-1 size-4 fill-fg text-bg" aria-hidden />
                )}
                <Link
                  href={`/organizers/${org.slug}`}
                  className="ml-auto inline-flex items-center gap-0.5 text-fg-muted hover:text-fg"
                >
                  More events <ChevronRight className="size-4" />
                </Link>
              </div>
              <div className="flex flex-col items-center py-8 text-center">
                <span
                  aria-hidden
                  className="flex size-24 items-center justify-center rounded-full bg-white/[0.08] font-display text-3xl font-medium"
                >
                  {org.name?.slice(0, 1)}
                </span>
                <p className="mt-4 font-medium uppercase">{org.name}</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {orgEvents ?? 0} event{orgEvents === 1 ? "" : "s"}
                </p>
                {org.description && (
                  <p className="mt-4 max-w-md text-sm text-fg/80">{clean(org.description)}</p>
                )}
              </div>
              <div className="flex justify-between">
                <Link
                  href="/contact"
                  className="inline-flex h-9 items-center rounded-full border border-white/[0.06] px-4 text-sm font-medium hover:bg-white/[0.06]"
                >
                  Contact
                </Link>
                <Link
                  href={`/organizers/${org.slug}`}
                  className="inline-flex h-9 items-center rounded-full border border-white/[0.06] px-4 text-sm font-medium hover:bg-white/[0.06]"
                >
                  View profile
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* sticky flyer column */}
        <aside className="hidden md:block">
          <div className="sticky top-6">
            <EventPoster
              {...poster}
              rounded="md"
              priority
              sizes="(max-width: 1120px) 34vw, 380px"
              className="shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
            />
            <div className="mt-8 text-center">
              <p className="font-display text-lg font-medium uppercase">{e.title}</p>
              <p className="mt-4 text-base font-medium">{venue}</p>
              <p className="text-base">{dateLine}</p>
            </div>
          </div>
        </aside>
      </article>

      <TicketSelector
        eventId={e.id!}
        eventTitle={e.title!}
        venueLine={venue}
        dateLine={dateLine}
        tint={tint}
        fromLabel={fromLabel}
        poster={<EventPoster {...poster} sizes="160px" />}
        onSale={onSale}
        defaultBuyer={defaultBuyer}
        referralActive={referralActive}
        tickets={tickets.map<SelectorTicket>((t) => ({
          id: t.id!,
          name: t.name!,
          description: t.description,
          price_minor: t.price_minor ?? 0,
          admissions_per_unit: t.admissions_per_unit ?? 1,
          min_per_order: t.min_per_order ?? 1,
          max_per_order: Math.max(0, t.max_per_order ?? 0),
          availability: (t.availability ?? "unavailable") as SelectorTicket["availability"],
          requires_access_code: !!t.requires_access_code,
          opens_after_name: t.opens_after_name,
          few_left: !!t.few_left,
          sales_end_at: t.sales_end_at,
        }))}
      />
    </div>
  );
}
