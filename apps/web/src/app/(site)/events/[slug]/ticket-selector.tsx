"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { ArrowLeft, Lock, Minus, Plus, X } from "lucide-react";
import { availabilityLabel, formatMoney, type TicketAvailability } from "@project23/domain";
import { Alert, cn } from "@project23/ui";
import { createOrderAction, quoteAction, type QuoteResult } from "./actions";

export interface SelectorTicket {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  admissions_per_unit: number;
  min_per_order: number;
  max_per_order: number;
  availability: TicketAvailability;
  requires_access_code: boolean;
  opens_after_name: string | null;
  few_left: boolean;
  sales_end_at: string | null;
}

interface BuyerForm {
  name: string;
  email: string;
  phone: string;
  acceptTerms: boolean;
}

/**
 * Sticky "Buy tickets from ₦…" pill (tinted from the flyer) that opens the ticket picker:
 * flyer + details | ticket rows | running total + Checkout — then a details step. Prices,
 * availability and totals always come from the server.
 */
export function TicketSelector({
  eventId,
  eventTitle,
  venueLine,
  dateLine,
  poster,
  tint,
  tickets,
  onSale,
  defaultBuyer,
  referralActive,
  fromLabel,
}: {
  eventId: string;
  eventTitle: string;
  venueLine: string;
  dateLine: string;
  poster: React.ReactNode;
  tint: string;
  tickets: SelectorTicket[];
  onSale: boolean;
  fromLabel: string;
  defaultBuyer?: { name?: string; email?: string; phone?: string };
  referralActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"tickets" | "details">("tickets");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [promo, setPromo] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, startQuote] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  // A new selection = a new checkout attempt (new idempotency key); resubmits of the same one are deduplicated.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  const items = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, quantity]) => ({
          ticketTypeId,
          quantity,
          accessCode: codes[ticketTypeId],
        })),
    [qty, codes],
  );
  const units = items.reduce((a, i) => a + i.quantity, 0);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(
      () => startQuote(async () => setQuote(await quoteAction(eventId, items, promo || undefined))),
      300,
    );
    return () => clearTimeout(t);
  }, [eventId, items, promo]);

  const set = (t: SelectorTicket, next: number) => {
    let v = Math.max(0, Math.min(t.max_per_order, next));
    if (v > 0 && v < t.min_per_order) v = next > (qty[t.id] ?? 0) ? t.min_per_order : 0;
    setQty((q) => ({ ...q, [t.id]: v }));
    setIdemKey(crypto.randomUUID());
  };

  const form = useForm<BuyerForm>({
    defaultValues: {
      name: defaultBuyer?.name ?? "",
      email: defaultBuyer?.email ?? "",
      phone: defaultBuyer?.phone ?? "",
      acceptTerms: false,
    },
  });
  const submit = form.handleSubmit((values) => {
    setServerError(null);
    startSubmit(async () => {
      const res = await createOrderAction({
        eventId,
        items,
        promoCode: promo || undefined,
        idempotencyKey: idemKey,
        buyer: { name: values.name, email: values.email, phone: values.phone || undefined },
        acceptTerms: values.acceptTerms,
      });
      if (res?.fieldErrors) {
        for (const [path, msg] of Object.entries(res.fieldErrors)) {
          const key = path.replace("buyer.", "") as keyof BuyerForm;
          if (["name", "email", "phone", "acceptTerms"].includes(key))
            form.setError(key, { message: msg });
        }
      }
      if (res?.error) setServerError(res.error);
    });
  });

  const shown = items.length > 0 ? quote : null;
  const total = shown?.ok ? shown.total_minor : null;
  const summary = items
    .map((i) => `${i.quantity}x ${tickets.find((t) => t.id === i.ticketTypeId)?.name ?? ""}`)
    .join(", ");

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setStep("tickets");
      }}
    >
      <div className="no-print sticky bottom-0 z-30 flex flex-col items-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        <DialogPrimitive.Trigger asChild>
          <button
            disabled={!onSale || tickets.length === 0}
            style={{ backgroundColor: tint }}
            className="h-12 w-full max-w-[450px] rounded-full px-10 text-base font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {onSale ? fromLabel : tickets.length === 0 ? "Tickets coming soon" : "Not on sale"}
          </button>
        </DialogPrimitive.Trigger>
        {referralActive && (
          <p className="mt-2 text-center text-xs text-fg-muted">
            You arrived via a promoter link. It doesn&apos;t change your price.
          </p>
        )}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl data-[state=open]:animate-in-fade" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border border-white/[0.06] bg-[#0f0f11]/95 shadow-pop focus:outline-none data-[state=open]:animate-in-up md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-[min(1120px,calc(100%-4rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        >
          <DialogPrimitive.Title className="sr-only">
            Tickets for {eventTitle}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-white/[0.08] hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="hidden flex-col items-center justify-between gap-6 border-r border-white/[0.04] p-6 text-center md:flex">
              <p className="w-full border-b border-white/[0.08] pb-5 font-display text-lg font-medium uppercase">
                {eventTitle}
              </p>
              <div className="w-40">{poster}</div>
              <div className="w-full border-t border-white/[0.08] pt-5 text-sm">
                <p className="font-medium">{venueLine}</p>
                <p className="mt-1 text-fg/90">{dateLine}</p>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-4 md:p-6">
              {step === "tickets" ? (
                <>
                  <p className="mb-3 pr-10 font-display text-base font-medium md:hidden">
                    {eventTitle}
                  </p>
                  <ul className="space-y-3">
                    {tickets.map((t) => {
                      const q = qty[t.id] ?? 0;
                      const available = t.availability === "available" && onSale;
                      return (
                        <li
                          key={t.id}
                          className={cn(
                            "rounded-[10px] border p-4 transition-colors",
                            q > 0
                              ? "border-white/30 bg-white/[0.07]"
                              : "border-white/[0.06] bg-white/[0.05]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "font-display text-[15px] font-semibold uppercase leading-snug",
                                  !available && "text-fg-muted line-through decoration-1",
                                )}
                              >
                                {t.name}
                              </p>
                              {available ? (
                                <p className="mt-1 text-sm">
                                  {t.price_minor === 0 ? "Free" : formatMoney(t.price_minor)}
                                  {t.admissions_per_unit > 1 && (
                                    <span className="text-fg-muted">
                                      {" "}
                                      · admits {t.admissions_per_unit}, one ticket each
                                    </span>
                                  )}
                                </p>
                              ) : (
                                <p className="mt-1 text-sm text-fg-muted">
                                  {availabilityLabel(t.availability, t.opens_after_name)}
                                </p>
                              )}
                              {t.description && (
                                <p className="mt-1.5 text-sm text-fg/80">{t.description}</p>
                              )}
                              {available && t.few_left && (
                                <p className="mt-1.5 text-xs text-fg-muted">Few left</p>
                              )}
                            </div>
                            {!available ? (
                              <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-black">
                                {t.availability === "sold_out"
                                  ? "Sold Out"
                                  : t.availability === "sales_ended"
                                    ? "Ended"
                                    : "Soon"}
                              </span>
                            ) : q === 0 ? (
                              <button
                                type="button"
                                onClick={() => set(t, 1)}
                                aria-label={`Add one ${t.name}`}
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-black hover:bg-zinc-200"
                              >
                                <Plus className="size-4" />
                              </button>
                            ) : (
                              <div
                                className="flex shrink-0 items-center gap-2"
                                role="group"
                                aria-label={`Quantity for ${t.name}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => set(t, q - 1)}
                                  aria-label={`Remove one ${t.name}`}
                                  className="inline-flex size-7 items-center justify-center rounded-md bg-white/[0.12] hover:bg-white/[0.2]"
                                >
                                  <Minus className="size-4" />
                                </button>
                                <output
                                  aria-live="polite"
                                  className="w-5 text-center text-sm font-medium tabular-nums"
                                >
                                  {q}
                                </output>
                                <button
                                  type="button"
                                  onClick={() => set(t, q + 1)}
                                  disabled={q >= t.max_per_order}
                                  aria-label={`Add one ${t.name}`}
                                  className="inline-flex size-7 items-center justify-center rounded-md bg-white text-black hover:bg-zinc-200 disabled:opacity-40"
                                >
                                  <Plus className="size-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          {available && t.requires_access_code && (
                            <label className="mt-3 flex items-center gap-2">
                              <Lock className="size-3.5 text-fg-muted" aria-hidden />
                              <span className="sr-only">Access code for {t.name}</span>
                              <input
                                value={codes[t.id] ?? ""}
                                onChange={(e) =>
                                  setCodes((c) => ({ ...c, [t.id]: e.target.value }))
                                }
                                placeholder="Access code"
                                autoComplete="off"
                                className="h-8 w-40 rounded-md border border-white/[0.08] bg-black/30 px-2 text-sm placeholder:text-fg-subtle focus:border-white/30 focus:outline-none"
                              />
                            </label>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {tickets.some((t) => t.price_minor > 0) && (
                    <div className="mt-4">
                      {promoOpen ? (
                        <input
                          value={promo}
                          onChange={(e) => {
                            setPromo(e.target.value.toUpperCase());
                            setIdemKey(crypto.randomUUID());
                          }}
                          placeholder="Promo code"
                          aria-label="Promo code"
                          maxLength={32}
                          autoComplete="off"
                          className="h-9 w-48 rounded-md border border-white/[0.08] bg-white/[0.05] px-3 text-sm uppercase placeholder:normal-case placeholder:text-fg-subtle focus:border-white/30 focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPromoOpen(true)}
                          className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                        >
                          Have a promo code?
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <form id="buyer-form" onSubmit={submit} noValidate className="grid gap-4">
                  <button
                    type="button"
                    onClick={() => setStep("tickets")}
                    className="inline-flex w-fit items-center gap-1 text-sm text-fg-muted hover:text-fg"
                  >
                    <ArrowLeft className="size-4" /> Tickets
                  </button>
                  <div>
                    <p className="font-display text-lg font-medium">Your details</p>
                    <p className="mt-1 text-sm text-fg-muted">
                      Tickets are emailed to you. No account needed.
                    </p>
                  </div>
                  <BuyerField
                    label="Full name"
                    id="buyer-name"
                    error={form.formState.errors.name?.message}
                  >
                    <input
                      id="buyer-name"
                      autoComplete="name"
                      className={inputCls}
                      aria-invalid={!!form.formState.errors.name}
                      {...form.register("name", {
                        required: "Enter your full name",
                        minLength: { value: 2, message: "Enter your full name" },
                      })}
                    />
                  </BuyerField>
                  <BuyerField
                    label="Email"
                    id="buyer-email"
                    error={form.formState.errors.email?.message}
                  >
                    <input
                      id="buyer-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className={inputCls}
                      aria-invalid={!!form.formState.errors.email}
                      {...form.register("email", { required: "Enter your email" })}
                    />
                  </BuyerField>
                  <BuyerField
                    label="Phone (optional)"
                    id="buyer-phone"
                    error={form.formState.errors.phone?.message}
                  >
                    <input
                      id="buyer-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+234"
                      className={inputCls}
                      {...form.register("phone")}
                    />
                  </BuyerField>
                  <label className="flex items-start gap-3 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-white"
                      {...form.register("acceptTerms", {
                        required: "Please accept the terms to continue",
                      })}
                    />
                    <span>
                      I agree to the{" "}
                      <a className="text-fg underline" href="/legal/terms" target="_blank">
                        terms
                      </a>{" "}
                      and this event&apos;s refund policy.
                    </span>
                  </label>
                  {form.formState.errors.acceptTerms && (
                    <p role="alert" className="-mt-2 text-xs text-danger">
                      {form.formState.errors.acceptTerms.message}
                    </p>
                  )}
                  {serverError && <Alert tone="danger">{serverError}</Alert>}
                </form>
              )}
            </div>

            <div className="flex flex-col justify-end gap-4 border-t border-white/[0.06] p-4 md:border-l md:border-t-0 md:border-white/[0.04] md:p-6">
              {shown && !shown.ok && <Alert tone="warning">{shown.error}</Alert>}
              {units > 0 && shown?.ok && (
                <div className="flex items-end justify-between gap-4 md:block md:text-right">
                  <div className="md:mb-1">
                    {shown.discount_minor > 0 && (
                      <p className="text-xs text-fg-muted">
                        −{formatMoney(shown.discount_minor)} discount
                      </p>
                    )}
                    {shown.buyer_fee_minor > 0 && (
                      <p className="text-xs text-fg-muted">
                        incl. {formatMoney(shown.buyer_fee_minor)} booking fee
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-3xl font-light tabular-nums md:text-5xl">
                      {shown.total_minor === 0 ? "Free" : formatMoney(shown.total_minor)}
                    </p>
                    <p className="mt-1 truncate text-xs uppercase text-fg-muted">{summary}</p>
                  </div>
                </div>
              )}
              {step === "tickets" ? (
                <button
                  key="to-details"
                  type="button"
                  disabled={units === 0 || !shown?.ok || quoting}
                  onClick={() => setStep("details")}
                  className="h-10 rounded-full bg-zinc-200 px-6 text-sm font-medium text-black hover:bg-white disabled:opacity-40 md:self-end"
                >
                  {quoting && units > 0 ? "Updating…" : "Checkout"}
                </button>
              ) : (
                <button
                  key="submit-order"
                  type="submit"
                  form="buyer-form"
                  disabled={submitting}
                  className="h-10 whitespace-nowrap rounded-full bg-zinc-200 px-6 text-sm font-medium text-black hover:bg-white disabled:opacity-60 md:self-end"
                >
                  {submitting
                    ? "Holding your tickets…"
                    : total === 0
                      ? "Confirm free order"
                      : "Continue to payment"}
                </button>
              )}
              <p className="text-center text-[11px] text-fg-subtle md:text-right">
                Tickets are held for 10 minutes while you pay.
              </p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-3 text-sm placeholder:text-fg-subtle focus:border-white/25 focus:outline-none aria-[invalid=true]:border-danger";

function BuyerField({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
