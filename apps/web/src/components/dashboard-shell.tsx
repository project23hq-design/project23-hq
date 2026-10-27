import Link from "next/link";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { cn } from "@project23/ui";
import { Wordmark } from "./site-header";
import { PillNav, SideNav, type NavLink } from "./side-nav";

/**
 * Workspace frame for organizer and platform-admin screens: sticky 240px sidebar on desktop
 * (wordmark, context switcher, icon nav, footer links), a slim top bar + pill row on mobile.
 */
export function DashboardShell({
  label,
  context,
  links,
  footerLinks = [],
  footnote,
  children,
}: {
  label: string;
  context?: React.ReactNode;
  links: NavLink[];
  footerLinks?: NavLink[];
  footnote?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="no-print sticky top-0 z-30 hidden h-dvh flex-col overflow-y-auto border-r border-white/[0.05] bg-[#0b0b0d] px-3 py-4 lg:flex">
        <Link
          href="/"
          aria-label="Project23 home"
          className="mb-5 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Wordmark />
        </Link>
        {context && <div className="mb-5">{context}</div>}
        <SideNav links={links} label={label} />
        <div className="mt-auto grid gap-3">
          {footerLinks.length > 0 && <SideNav links={footerLinks} label={`${label} shortcuts`} />}
          {footnote && <div className="px-3 text-[11px] leading-4 text-fg-subtle">{footnote}</div>}
        </div>
      </aside>

      <header className="no-print sticky top-0 z-30 border-b border-white/[0.05] bg-bg/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" aria-label="Project23 home">
            <Wordmark className="text-[17px]" />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">{context}</div>
        </div>
        <PillNav links={[...links, ...footerLinks]} label={`${label} (mobile)`} />
      </header>

      <main id="main" className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}

/** Slim top bar for single-purpose workspace screens (org picker, gate). */
export function WorkspaceTopBar({
  back,
  children,
}: {
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-white/[0.05] bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-4 sm:px-8">
        {back ? (
          <Link
            href={back.href}
            className="-ml-2 inline-flex h-8 items-center gap-1 rounded-full pl-1 pr-3 text-xs font-medium text-fg-muted hover:bg-white/[0.06] hover:text-fg"
          >
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        ) : (
          <Link href="/" aria-label="Project23 home">
            <Wordmark className="text-[17px]" />
          </Link>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {children}
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium text-fg-muted hover:text-fg"
          >
            Site <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Page title row: 28px medium title, muted description, actions on the right. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs text-fg-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title used inside workspace pages (icon optional), with a hairline above. */
export function SectionTitle({
  icon,
  children,
  action,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-medium [&_svg]:size-4 [&_svg]:text-fg-muted">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Text tab links (server-rendered; the caller decides which one is active). */
export function TabLinks({
  label,
  links,
}: {
  label: string;
  links: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav
      aria-label={label}
      className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors",
            l.active ? "bg-white/[0.1] text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
