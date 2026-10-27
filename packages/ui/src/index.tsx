/**
 * Project23 UI primitives (shadcn/ui-style: Radix behaviour + Tailwind tokens defined in
 * apps/web/src/app/globals.css). Colors reference semantic tokens, never raw hex.
 * This module is server-safe; interactive Radix-based parts live in ./client.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";
export { cn, buttonVariants } from "./utils";

// ---------------------------------------------------------------- Form controls
const fieldBase =
  "w-full rounded-xl border border-line bg-surface-1 px-3.5 text-fg placeholder:text-fg-subtle transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, "h-11 text-[15px]", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, "min-h-28 py-3 text-[15px]", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10 text-[15px] select-chevron", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

/** Label + control + hint/error with correct aria wiring. */
export function Field({
  label, htmlFor, hint, error, required, children, className,
}: {
  label: React.ReactNode; htmlFor: string; hint?: React.ReactNode; error?: string | null; required?: boolean;
  children: React.ReactNode; className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errId = error ? `${htmlFor}-error` : undefined;
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined,
        required,
      })
    : children;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label className="text-sm font-medium text-fg" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-fg-subtle" aria-hidden>*</span>}
      </label>
      {child}
      {hint && !error && <p id={hintId} className="text-xs text-fg-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Surfaces
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface-1", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-lg font-semibold tracking-tight", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-fg-muted",
        accent: "bg-accent/15 text-accent",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/15 text-danger",
        info: "bg-info/15 text-info",
        solid: "bg-fg text-bg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none", className)} {...props} />;
}

export function Alert({
  tone = "info", title, children, className,
}: { tone?: "info" | "success" | "warning" | "danger"; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-info/30 bg-info/10",
    success: "border-success/30 bg-success/10",
    warning: "border-warning/40 bg-warning/10",
    danger: "border-danger/40 bg-danger/10",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-2xl border p-4 text-sm", tones[tone], className)}>
      {title && <p className="font-semibold text-fg">{title}</p>}
      {children && <div className={cn("text-fg-muted", title && "mt-1")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: {
  icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="text-fg-subtle [&_svg]:size-8">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-fg-muted">{children}</div>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Data table shell
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-line">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("border-b border-line bg-surface-1 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-subtle", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...props} />;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export { Button, Label, Dialog, DialogTrigger, DialogClose, DialogContent, Tabs, TabsList, TabsTrigger, TabsContent,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "./client";
export type { ButtonProps } from "./client";
