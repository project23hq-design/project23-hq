"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@project23/ui";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { toggleFavoriteAction } from "./actions";

export function FavoriteButton({
  eventId,
  initial,
  signedIn,
}: {
  eventId: string;
  initial: boolean;
  signedIn: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={on}
      loading={pending}
      onClick={() =>
        signedIn
          ? start(async () => setOn(await toggleFavoriteAction(eventId, !on)))
          : router.push(`/sign-in?next=${location.pathname}`)
      }
    >
      <Heart className={on ? "fill-accent text-accent" : ""} /> {on ? "Saved" : "Save"}
    </Button>
  );
}

/** Counts a page view (aggregated per day; no visitor identifiers are stored). */
export function ViewBeacon({ eventId }: { eventId: string }) {
  useEffect(() => {
    const key = `p23v:${eventId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    createBrowserSupabase()
      .rpc("record_event_view", { p_event: eventId })
      .then(() => undefined);
  }, [eventId]);
  return null;
}
