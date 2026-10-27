/** Section-heading count, shown as a small periwinkle pill (a Project23 signature). */
export function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-soft px-1.5 align-[2px] text-[11px] font-semibold tabular-nums text-brand">
      {children}
    </span>
  );
}
