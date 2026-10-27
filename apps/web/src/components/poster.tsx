import Image from "next/image";
import { cn } from "@project23/ui";
import { publicStorageUrl } from "@/lib/supabase/storage";

export interface PosterProps {
  slug: string;
  title: string;
  coverPath?: string | null;
  coverAlt?: string | null;
  category?: string | null;
  startsAt?: string | null;
  timezone?: string | null;
  venue?: string | null;
  city?: string | null;
  organizer?: string | null;
  tags?: string[] | null;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** 4:5 flyer (default) or 1:1 thumbnail */
  shape?: "flyer" | "square";
  rounded?: "sm" | "md";
}

/**
 * Event artwork. Real uploaded flyers are shown as-is (object-cover, 4px corners like the
 * reference). Events without a flyer get a typographic placeholder flyer generated from the
 * event's own data — layout chosen by category, so a grid never looks repetitive.
 */
export function EventPoster(p: PosterProps) {
  const aspect = p.shape === "square" ? "aspect-square" : "aspect-[4/5]";
  const radius = p.rounded === "md" ? "rounded-lg" : "rounded";
  const url = publicStorageUrl(p.coverPath);
  if (url) {
    return (
      <div className={cn("relative overflow-hidden bg-white/[0.04]", aspect, radius, p.className)}>
        <Image
          src={url}
          alt={p.coverAlt || `Flyer for ${p.title}`}
          fill
          sizes={p.sizes ?? "(max-width: 640px) 50vw, 240px"}
          priority={p.priority}
          quality={75}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`Flyer for ${p.title}`}
      className={cn(
        "relative overflow-hidden [container-type:inline-size]",
        aspect,
        radius,
        p.className,
      )}
    >
      <Flyer {...p} />
    </div>
  );
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function dateBits(startsAt?: string | null, tz?: string | null) {
  if (!startsAt) return { dow: "", day: "", mon: "", time: "" };
  const d = new Date(startsAt);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...o, timeZone: tz ?? "Africa/Lagos" }).format(d);
  return {
    dow: f({ weekday: "short" }).toUpperCase(),
    day: f({ day: "2-digit" }),
    mon: f({ month: "short" }).toUpperCase(),
    time: f({ hour: "numeric", hour12: true }).replace(" ", "").toUpperCase(),
  };
}

const anton = "var(--font-anton), Impact, sans-serif";
const serif = "var(--font-playfair), Georgia, serif";
const mono = "var(--font-plex-mono), ui-monospace, monospace";
const tight = "var(--font-inter-tight), system-ui, sans-serif";

const CLUB = [
  { glow: "#ff2d95", glow2: "#6a00ff", ink: "#ff5bb0" },
  { glow: "#00e0ff", glow2: "#0044ff", ink: "#7df3ff" },
  { glow: "#b6ff00", glow2: "#00a86b", ink: "#d4ff4f" },
  { glow: "#ff7a00", glow2: "#ff003c", ink: "#ffb15c" },
];

function Flyer(p: PosterProps) {
  const h = hash(p.slug);
  const d = dateBits(p.startsAt, p.timezone);
  const title = p.title.replace(/\(fictional\)/gi, "").trim();
  const words = title.split(/\s+/);
  const venue = (p.venue ?? "").replace(/\s*\(fictional\)/i, "");
  const tags = (p.tags ?? []).slice(0, 3).map((t) => t.replace(/-/g, " ").toUpperCase());
  const cat = p.category ?? "";
  const live = (p.tags ?? []).some((t) => /live|band|highlife|choir/.test(t));
  const kind =
    cat === "comedy"
      ? "comedy"
      : cat === "conferences" || cat === "workshops" || cat === "campus"
        ? "swiss"
        : cat === "arts-culture"
          ? "arts"
          : cat === "food-drink"
            ? "food"
            : cat === "community"
              ? "community"
              : cat === "music" && live
                ? "live"
                : "club";

  if (kind === "comedy") {
    return (
      <div className="absolute inset-0 flex flex-col bg-[#ffd400] p-[6cqw] text-black">
        <div
          className="flex items-start justify-between"
          style={{ fontFamily: mono, fontSize: "3.4cqw" }}
        >
          <span>{(p.organizer ?? "").toUpperCase()} PRESENTS</span>
          <span>{d.time}</span>
        </div>
        <div
          className="mt-[4cqw] leading-[0.86] tracking-tight"
          style={{ fontFamily: anton, fontSize: words.join(" ").length > 16 ? "17cqw" : "22cqw" }}
        >
          {title.toUpperCase()}
        </div>
        <div
          className="absolute right-[6cqw] top-[48%] flex size-[24cqw] rotate-[-14deg] items-center justify-center rounded-full bg-[#e3122b] text-center leading-none text-[#ffd400]"
          style={{ fontFamily: anton, fontSize: "7cqw" }}
        >
          LIVE
          <br />
          ON
          <br />
          STAGE
        </div>
        <div
          className="mt-auto -mx-[6cqw] -mb-[6cqw] flex items-center justify-between bg-black px-[6cqw] py-[4cqw] text-[#ffd400]"
          style={{ fontFamily: anton, fontSize: "6cqw" }}
        >
          <span>
            {d.dow} {d.day} {d.mon}
          </span>
          <span className="truncate pl-2" style={{ fontSize: "4cqw" }}>
            {venue.toUpperCase()}
          </span>
        </div>
      </div>
    );
  }

  if (kind === "swiss") {
    const accent = ["#ff4f00", "#0047ff", "#00a35c"][h % 3];
    return (
      <div
        className="absolute inset-0 flex flex-col bg-[#ecebe6] p-[6cqw] text-[#111]"
        style={{ fontFamily: tight }}
      >
        <div
          className="flex items-center justify-between border-b border-black/80 pb-[2cqw]"
          style={{ fontFamily: mono, fontSize: "3.2cqw" }}
        >
          <span>{(p.organizer ?? "").toUpperCase()}</span>
          <span>{(p.city ?? "").toUpperCase()}</span>
        </div>
        <div className="mt-[3cqw] flex items-start gap-[3cqw]">
          <div
            className="leading-[0.8] tracking-[-0.04em]"
            style={{ fontSize: "30cqw", fontWeight: 600 }}
          >
            {d.day}
          </div>
          <div className="pt-[2cqw] leading-tight" style={{ fontFamily: mono, fontSize: "4cqw" }}>
            {d.mon}
            <br />
            {d.dow}
            <br />
            {d.time}
          </div>
          <div className="ml-auto mt-[2cqw] size-[9cqw]" style={{ background: accent }} />
        </div>
        <div
          className="mt-auto leading-[0.98] tracking-[-0.03em]"
          style={{ fontSize: title.length > 28 ? "8.5cqw" : "10.5cqw", fontWeight: 600 }}
        >
          {title}
        </div>
        <div
          className="mt-[3cqw] flex flex-wrap gap-x-[3cqw] border-t border-black/80 pt-[2cqw]"
          style={{ fontFamily: mono, fontSize: "3.2cqw" }}
        >
          {tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
          <span className="ml-auto">{venue.toUpperCase()}</span>
        </div>
      </div>
    );
  }

  if (kind === "live") {
    return (
      <div className="absolute inset-0 flex flex-col items-center bg-[#6e1a10] p-[7cqw] text-center text-[#f6e3c4]">
        <div className="absolute left-1/2 top-[18%] size-[62cqw] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#ff9a3c_0%,#e2531d_55%,transparent_70%)] opacity-90" />
        <div
          className="relative tracking-[0.35em]"
          style={{ fontFamily: mono, fontSize: "3.2cqw" }}
        >
          {(p.organizer ?? "").toUpperCase()}
        </div>
        <div
          className="relative mt-auto leading-[0.95]"
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: title.length > 20 ? "11cqw" : "14cqw",
          }}
        >
          {title}
        </div>
        <div
          className="relative mt-[4cqw] tracking-[0.4em]"
          style={{ fontFamily: anton, fontSize: "5cqw" }}
        >
          LIVE BAND
        </div>
        <div
          className="relative mt-[4cqw] w-full border-t border-[#f6e3c4]/50 pt-[3cqw]"
          style={{ fontFamily: mono, fontSize: "3.4cqw" }}
        >
          {d.dow} {d.day} {d.mon} · {d.time} · {venue.toUpperCase()}
        </div>
      </div>
    );
  }

  if (kind === "arts") {
    return (
      <div className="absolute inset-0 bg-[#0f2d24] p-[5cqw] text-[#efe6d2]">
        <div className="flex h-full flex-col border border-[#efe6d2]/70 p-[5cqw]">
          <div className="tracking-[0.3em]" style={{ fontFamily: mono, fontSize: "3cqw" }}>
            {(p.organizer ?? "").toUpperCase()}
          </div>
          <div
            className="my-auto leading-[0.95]"
            style={{
              fontFamily: serif,
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: title.length > 22 ? "11cqw" : "14cqw",
            }}
          >
            {title}
          </div>
          <div
            className="flex items-end justify-between"
            style={{ fontFamily: mono, fontSize: "3.2cqw" }}
          >
            <span>
              {d.dow} {d.day} {d.mon}
              <br />
              {d.time}
            </span>
            <span className="text-right">
              {venue.toUpperCase()}
              <br />
              {(p.city ?? "").toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "food") {
    return (
      <div className="absolute inset-0 flex flex-col bg-[#f7efe1] text-[#c8102e]">
        <div className="h-[16cqw] bg-[repeating-conic-gradient(#c8102e_0_25%,#f7efe1_0_50%)] bg-[length:8cqw_8cqw]" />
        <div className="flex flex-1 flex-col p-[6cqw]">
          <div style={{ fontFamily: mono, fontSize: "3.2cqw" }} className="text-black/70">
            {(p.organizer ?? "").toUpperCase()}
          </div>
          <div
            className="mt-[2cqw] leading-[0.88]"
            style={{ fontFamily: anton, fontSize: "17cqw" }}
          >
            {title.toUpperCase()}
          </div>
          <div
            className="mt-auto flex items-end justify-between text-black"
            style={{ fontFamily: anton, fontSize: "6cqw" }}
          >
            <span>
              {d.day} {d.mon}
            </span>
            <span style={{ fontSize: "3.6cqw", fontFamily: mono }}>{venue.toUpperCase()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "community") {
    return (
      <div className="absolute inset-0 flex flex-col items-center bg-[#1c3fd6] p-[7cqw] text-center text-white">
        <div className="absolute -bottom-[30cqw] left-1/2 size-[110cqw] -translate-x-1/2 rounded-full border-[1.2cqw] border-white/20" />
        <div className="absolute -bottom-[18cqw] left-1/2 size-[80cqw] -translate-x-1/2 rounded-full border-[1.2cqw] border-white/25" />
        <div className="relative tracking-[0.3em]" style={{ fontFamily: mono, fontSize: "3.2cqw" }}>
          FREE ENTRY · ALL WELCOME
        </div>
        <div
          className="relative mt-[8cqw] leading-[0.9]"
          style={{ fontFamily: anton, fontSize: title.length > 22 ? "13cqw" : "16cqw" }}
        >
          {title.toUpperCase()}
        </div>
        <div className="relative mt-auto" style={{ fontFamily: anton, fontSize: "7cqw" }}>
          {d.dow} {d.day} {d.mon}
        </div>
        <div className="relative" style={{ fontFamily: mono, fontSize: "3.4cqw" }}>
          {venue.toUpperCase()}
        </div>
      </div>
    );
  }

  // club / nightlife / default
  const c = CLUB[h % CLUB.length]!;
  const big = title.toUpperCase();
  return (
    <div className="absolute inset-0 flex flex-col bg-[#070707] p-[6cqw] text-white">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 55% at ${30 + (h % 40)}% 38%, ${c.glow}66 0%, transparent 70%), radial-gradient(60% 45% at ${70 - (h % 30)}% 75%, ${c.glow2}55 0%, transparent 70%)`,
        }}
      />
      <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(#fff_0.6px,transparent_0.7px)] [background-size:3cqw_3cqw]" />
      <div
        className="relative flex justify-between"
        style={{ fontFamily: mono, fontSize: "3.2cqw" }}
      >
        <span>{(p.organizer ?? "").toUpperCase()} PRESENTS</span>
        <span>{d.time} TILL LATE</span>
      </div>
      <div
        className="relative mt-[6cqw] leading-[0.84]"
        style={{ fontFamily: anton, fontSize: big.length > 20 ? "16cqw" : "21cqw" }}
      >
        {words.map((w, i) => (
          <span
            key={i}
            className="block"
            style={
              i % 2
                ? { color: "transparent", WebkitTextStroke: `0.5cqw ${c.ink}` }
                : { color: i === 0 ? "#fff" : c.ink }
            }
          >
            {w.toUpperCase()}
          </span>
        ))}
      </div>
      <div className="relative mt-auto flex items-end justify-between gap-[3cqw]">
        <div
          style={{ fontFamily: mono, fontSize: "3.2cqw" }}
          className="leading-snug text-white/85"
        >
          {tags.join(" · ")}
        </div>
        <div className="text-right leading-[0.85]" style={{ fontFamily: anton }}>
          <div style={{ fontSize: "5cqw", color: c.ink }}>{d.dow}</div>
          <div style={{ fontSize: "13cqw" }}>{d.day}</div>
          <div style={{ fontSize: "5cqw" }}>{d.mon}</div>
        </div>
      </div>
      <div
        className="relative -mx-[6cqw] -mb-[6cqw] mt-[4cqw] truncate px-[6cqw] py-[2.5cqw] text-black"
        style={{ background: c.ink, fontFamily: mono, fontSize: "3.2cqw" }}
      >
        {venue.toUpperCase()}
        {p.city ? ` — ${p.city.toUpperCase()}` : ""}
      </div>
    </div>
  );
}
