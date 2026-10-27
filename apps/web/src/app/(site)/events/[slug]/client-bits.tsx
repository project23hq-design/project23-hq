"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Share } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { toggleFavoriteAction } from "./actions";

const iconBtn =
  "inline-flex size-9 items-center justify-center rounded-full text-fg hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

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
    <button
      className={iconBtn}
      aria-pressed={on}
      aria-label={on ? "Saved" : "Save event"}
      disabled={pending}
      onClick={() =>
        signedIn
          ? start(async () => setOn(await toggleFavoriteAction(eventId, !on)))
          : router.push(`/sign-in?next=${location.pathname}`)
      }
    >
      <Bookmark className={`size-[18px] ${on ? "fill-fg" : ""}`} />
    </button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={iconBtn}
      aria-label={copied ? "Link copied" : "Share event"}
      onClick={async () => {
        const url = location.href.split("?")[0]!;
        if (navigator.share) {
          await navigator.share({ title, url }).catch(() => undefined);
          return;
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Share className="size-[18px]" />
    </button>
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
