import Link from "next/link";
import { BadgeCheck, Sparkles } from "lucide-react";
import { formatEventDate, formatMoney, priceLabel } from "@project23/domain";
import { cn } from "@project23/ui";
import type { EventCardData } from "@/lib/queries";
import { EventPoster } from "./poster";

export function OrganizerMark({
  name,
  firstParty,
  verified,
}: {
  name: string | null;
  firstParty: boolean | null;
  verified: boolean | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
      <span className="truncate">{name}</span>
      {firstParty ? (
        <span
          title="Official Project23 event"
          className="inline-flex items-center gap-0.5 text-accent"
        >
          <Sparkles className="size-3.5" aria-hidden />
          <span className="sr-only">Official Project23 event</span>
        </span>
      ) : verified ? (
        <span title="Verified organizer" className="text-info">
          <BadgeCheck className="size-3.5" aria-hidden />
          <span className="sr-only">Verified organizer</span>
        </span>
      ) : null}
    </span>
  );
}

/** Poster-led card for carousels and grids. */
export function EventCard({
  e,
  priority,
  className,
}: {
  e: EventCardData;
  priority?: boolean;
  className?: string;
}) {
  const price = priceLabel(
    {
      min_price_minor: e.min_price_minor,
      max_price_minor: e.max_price_minor,
      is_sold_out: !!e.is_sold_out,
      sales_ended: !!e.sales_ended,
      status: e.status!,
    },
    formatMoney,
  );
  const place = e.venue_name
    ? `${e.venue_name}${e.city_name ? `, ${e.city_name}` : ""}`
    : e.city_name;
  return (
    <Link
      href={`/events/${e.slug}`}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="relative">
        <EventPoster
          slug={e.slug!}
          title={e.title!}
          coverPath={e.cover_path}
          coverAlt={e.cover_alt}
          category={e.category_slug}
          dateLabel={formatEventDate(e.starts_at!, e.timezone!)}
          priority={priority}
          className="transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transform-none"
        />
        {(e.is_sold_out || e.sales_ended) && (
          <span className="absolute left-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {price}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-1 px-0.5">
        <OrganizerMark
          name={e.organization_name}
          firstParty={e.is_first_party}
          verified={e.organization_verified}
        />
        <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug group-hover:text-accent">
          {e.title}
        </h3>
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{price}</span>
          {place ? (
            <>
              {" "}
              · <span>{place}</span>
            </>
          ) : null}
        </p>
        <p className="text-sm text-fg-subtle">{formatEventDate(e.starts_at!, e.timezone!)}</p>
      </div>
    </Link>
  );
}

/** Compact row (square thumbnail + details) for lists, especially on mobile. */
export function EventRow({ e }: { e: EventCardData }) {
  const price = priceLabel(
    {
      min_price_minor: e.min_price_minor,
      max_price_minor: e.max_price_minor,
      is_sold_out: !!e.is_sold_out,
      sales_ended: !!e.sales_ended,
      status: e.status!,
    },
    formatMoney,
  );
  return (
    <Link
      href={`/events/${e.slug}`}
      className="group flex min-w-0 items-center gap-4 rounded-2xl p-2 -mx-2 outline-none hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <EventPoster
        slug={e.slug!}
        title={e.title!}
        coverPath={e.cover_path}
        coverAlt={e.cover_alt}
        category={e.category_slug}
        variant="square"
        sizes="112px"
        className="w-24 shrink-0 sm:w-28 [&_span]:text-[10px]"
      />
      <div className="min-w-0 space-y-1">
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug group-hover:text-accent sm:text-lg">
          {e.title}
        </h3>
        <p className="truncate text-sm text-fg-muted">
          <span className="font-medium text-fg">{price}</span>
          {e.venue_name ? ` at ${e.venue_name}` : ""}
          {e.city_name ? `, ${e.city_name}` : ""}
        </p>
        <p className="text-sm text-fg-subtle">{formatEventDate(e.starts_at!, e.timezone!)}</p>
        <OrganizerMark
          name={e.organization_name}
          firstParty={e.is_first_party}
          verified={e.organization_verified}
        />
      </div>
    </Link>
  );
}
