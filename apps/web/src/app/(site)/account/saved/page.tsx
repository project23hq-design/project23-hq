import { EmptyState } from "@project23/ui";
import { requireUser } from "@/lib/auth";
import { EventCard } from "@/components/event-card";
import type { EventCardData } from "@/lib/queries";

export const metadata = { title: "Saved events" };

export default async function Saved() {
  const { supabase } = await requireUser("/account/saved");
  const { data: favs } = await supabase
    .from("favorites")
    .select("event_id")
    .order("created_at", { ascending: false });
  const ids = (favs ?? []).map((f) => f.event_id);
  const { data } = ids.length
    ? await supabase.from("public_events").select("*").in("id", ids)
    : { data: [] };
  return (
    <div>
      <h1 className="mb-6 text-3xl font-medium">Saved events</h1>
      {!data?.length ? (
        <EmptyState title="Nothing saved yet">Tap “Save” on any event to keep it here.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {(data as EventCardData[]).map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
