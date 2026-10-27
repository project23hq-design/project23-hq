import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Section({ title, kicker, href, hrefLabel = "See all", note, children, id }: {
  title: string; kicker?: string; href?: string; hrefLabel?: string; note?: string; children: React.ReactNode; id?: string;
}) {
  return (
    <section aria-labelledby={id} className="container-page mt-14 sm:mt-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{kicker}</p>}
          <h2 id={id} className="text-2xl font-bold sm:text-3xl">{title}</h2>
          {note && <p className="mt-1 text-sm text-fg-subtle">{note}</p>}
        </div>
        {href && (
          <Link href={href} className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg lg:mr-24 sm:inline-flex">
            {hrefLabel} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
      {href && <Link href={href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-fg-muted sm:hidden">{hrefLabel} <ArrowRight className="size-4" /></Link>}
    </section>
  );
}
