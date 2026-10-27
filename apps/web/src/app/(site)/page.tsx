import Link from "next/link";
import { ArrowRight, MapPin, Sparkles } from "lucide-react";
import { Button, EmptyState } from "@project23/ui";
import { formatEventDate } from "@project23/domain";
import { homeCollections } from "@/lib/queries";
import { EventCard, EventRow } from "@/components/event-card";
import { EventPoster } from "@/components/poster";
import { Rail, RailItem } from "@/components/rail";
import { Section } from "@/components/section";
import { Reveal } from "@/components/reveal";

export const revalidate = 60;

export default async function HomePage() {
  const c = await homeCollections();
  const hero = c.featured[0] ?? c.upcoming[0];
  const osunCities = c.cities.filter((ci) => (ci.regions as unknown as { is_launch_region: boolean })?.is_launch_region);
  const otherCities = c.cities.filter((ci) => !(ci.regions as unknown as { is_launch_region: boolean })?.is_launch_region).slice(0, 4);

  return (
    <>
      {/* Hero: one featured event, poster-first */}
      <section className="container-page grid items-center gap-8 pt-8 sm:pt-12 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <Reveal>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs font-semibold text-fg-muted">
            <MapPin className="size-3.5 text-accent" aria-hidden /> Osogbo · Ile-Ife · Ilesa · Ede · and beyond
          </p>
          <h1 className="text-[clamp(2.4rem,7vw,4.6rem)] font-extrabold leading-[0.95]">
            Where Osun goes <span className="text-accent">out.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-fg-muted">
            Concerts, comedy, campus nights, conferences and workshops — find something on this week and get your tickets in naira in a minute.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/explore">Explore events <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/organizer">Sell tickets</Link></Button>
          </div>
        </Reveal>
        {hero && (
          <Reveal delay={0.08}>
            <Link href={`/events/${hero.slug}`} className="group relative block rounded-3xl focus-visible:ring-2 focus-visible:ring-ring">
              <EventPoster slug={hero.slug!} title={hero.title!} coverPath={hero.cover_path} category={hero.category_slug} priority
                dateLabel={formatEventDate(hero.starts_at!, hero.timezone!)} variant="wide" sizes="(max-width:1024px) 100vw, 560px"
                className="rounded-3xl shadow-pop" />
              <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                {c.featured[0] ? "Featured" : "Up next"}
              </span>
            </Link>
          </Reveal>
        )}
      </section>

      {/* Category shortcuts */}
      <nav aria-label="Categories" className="container-page mt-10">
        <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 [contain:paint] sm:mx-0 sm:flex-wrap sm:px-0">
          {c.categories.map((cat) => (
            <li key={cat.slug} className="shrink-0">
              <Link href={`/explore?category=${cat.slug}`} className="inline-flex h-10 items-center rounded-full border border-line bg-surface-1 px-4 text-sm font-medium text-fg-muted hover:border-line-strong hover:text-fg">
                {cat.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {c.featured.length > 0 && (
        <Section id="featured" title="Featured" kicker="Editor's picks" note="Selected by the Project23 team." href="/explore">
          <Rail label="Featured events">
            {c.featured.map((e, i) => <RailItem key={e.id} wide><EventCard e={e} priority={i < 2} /></RailItem>)}
          </Rail>
        </Section>
      )}

      {c.trending.length > 0 && (
        <Section id="selling" title="Selling now" note="Ranked by tickets sold online in the last 7 days.">
          <Rail label="Selling now">{c.trending.map((e) => <RailItem key={e.id}><EventCard e={e} /></RailItem>)}</Rail>
        </Section>
      )}

      {/* First-party collection — clearly labelled */}
      <section aria-labelledby="p23" className="container-page mt-16 sm:mt-24">
        <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface-1 to-surface-1 p-6 sm:p-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent"><Sparkles className="size-3.5" aria-hidden /> Official</p>
              <h2 id="p23" className="mt-1 text-2xl font-bold sm:text-4xl">Project23 Events</h2>
              <p className="mt-2 max-w-xl text-fg-muted">Nights and workshops produced by the Project23 team, sold through the same secure checkout as every organizer.</p>
            </div>
            <Button asChild variant="secondary"><Link href="/project23">All Project23 events <ArrowRight /></Link></Button>
          </div>
          {c.project23.length ? (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">{c.project23.slice(0, 4).map((e) => <EventCard key={e.id} e={e} />)}</div>
          ) : <p className="text-fg-muted">New Project23 events are announced soon.</p>}
        </div>
      </section>

      <Section id="osun" title="Around Osun" kicker="Local" href="/explore?region=osun">
        <ul className="mb-6 flex flex-wrap gap-2">
          {osunCities.map((ci) => (
            <li key={ci.slug}><Link href={`/explore?city=${ci.slug}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-sm font-medium hover:bg-surface-3"><MapPin className="size-3.5 text-accent" aria-hidden />{ci.name}</Link></li>
          ))}
        </ul>
        {c.osun.length ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">{c.osun.slice(0, 8).map((e) => <EventRow key={e.id} e={e} />)}</div>
        ) : <EmptyState title="Nothing listed in Osun yet">Check back soon, or explore events elsewhere in Nigeria.</EmptyState>}
      </Section>

      <Section id="upcoming" title="Coming up" href="/explore">
        <Rail label="Upcoming events">{c.upcoming.map((e) => <RailItem key={e.id}><EventCard e={e} /></RailItem>)}</Rail>
      </Section>

      {otherCities.length > 0 && (
        <Section id="cities" title="Beyond Osun">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {otherCities.map((ci) => (
              <li key={ci.slug}>
                <Link href={`/explore?city=${ci.slug}`} className="flex h-20 items-end rounded-2xl border border-line bg-surface-1 p-4 font-display text-lg font-semibold hover:border-line-strong">{ci.name}</Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
