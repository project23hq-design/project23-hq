"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { formatCardDate } from "@project23/domain";
import type { EventCardData } from "@/lib/queries";
import { EventPoster } from "./poster";
import { OrganizerMark, cardPrice, posterProps } from "./event-card";

const GAP = 16;
const SMALL_RATIO = 202 / 312; // following flyers are 202px when the active one is 312px
const EASE = [0.22, 1, 0.36, 1] as const;

function geometry(width: number) {
  const pad = width < 768 ? 16 : 40;
  const big = width < 640 ? Math.min(312, Math.round(width * 0.62)) : 312;
  const small = Math.round(big * SMALL_RATIO);
  return { width, pad, big, small, step: small + GAP };
}
type Geo = ReturnType<typeof geometry>;

/** Position + scale of a slide `d` places from the active one (d may be fractional mid-move). */
function place(d: number, g: Geo) {
  const x =
    d >= 1
      ? g.pad + g.big + GAP + (d - 1) * g.step
      : d >= 0
        ? g.pad + d * (g.big + GAP)
        : g.pad + d * g.step;
  const scale = 1 - Math.min(Math.abs(d), 1) * (1 - SMALL_RATIO);
  return `translate3d(${x}px,0,0) scale(${scale})`;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Featured strip, edge to edge: an endless track where the active flyer is large with its
 * details underneath and the next ones shrink smoothly as they slide. Arrows, swipe and drag
 * all ease the same continuous position, so every transition glides instead of swapping.
 */
export function FeaturedCarousel({
  events,
  title = "Featured events",
}: {
  events: EventCardData[];
  title?: string;
}) {
  const n = events.length;
  const reduce = useReducedMotion();
  const pos = useMotionValue(0); // continuous slide position; integers are resting points
  const [base, setBase] = useState(0); // rounded position: decides which slides are rendered
  const [measured, setMeasured] = useState<Geo | null>(null);
  const geo = measured ?? geometry(1440);
  const viewport = useRef<HTMLDivElement>(null);
  const slides = useRef(new Map<number, HTMLElement>());
  const target = useRef(0);
  const drag = useRef<{
    x0: number;
    p0: number;
    lastX: number;
    lastT: number;
    vx: number;
    moved: boolean;
  } | null>(null);

  const paint = useCallback(
    (p: number) => {
      for (const [k, el] of slides.current) el.style.transform = place(k - p, geo);
    },
    [geo],
  );

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    // Fires once on observe, then on every resize.
    const ro = new ResizeObserver(() => setMeasured(geometry(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => paint(pos.get()), [paint, pos, base]);

  useEffect(
    () =>
      pos.on("change", (p) => {
        paint(p);
        const r = Math.round(p);
        setBase((b) => (b === r ? b : r));
      }),
    [pos, paint],
  );

  const settle = useCallback(
    (to: number) => {
      target.current = to;
      animate(pos, to, reduce ? { duration: 0 } : { duration: 0.65, ease: EASE });
    },
    [pos, reduce],
  );
  const go = (d: number) => settle(target.current + d);

  if (n === 0) return null;
  const active = events[mod(base, n)]!;
  const visibleAfter = Math.ceil(geo.width / geo.step) + 1;
  const keys: number[] = [];
  for (let k = base - 2; k <= base + visibleAfter; k++) keys.push(k);

  const onPointerDown = (e: React.PointerEvent) => {
    if (n < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    pos.stop();
    drag.current = {
      x0: e.clientX,
      p0: pos.get(),
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
      moved: false,
    };
    const move = (ev: PointerEvent) => {
      const d = drag.current!;
      const dx = ev.clientX - d.x0;
      if (Math.abs(dx) > 6) d.moved = true;
      const dt = Math.max(1, ev.timeStamp - d.lastT);
      d.vx = 0.7 * ((ev.clientX - d.lastX) / dt) + 0.3 * d.vx; // px per ms, smoothed
      d.lastX = ev.clientX;
      d.lastT = ev.timeStamp;
      pos.set(d.p0 - dx / geo.step);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = drag.current!;
      const fling = (-d.vx * 250) / geo.step; // project ~250ms of momentum past the release
      const start = Math.round(d.p0);
      const to = Math.max(start - 3, Math.min(start + 3, Math.round(pos.get() + fling)));
      settle(to);
      if (!d.moved) drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  // A drag must not also open the flyer it started on.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current = null;
  };

  const arrows = n > 1 && (
    <div className="flex gap-2">
      <button
        onClick={() => go(-1)}
        aria-label="Previous featured event"
        className="inline-flex size-8 items-center justify-center rounded-lg bg-white/[0.08] text-fg transition-colors hover:bg-white/[0.14]"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        onClick={() => go(1)}
        aria-label="Next featured event"
        className="inline-flex size-8 items-center justify-center rounded-lg bg-white/[0.08] text-fg transition-colors hover:bg-white/[0.14]"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
  const posterH = Math.round(geo.big * 1.25);

  return (
    <section aria-labelledby="featured-h" className="relative -mx-4 md:-mx-10">
      <div
        className="mb-6 flex items-center justify-between"
        style={{ paddingLeft: geo.pad, paddingRight: geo.pad }}
      >
        <h2 id="featured-h" className="text-base font-normal">
          {title} <span className="text-fg-muted">{n}</span>
        </h2>
        <div className="sm:hidden">{arrows}</div>
      </div>
      <div
        ref={viewport}
        className="relative cursor-grab touch-pan-y select-none overflow-hidden transition-opacity duration-300 active:cursor-grabbing"
        style={{ height: posterH, opacity: measured ? 1 : 0 }}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        {keys.map((k) => {
          const e = events[mod(k, n)]!;
          const isActive = k === base;
          return (
            <Link
              key={k}
              ref={(el) => {
                if (el) slides.current.set(k, el);
                else slides.current.delete(k);
              }}
              href={`/events/${e.slug}`}
              tabIndex={isActive ? undefined : -1}
              aria-hidden={isActive ? undefined : true}
              draggable={false}
              className="absolute left-0 top-0 block origin-top-left rounded outline-none will-change-transform focus-visible:ring-2 focus-visible:ring-ring"
              style={{ width: geo.big, transform: place(k - base, geo) }}
            >
              <EventPoster {...posterProps(e)} priority={k === 0} sizes="312px" />
            </Link>
          );
        })}
        <div
          className="absolute hidden sm:block"
          style={{ right: geo.pad, top: posterH - 32 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {arrows}
        </div>
      </div>
      <motion.div
        key={active.id}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="mt-4"
        style={{ marginLeft: geo.pad, width: geo.big }}
        aria-live="polite"
      >
        <OrganizerMark
          name={active.organization_name}
          firstParty={active.is_first_party}
          verified={active.organization_verified}
        />
        <Link
          href={`/events/${active.slug}`}
          className="mt-3 block text-base leading-6 hover:underline"
        >
          {active.title}
        </Link>
        <p className="mt-3 truncate text-xs text-fg-muted">{cardPrice(active)}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {formatCardDate(active.starts_at!, active.ends_at, active.timezone!)}
        </p>
      </motion.div>
    </section>
  );
}
