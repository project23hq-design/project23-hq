import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Sparkles } from "lucide-react";
import { EmptyState } from "@project23/ui";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/event-card";
import type { EventCardData } from "@/lib/queries";

type P = Promise<{ slug: string }>;

async function load(slug: string) {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("public_organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return null;
  const { data: events } = await supabase
    .from("public_events")
    .select("*")
    .eq("organization_id", org.id!)
    .eq("visibility", "public")
    .in("status", ["published", "paused"])
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  return { org, events: (events ?? []) as EventCardData[] };
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const d = await load((await params).slug);
  return d
    ? {
        title: d.org.name!,
        description: d.org.description ?? undefined,
        alternates: { canonical: `/organizers/${d.org.slug}` },
      }
    : { title: "Organizer not found" };
}

export default async function OrganizerProfile({ params }: { params: P }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { org, events } = d;
  return (
    <div className="container-page pt-10">
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 font-display text-2xl font-medium">
          {org.name!.slice(0, 1)}
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-medium">
            {org.name}
            {org.is_first_party ? (
              <Sparkles className="size-5 text-brand" aria-label="Official Project23 organizer" />
            ) : org.is_verified ? (
              <BadgeCheck
                className="size-5 fill-brand-strong text-bg"
                aria-label="Verified organizer"
              />
            ) : null}
          </h1>
          {org.is_verified && !org.is_first_party && (
            <p className="text-sm text-fg-muted">
              Verified organizer — identity reviewed by Project23
            </p>
          )}
        </div>
      </div>
      {org.description && (
        <p className="mt-6 max-w-2xl whitespace-pre-line text-fg-muted">{org.description}</p>
      )}
      <h2 className="mb-6 mt-12 text-2xl font-medium">Upcoming events</h2>
      {events.length === 0 ? (
        <EmptyState title="No upcoming events" />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
          {events.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
