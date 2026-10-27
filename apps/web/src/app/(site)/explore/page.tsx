import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarSearch } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@project23/ui";
import { exploreEvents, filterOptions, type ExploreFilters as F } from "@/lib/queries";
import { EventCard } from "@/components/event-card";
import { ExploreFilters, SortSelect } from "@/components/filters";

export const metadata: Metadata = {
  title: "Explore events",
  alternates: { canonical: "/explore" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ExplorePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters: F = {
    q: one(sp.q)?.slice(0, 80),
    city: one(sp.city),
    region: one(sp.region),
    category: one(sp.category),
    when: (one(sp.when) as F["when"]) ?? "all",
    price: (one(sp.price) as F["price"]) ?? "all",
    sort: (one(sp.sort) as F["sort"]) ?? "soonest",
    page: Number(one(sp.page) ?? 1) || 1,
  };
  const opts = await filterOptions();
  const cityName = opts.cities.find((c) => c.slug === filters.city)?.name;
  return (
    <div className="container-page pt-8">
      <h1 className="text-3xl font-bold sm:text-5xl">
        {cityName ? `Events in ${cityName}` : "Explore events"}
      </h1>
      <div className="mt-6">
        <Suspense>
          <ExploreFilters cities={opts.cities} categories={opts.categories} />
        </Suspense>
      </div>
      <Suspense key={JSON.stringify(filters)} fallback={<ResultsSkeleton />}>
        <Results filters={filters} sp={sp} />
      </Suspense>
    </div>
  );
}

async function Results({
  filters,
  sp,
}: {
  filters: F;
  sp: Record<string, string | string[] | undefined>;
}) {
  let result: Awaited<ReturnType<typeof exploreEvents>>;
  try {
    result = await exploreEvents(filters);
  } catch {
    return (
      <div className="mt-10">
        <EmptyState title="We couldn't load events">
          Please refresh the page. If this keeps happening, try again in a few minutes.
        </EmptyState>
      </div>
    );
  }
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp))
      if (typeof v === "string" && k !== "page") next.set(k, v);
    if (p > 1) next.set("page", String(p));
    return `/explore${next.size ? `?${next}` : ""}`;
  };
  return (
    <section aria-label="Results" className="mt-8">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {result.total} {result.total === 1 ? "event" : "events"}
        </p>
        <Suspense>
          <SortSelect />
        </Suspense>
      </div>
      {result.events.length === 0 ? (
        <EmptyState
          icon={<CalendarSearch />}
          title="No events match these filters"
          action={
            <Button asChild variant="secondary">
              <Link href="/explore">Clear filters</Link>
            </Button>
          }
        >
          Try a different date range or location — new events are listed every week.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
          {result.events.map((e, i) => (
            <EventCard key={e.id} e={e} priority={i < 4} />
          ))}
        </div>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
          {result.page > 1 && (
            <Button asChild variant="secondary">
              <Link href={pageHref(result.page - 1)} rel="prev">
                Previous
              </Link>
            </Button>
          )}
          <span className="px-3 text-sm text-fg-muted">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages && (
            <Button asChild variant="secondary">
              <Link href={pageHref(result.page + 1)} rel="next">
                Next
              </Link>
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div
      className="mt-14 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4"
      aria-busy
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
