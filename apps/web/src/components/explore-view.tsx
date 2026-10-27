import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@project23/ui";
import {
  exploreEvents,
  filterOptions,
  homeCollections,
  type ExploreFilters as F,
} from "@/lib/queries";
import { EventCard, EventRow } from "./event-card";
import { ExploreFilters } from "./filters";
import { FeaturedCarousel } from "./featured-carousel";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFilters(sp: SP): F {
  return {
    q: one(sp.q)?.slice(0, 80),
    city: one(sp.city),
    region: one(sp.region),
    category: one(sp.category),
    when: (one(sp.when) as F["when"]) ?? "all",
    price: (one(sp.price) as F["price"]) ?? "all",
    sort: (one(sp.sort) as F["sort"]) ?? "soonest",
    page: Math.min(20, Number(one(sp.page) ?? 1) || 1),
  };
}

/** The discovery page (served at both / and /explore), laid out like the reference explore page. */
export async function ExploreView({ sp }: { sp: SP }) {
  const filters = parseFilters(sp);
  const filtered = ["q", "city", "region", "category", "when", "price"].some(
    (k) => one(sp[k]) && one(sp[k]) !== "all",
  );
  const [opts, home] = await Promise.all([
    filterOptions(),
    filtered ? Promise.resolve(null) : homeCollections(),
  ]);
  const cityName = opts.cities.find((c) => c.slug === filters.city)?.name;
  const heading = filters.q
    ? `Results for “${filters.q}”`
    : cityName
      ? `Events in ${cityName}`
      : filtered
        ? "Events"
        : "Upcoming events";
  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-10 pt-4 sm:px-8">
      <h1 className="sr-only">Discover events in Osun and across Nigeria</h1>
      {home && home.featured.length > 0 && <FeaturedCarousel events={home.featured} />}

      {home && home.project23.length > 0 && (
        <section aria-labelledby="p23-h" className="mt-20">
          <div className="mb-6 flex items-center justify-between">
            <h2 id="p23-h" className="text-base font-normal">
              Project23 Events <span className="text-fg-muted">{home.project23.length}</span>
            </h2>
            <Link href="/project23" className="text-xs font-medium text-fg-muted hover:text-fg">
              View all
            </Link>
          </div>
          <div className="hidden grid-cols-3 gap-x-6 gap-y-24 md:grid lg:grid-cols-4">
            {home.project23.slice(0, 4).map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
          <div className="grid gap-5 md:hidden">
            {home.project23.slice(0, 3).map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="list-h" className={home ? "mt-20" : "mt-2"}>
        <div className="sticky top-0 z-30 -mx-4 mb-6 flex flex-col gap-3 bg-bg/95 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:px-0">
          <Suspense
            fallback={
              <h2 id="list-h" className="text-base font-normal">
                {heading}
              </h2>
            }
          >
            <ListHeading heading={heading} filters={filters} />
          </Suspense>
          <div className="sm:ml-auto">
            <Suspense>
              <ExploreFilters cities={opts.cities} />
            </Suspense>
          </div>
        </div>
        <Suspense key={JSON.stringify(filters)} fallback={<GridSkeleton />}>
          <Results filters={filters} sp={sp} />
        </Suspense>
      </section>
    </div>
  );
}

async function ListHeading({ heading, filters }: { heading: string; filters: F }) {
  const { total } = await exploreEvents({ ...filters, page: 1 });
  return (
    <h2 id="list-h" className="text-base font-normal">
      {heading} <span className="text-fg-muted">{total > 100 ? "100+" : total}</span>
    </h2>
  );
}

async function Results({ filters, sp }: { filters: F; sp: SP }) {
  let r: Awaited<ReturnType<typeof exploreEvents>>;
  try {
    r = await exploreEvents(filters);
  } catch {
    return <EmptyState title="We couldn’t load events">Please refresh the page.</EmptyState>;
  }
  if (r.events.length === 0) {
    return (
      <EmptyState
        title="No events match these filters"
        action={
          <Link
            href="/explore"
            className="inline-flex h-9 items-center rounded-full bg-white/[0.08] px-4 text-sm font-medium hover:bg-white/[0.12]"
          >
            Clear filters
          </Link>
        }
      >
        Try another date or location.
      </EmptyState>
    );
  }
  const more = new URLSearchParams();
  for (const [k, v] of Object.entries(sp))
    if (typeof v === "string" && k !== "page") more.set(k, v);
  more.set("page", String(r.page + 1));
  return (
    <>
      <div className="hidden grid-cols-3 gap-x-6 gap-y-24 md:grid lg:grid-cols-4">
        {r.events.map((e, i) => (
          <EventCard key={e.id} e={e} priority={i < 4} />
        ))}
      </div>
      <div className="grid gap-5 md:hidden">
        {r.events.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </div>
      {r.page < r.pages && (
        <div className="mt-20 flex justify-center">
          <Link
            href={`/explore?${more}`}
            scroll={false}
            className="inline-flex h-9 items-center rounded-full border border-white/[0.05] bg-white/[0.015] px-5 text-sm font-medium hover:bg-white/[0.06]"
          >
            Show more
          </Link>
        </div>
      )}
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-24 md:grid-cols-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="mt-4 h-3 w-1/2" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-3 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
