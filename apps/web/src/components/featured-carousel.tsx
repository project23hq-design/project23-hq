"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCardDate } from "@project23/domain";
import type { EventCardData } from "@/lib/queries";
import { EventPoster } from "./poster";
import { OrganizerMark, cardPrice, posterProps } from "./event-card";

/**
 * Featured strip: one large active flyer with its details underneath, the following flyers
 * smaller and top-aligned to its right, prev/next round buttons — the reference's layout.
 */
export function FeaturedCarousel({
  events,
  title = "Featured events",
}: {
  events: EventCardData[];
  title?: string;
}) {
  const [i, setI] = useState(0);
  if (events.length === 0) return null;
  const n = events.length;
  const active = events[i % n]!;
  const rest = Array.from({ length: Math.min(n - 1, 6) }, (_, k) => events[(i + 1 + k) % n]!);
  const go = (d: number) => setI((v) => (v + d + n) % n);
  const arrows = n > 1 && (
    <div className="flex gap-2">
      <button
        onClick={() => go(-1)}
        aria-label="Previous featured event"
        className="inline-flex size-8 items-center justify-center rounded-lg bg-white/[0.08] text-fg hover:bg-white/[0.14]"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        onClick={() => go(1)}
        aria-label="Next featured event"
        className="inline-flex size-8 items-center justify-center rounded-lg bg-white/[0.08] text-fg hover:bg-white/[0.14]"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
  return (
    <section aria-labelledby="featured-h" className="relative">
      <div className="mb-6 flex items-center justify-between">
        <h2 id="featured-h" className="text-base font-normal">
          {title} <span className="text-fg-muted">{n}</span>
        </h2>
        <div className="sm:hidden">{arrows}</div>
      </div>
      <div className="flex items-start gap-4 overflow-hidden sm:gap-6">
        <div className="w-[68vw] max-w-[312px] shrink-0">
          <Link
            href={`/events/${active.slug}`}
            className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EventPoster
              key={active.id}
              {...posterProps(active)}
              priority
              sizes="312px"
              className="animate-in-fade"
            />
          </Link>
          <div className="mt-4" aria-live="polite">
            <OrganizerMark
              name={active.organization_name}
              firstParty={active.is_first_party}
              verified={active.organization_verified}
            />
            <Link
              href={`/events/${active.slug}`}
              className="mt-3 block text-base leading-6 hover:underline"
            >
              {active.title}
            </Link>
            <p className="mt-3 truncate text-xs text-fg-muted">{cardPrice(active)}</p>
            <p className="mt-1 text-xs text-fg-muted">
              {formatCardDate(active.starts_at!, active.ends_at, active.timezone!)}
            </p>
          </div>
        </div>
        {rest.map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.slug}`}
            className="hidden w-[202px] shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
            tabIndex={-1}
            aria-hidden
          >
            <EventPoster {...posterProps(e)} sizes="202px" />
          </Link>
        ))}
      </div>
      <div className="absolute right-0 top-[406px] hidden sm:block">{arrows}</div>
    </section>
  );
}
