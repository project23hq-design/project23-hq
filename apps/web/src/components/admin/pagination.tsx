import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@project23/ui";

export const ADMIN_PAGE_SIZE = 25;

/** Parse ?page= into a 1-based page number and the matching row range. */
export function pageRange(page: string | undefined, size = ADMIN_PAGE_SIZE) {
  const n = Math.max(1, Math.min(10_000, Number.parseInt(page ?? "1", 10) || 1));
  return { page: n, from: (n - 1) * size, to: n * size - 1, size };
}

/** "Showing 26–50 of 312" plus previous/next links that keep the other query params. */
export function Pagination({
  basePath,
  params,
  page,
  total,
  size = ADMIN_PAGE_SIZE,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(total, page * size);
  const link = (p: number, enabled: boolean, label: string, icon: React.ReactNode) =>
    enabled ? (
      <Link
        href={href(p)}
        aria-label={label}
        className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-white/[0.06] hover:text-fg"
      >
        {icon}
      </Link>
    ) : (
      <span
        aria-hidden
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-full text-fg-subtle/40",
        )}
      >
        {icon}
      </span>
    );
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 pt-3 text-xs text-fg-muted"
    >
      <span className="tabular-nums">
        {total === 0
          ? "No results"
          : `Showing ${first}–${last} of ${total.toLocaleString("en-NG")}`}
      </span>
      <span className="flex items-center gap-1">
        {link(page - 1, page > 1, "Previous page", <ChevronLeft className="size-4" />)}
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        {link(page + 1, page < pages, "Next page", <ChevronRight className="size-4" />)}
      </span>
    </nav>
  );
}
