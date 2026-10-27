"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Search, X } from "lucide-react";
import { cn } from "@project23/ui";

type Opt = { value: string; label: string };

/** Pill filters that open small dark popovers (Location · Date · Price), plus search and sort. URL is the source of truth. */
export function ExploreFilters({ cities }: { cities: { slug: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.push(`/explore${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const cityName = cities.find((c) => c.slug === params.get("city"))?.name;
  const whenOpts: Opt[] = [
    { value: "today", label: "Today" },
    { value: "weekend", label: "This weekend" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];
  const priceOpts: Opt[] = [
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ];
  const sortOpts: Opt[] = [
    { value: "soonest", label: "Soonest" },
    { value: "newest", label: "Newly listed" },
    { value: "price_low", label: "Price: low to high" },
    { value: "price_high", label: "Price: high to low" },
  ];
  return (
    <div
      role="group"
      aria-label="Filter events"
      className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <SearchPill
        key={params.get("q") ?? ""}
        value={params.get("q") ?? ""}
        onSubmit={(v) => set("q", v || null)}
      />
      <CityPill
        cities={cities}
        value={params.get("city")}
        label={cityName ?? "Location"}
        onChange={(v) => set("city", v)}
      />
      <RadioPill
        label={whenOpts.find((o) => o.value === params.get("when"))?.label ?? "Date"}
        name="Date"
        options={whenOpts}
        value={params.get("when")}
        onChange={(v) => set("when", v)}
        anyLabel="Any date"
      />
      <RadioPill
        label={priceOpts.find((o) => o.value === params.get("price"))?.label ?? "Price"}
        name="Price"
        options={priceOpts}
        value={params.get("price")}
        onChange={(v) => set("price", v)}
        anyLabel="Any price"
      />
      <RadioPill
        label={sortOpts.find((o) => o.value === params.get("sort"))?.label ?? "Sort"}
        name="Sort"
        options={sortOpts}
        value={params.get("sort")}
        onChange={(v) => set("sort", v === "soonest" ? null : v)}
      />
    </div>
  );
}

const pill =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.05] bg-white/[0.015] px-4 text-sm font-medium text-fg outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-white/[0.06]";
const panel =
  "z-50 w-64 rounded-xl border border-white/[0.06] bg-[#18181b] p-2 shadow-pop data-[state=open]:animate-in-fade";

function Radio({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none"
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full border",
          checked ? "border-fg" : "border-white/25",
        )}
      >
        {checked && <span className="size-1.5 rounded-full bg-brand" />}
      </span>
      {label}
    </button>
  );
}

function RadioPill({
  label,
  name,
  options,
  value,
  onChange,
  anyLabel,
}: {
  label: string;
  name: string;
  options: Opt[];
  value: string | null;
  onChange: (v: string | null) => void;
  anyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(pill, value && "bg-brand-soft text-brand")}
        aria-label={`${name}: ${label}`}
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className={panel}>
          <div role="radiogroup" aria-label={name}>
            {anyLabel && <Radio checked={!value} label={anyLabel} onSelect={() => pick(null)} />}
            {options.map((o) => (
              <Radio
                key={o.value}
                checked={value === o.value || (!value && !anyLabel && o === options[0])}
                label={o.label}
                onSelect={() => pick(o.value)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CityPill({
  cities,
  value,
  label,
  onChange,
}: {
  cities: { slug: string; name: string }[];
  value: string | null;
  label: string;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = cities.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={cn(pill, value && "bg-brand-soft text-brand")}
        aria-label={`Location: ${label}`}
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className={panel}>
          <label className="mb-1 flex items-center gap-2 border-b border-white/[0.06] px-2.5 pb-2.5 pt-1.5">
            <Search className="size-4 text-fg-muted" aria-hidden />
            <span className="sr-only">Search for a city</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for a city"
              className="w-full bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Location" className="max-h-72 overflow-y-auto">
            {!q && <Radio checked={!value} label="All locations" onSelect={() => pick(null)} />}
            {list.map((c) => (
              <Radio
                key={c.slug}
                checked={value === c.slug}
                label={c.name}
                onSelect={() => pick(c.slug)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SearchPill({ value, onSubmit }: { value: string; onSubmit: (v: string) => void }) {
  const [open, setOpen] = useState(!!value);
  const [q, setQ] = useState(value);
  if (!open) {
    return (
      <button className={pill} onClick={() => setOpen(true)} aria-label="Search events">
        <Search className="size-4" />
      </button>
    );
  }
  return (
    <form
      role="search"
      className={cn(pill, "w-56 px-3")}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q.trim());
      }}
    >
      <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <label className="sr-only" htmlFor="explore-q">
        Search events
      </label>
      <input
        id="explore-q"
        name="q"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        maxLength={80}
        className="w-full bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
      />
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => {
          setQ("");
          setOpen(false);
          if (value) onSubmit("");
        }}
        className="text-fg-muted hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}
