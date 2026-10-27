import Image from "next/image";
import { cn } from "@project23/ui";
import { publicStorageUrl } from "@/lib/supabase/storage";

/**
 * Event artwork. Uses the organizer's uploaded poster when present; otherwise renders a
 * deterministic typographic poster in pure CSS (zero image bytes — kind to low bandwidth).
 */
const PALETTES: Record<string, [string, string, string]> = {
  music: ["#f5a524", "#e8505b", "#2b1055"],
  nightlife: ["#8b5cf6", "#ec4899", "#0f0a1e"],
  comedy: ["#facc15", "#f97316", "#1a1206"],
  conferences: ["#38bdf8", "#6366f1", "#0a1424"],
  campus: ["#22c55e", "#14b8a6", "#06140f"],
  workshops: ["#fb923c", "#f43f5e", "#1d0c0c"],
  community: ["#34d399", "#f5a524", "#0b1712"],
  "arts-culture": ["#f472b6", "#f5a524", "#1c0d16"],
  "food-drink": ["#f97316", "#facc15", "#1f0f05"],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function EventPoster({
  slug,
  title,
  coverPath,
  coverAlt,
  category,
  dateLabel,
  className,
  sizes = "(max-width: 640px) 80vw, 320px",
  priority,
  variant = "portrait",
}: {
  slug: string;
  title: string;
  coverPath?: string | null;
  coverAlt?: string | null;
  category?: string | null;
  dateLabel?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  variant?: "portrait" | "square" | "wide";
}) {
  const aspect =
    variant === "portrait"
      ? "aspect-[4/5]"
      : variant === "square"
        ? "aspect-square"
        : "aspect-[16/9]";
  const url = publicStorageUrl(coverPath);
  if (url) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl bg-surface-2", aspect, className)}>
        <Image
          src={url}
          alt={coverAlt || `Poster for ${title}`}
          fill
          sizes={sizes}
          priority={priority}
          quality={75}
          className="object-cover"
        />
      </div>
    );
  }
  const [a, b, c] = PALETTES[category ?? ""] ?? PALETTES.music!;
  const h = hash(slug);
  const x1 = 15 + (h % 60),
    y1 = 10 + ((h >> 8) % 40),
    x2 = 30 + ((h >> 16) % 60),
    y2 = 55 + ((h >> 24) % 40);
  const rotate = (h % 2 ? -1 : 1) * (4 + (h % 7));
  return (
    <div
      role="img"
      aria-label={`Artwork for ${title}`}
      className={cn("relative isolate overflow-hidden rounded-2xl", aspect, className)}
      style={{
        background: `radial-gradient(circle at ${x1}% ${y1}%, ${a} 0%, transparent 55%), radial-gradient(circle at ${x2}% ${y2}%, ${b} 0%, transparent 60%), ${c}`,
      }}
    >
      <div className="absolute inset-0 opacity-25 mix-blend-overlay [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.18)_0_1px,transparent_1px_3px)]" />
      <div
        className="absolute -right-6 -top-6 size-40 rounded-full border-[18px] border-white/10"
        style={{ transform: `rotate(${rotate}deg)` }}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
        {dateLabel && (
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
            {dateLabel}
          </span>
        )}
        <span
          className={cn(
            "font-display font-extrabold uppercase leading-[0.92] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.35)]",
            variant === "wide" ? "text-3xl sm:text-5xl" : "text-[clamp(1.25rem,5.5vw,1.9rem)]",
            "line-clamp-4",
          )}
        >
          {title}
        </span>
      </div>
    </div>
  );
}
