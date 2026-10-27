import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { formatCardDate, formatMoney, priceLabel } from "@project23/domain";
import { cn } from "@project23/ui";
import type { EventCardData } from "@/lib/queries";
import { EventPoster } from "./poster";

/** Organizer line: 12px zinc-400 with a verified check (first-party or verified only). */
export function OrganizerMark({
  name,
  firstParty,
  verified,
  className,
}: {
  name: string | null;
  firstParty: boolean | null;
  verified: boolean | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-xs text-fg-muted", className)}>
      <span className="truncate">{name}</span>
      {(firstParty || verified) && (
        <BadgeCheck
          className="size-3.5 shrink-0 fill-brand-strong text-bg"
          aria-label={firstParty ? "Official Project23 event" : "Verified organizer"}
        />
      )}
    </span>
  );
}

export function cardPrice(e: EventCardData) {
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
  const venue = e.venue_name?.replace(/\s*\(fictional\)/i, "") ?? e.city_name;
  return venue ? `${price} at ${venue}` : price;
}

export function posterProps(e: EventCardData) {
  return {
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
}

/** Grid card exactly in the reference's rhythm: flyer, organizer, title, price · venue, date. */
export function EventCard({
  e,
  priority,
  className,
}: {
  e: EventCardData;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/events/${e.slug}`}
      className={cn(
        "group block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-bg",
        className,
      )}
    >
      <EventPoster
        {...posterProps(e)}
        priority={priority}
        className="transition duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-18px_rgba(98,116,252,0.7)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      />
      <div className="mt-4 min-w-0">
        <OrganizerMark
          name={e.organization_name}
          firstParty={e.is_first_party}
          verified={e.organization_verified}
        />
        <h3 className="mt-3 line-clamp-2 text-base font-normal leading-6 text-fg">{e.title}</h3>
        <p className="mt-3 truncate text-xs leading-4 text-fg-muted">{cardPrice(e)}</p>
        <p className="mt-1 text-xs leading-4 text-fg-muted">
          {formatCardDate(e.starts_at!, e.ends_at, e.timezone!)}
        </p>
      </div>
    </Link>
  );
}

/** Mobile list row: square flyer thumb + details (reference mobile explore). */
export function EventRow({ e }: { e: EventCardData }) {
  return (
    <Link
      href={`/events/${e.slug}`}
      className="flex min-w-0 items-center gap-4 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <EventPoster {...posterProps(e)} shape="square" sizes="112px" className="w-28 shrink-0" />
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-base font-normal leading-6">{e.title}</h3>
        <p className="mt-1.5 truncate text-[13px] text-fg-muted">{cardPrice(e)}</p>
        <p className="text-[13px] text-fg-muted">
          {formatCardDate(e.starts_at!, e.ends_at, e.timezone!)}
        </p>
      </div>
    </Link>
  );
}
