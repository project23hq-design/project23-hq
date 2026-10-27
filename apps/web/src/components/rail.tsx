"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@project23/ui";

/** Horizontal scroll-snap rail with keyboard-accessible prev/next controls. */
export function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={ref} role="list" aria-label={label}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:px-0 lg:scroll-px-0">
        {children}
      </div>
      <div className="pointer-events-none absolute -top-14 right-0 hidden gap-2 lg:flex">
        <Button variant="secondary" size="icon" className="pointer-events-auto" aria-label={`Scroll ${label} back`} onClick={() => scroll(-1)}><ChevronLeft /></Button>
        <Button variant="secondary" size="icon" className="pointer-events-auto" aria-label={`Scroll ${label} forward`} onClick={() => scroll(1)}><ChevronRight /></Button>
      </div>
    </div>
  );
}

export function RailItem({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div role="listitem" className={`shrink-0 snap-start ${wide ? "w-[78vw] sm:w-[340px]" : "w-[62vw] sm:w-[240px]"}`}>{children}</div>;
}
