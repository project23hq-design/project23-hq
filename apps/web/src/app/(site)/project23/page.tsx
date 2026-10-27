import { Sparkles } from "lucide-react";
import { EmptyState } from "@project23/ui";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/event-card";
import type { EventCardData } from "@/lib/queries";

export const metadata = {
  title: "Project23 Events",
  description: "Official events produced by Project23.",
  alternates: { canonical: "/project23" },
};
export const revalidate = 60;

export default async function Project23Events() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_events")
    .select("*")
    .eq("is_first_party", true)
    .eq("visibility", "public")
    .in("status", ["published", "paused"])
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");
  return (
    <div className="container-page pt-10">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        <Sparkles className="size-3.5" aria-hidden />
        Official
      </p>
      <h1 className="mt-2 text-4xl font-extrabold sm:text-6xl">Project23 Events</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">
        Nights, sessions and workshops produced by the Project23 team. Same checkout, same buyer
        protections and refund rules as every organizer on the platform.
      </p>
      <div className="mt-10">
        {!data?.length ? (
          <EmptyState title="New Project23 events coming soon" />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {(data as EventCardData[]).map((e, i) => (
              <EventCard key={e.id} e={e} priority={i < 4} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
