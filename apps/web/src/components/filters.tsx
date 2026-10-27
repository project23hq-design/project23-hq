"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button, Input, Select } from "@project23/ui";

/** URL-driven filters. Works as a plain GET form without JavaScript; enhanced to auto-apply. */
export function ExploreFilters({
  cities,
  categories,
}: {
  cities: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries())
      if (typeof v === "string" && v && v !== "all") next.set(k, v);
    start(() => router.push(`/explore${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const active = ["q", "city", "category", "when", "price", "region"].some((k) => params.get(k));
  return (
    <form
      method="get"
      action="/explore"
      role="search"
      aria-label="Filter events"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") apply(e.currentTarget);
      }}
      className="grid gap-3 rounded-3xl border border-line bg-surface-1 p-3 sm:p-4 lg:grid-cols-[1.6fr_repeat(4,1fr)_auto]"
    >
      <label className="relative block lg:col-span-1">
        <span className="sr-only">Search events</span>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <Input
          name="q"
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search events, venues, organizers"
          className="pl-10"
          maxLength={80}
        />
      </label>
      <label>
        <span className="sr-only">City</span>
        <Select name="city" defaultValue={params.get("city") ?? ""}>
          <option value="">All locations</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className="sr-only">Category</span>
        <Select name="category" defaultValue={params.get("category") ?? ""}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className="sr-only">Date</span>
        <Select name="when" defaultValue={params.get("when") ?? "all"}>
          <option value="all">Any date</option>
          <option value="today">Today</option>
          <option value="weekend">This weekend</option>
          <option value="week">Next 7 days</option>
          <option value="month">Next 30 days</option>
        </Select>
      </label>
      <label>
        <span className="sr-only">Price</span>
        <Select name="price" defaultValue={params.get("price") ?? "all"}>
          <option value="all">Free & paid</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </Select>
      </label>
      <div className="flex gap-2">
        <label className="flex-1 lg:hidden">
          <span className="sr-only">Sort</span>
          <Select name="sort" defaultValue={params.get("sort") ?? "soonest"}>
            <option value="soonest">Soonest</option>
            <option value="price_low">Lowest price</option>
            <option value="price_high">Highest price</option>
            <option value="newest">Newly listed</option>
          </Select>
        </label>
        <Button type="submit" loading={pending}>
          Search
        </Button>
        {active && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear filters"
            onClick={() => start(() => router.push("/explore"))}
          >
            <X />
          </Button>
        )}
      </div>
    </form>
  );
}

export function SortSelect() {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="hidden items-center gap-2 text-sm text-fg-muted lg:flex">
      Sort
      <Select
        className="h-9 w-44"
        value={params.get("sort") ?? "soonest"}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set("sort", e.target.value);
          next.delete("page");
          router.push(`/explore?${next}`, { scroll: false });
        }}
      >
        <option value="soonest">Soonest</option>
        <option value="price_low">Lowest price</option>
        <option value="price_high">Highest price</option>
        <option value="newest">Newly listed</option>
      </Select>
    </label>
  );
}
