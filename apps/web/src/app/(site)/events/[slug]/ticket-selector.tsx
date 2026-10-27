"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Lock, Minus, Plus, Tag, Users } from "lucide-react";
import { availabilityLabel, formatMoney, type TicketAvailability } from "@project23/domain";
import { Alert, Button, Dialog, DialogContent, Field, Input, cn } from "@project23/ui";
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

export function TicketSelector({
  eventId,
  eventTitle,
  tickets,
  onSale,
  defaultBuyer,
  referralActive,
}: {
  eventId: string;
  eventTitle: string;
  tickets: SelectorTicket[];
  onSale: boolean;
  defaultBuyer?: { name?: string; email?: string; phone?: string };
  referralActive?: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [promo, setPromo] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, startQuote] = useTransition();
  const [open, setOpen] = useState(false);
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
  const admissions = items.reduce(
    (a, i) =>
      a + i.quantity * (tickets.find((t) => t.id === i.ticketTypeId)?.admissions_per_unit ?? 1),
    0,
  );

  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(
      () => startQuote(async () => setQuote(await quoteAction(eventId, items, promo || undefined))),
      350,
    );
    return () => clearTimeout(t);
  }, [eventId, items, promo]);

  const set = (t: SelectorTicket, next: number) => {
    const max = t.max_per_order;
    let v = Math.max(0, Math.min(max, next));
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
  const cta = !onSale
    ? "Not on sale"
    : units === 0
      ? "Select tickets"
      : total === 0
        ? "Get free tickets"
        : "Continue";

  return (
    <div id="tickets" className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-bold">Tickets</h2>
      {tickets.length === 0 && (
        <p className="text-fg-muted">Tickets haven&apos;t been released yet.</p>
      )}
      <ul className="space-y-3">
        {tickets.map((t) => {
          const q = qty[t.id] ?? 0;
          const available = t.availability === "available" && onSale;
          return (
            <li
              key={t.id}
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                q > 0 ? "border-accent/60 bg-accent/5" : "border-line bg-surface-1",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="mt-0.5 font-display text-lg font-semibold">
                    {t.price_minor === 0 ? "Free" : formatMoney(t.price_minor)}
                  </p>
                  {t.admissions_per_unit > 1 && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-info">
                      <Users className="size-3.5" aria-hidden />
                      Admits {t.admissions_per_unit} — each guest gets their own ticket
                    </p>
                  )}
                  {t.description && <p className="mt-1 text-sm text-fg-muted">{t.description}</p>}
                  {!available && (
                    <p className="mt-1 text-sm font-medium text-warning">
                      {availabilityLabel(t.availability, t.opens_after_name)}
                    </p>
                  )}
                  {available && t.few_left && (
                    <p className="mt-1 text-xs font-medium text-warning">Few left</p>
                  )}
                </div>
                {available && (
                  <div
                    className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-bg p-1"
                    role="group"
                    aria-label={`Quantity for ${t.name}`}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-9"
                      aria-label={`Remove one ${t.name}`}
                      disabled={q === 0}
                      onClick={() => set(t, q - 1)}
                    >
                      <Minus />
                    </Button>
                    <output
                      aria-live="polite"
                      className="w-6 text-center font-semibold tabular-nums"
                    >
                      {q}
                    </output>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-9"
                      aria-label={`Add one ${t.name}`}
                      disabled={q >= t.max_per_order}
                      onClick={() => set(t, q + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                )}
              </div>
              {available && t.requires_access_code && (
                <label className="mt-3 flex items-center gap-2">
                  <Lock className="size-4 text-fg-subtle" aria-hidden />
                  <span className="sr-only">Access code for {t.name}</span>
                  <Input
                    value={codes[t.id] ?? ""}
                    onChange={(e) => setCodes((c) => ({ ...c, [t.id]: e.target.value }))}
                    placeholder="Access code"
                    className="h-9 max-w-48 text-sm"
                    autoComplete="off"
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {onSale && tickets.some((t) => t.price_minor > 0) && (
        <div className="mt-4">
          {promoOpen ? (
            <label className="flex items-center gap-2">
              <Tag className="size-4 text-fg-subtle" aria-hidden />
              <span className="sr-only">Promo code</span>
              <Input
                value={promo}
                onChange={(e) => {
                  setPromo(e.target.value.toUpperCase());
                  setIdemKey(crypto.randomUUID());
                }}
                placeholder="Promo code"
                className="h-10 max-w-56 uppercase"
                autoComplete="off"
                maxLength={32}
              />
            </label>
          ) : (
            <Button variant="link" size="sm" onClick={() => setPromoOpen(true)}>
              Have a promo code?
            </Button>
          )}
        </div>
      )}

      {shown && !shown.ok && (
        <Alert tone="warning" className="mt-4">
          {shown.error}
        </Alert>
      )}

      {/* Summary + sticky purchase bar on mobile */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface-1 sm:p-4">
        {shown?.ok && (
          <dl className="mb-3 space-y-1 text-sm">
            <div className="flex justify-between text-fg-muted">
              <dt>
                {units} ticket{units > 1 ? "s" : ""}
                {admissions !== units ? ` · ${admissions} admissions` : ""}
              </dt>
              <dd className="tabular-nums">{formatMoney(shown.subtotal_minor)}</dd>
            </div>
            {shown.discount_minor > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd className="tabular-nums">−{formatMoney(shown.discount_minor)}</dd>
              </div>
            )}
            {shown.buyer_fee_minor > 0 && (
              <div className="flex justify-between text-fg-muted">
                <dt>Booking fee</dt>
                <dd className="tabular-nums">{formatMoney(shown.buyer_fee_minor)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(shown.total_minor)}</dd>
            </div>
          </dl>
        )}
        <Button
          size="lg"
          className="w-full"
          disabled={!onSale || units === 0 || !shown?.ok}
          loading={quoting && units > 0}
          onClick={() => setOpen(true)}
        >
          {cta}
          {total !== null && total > 0 && units > 0 ? ` · ${formatMoney(total)}` : ""}
        </Button>
        {referralActive && (
          <p className="mt-2 text-center text-xs text-fg-subtle">
            You arrived via a promoter link. This doesn&apos;t change your price.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          side="bottom"
          title="Your details"
          description={`Tickets for ${eventTitle} will be emailed to you. No account needed.`}
          className="sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <form onSubmit={submit} noValidate className="grid gap-4">
            <Field
              label="Full name"
              htmlFor="buyer-name"
              required
              error={form.formState.errors.name?.message}
            >
              <Input
                autoComplete="name"
                {...form.register("name", {
                  required: "Enter your full name",
                  minLength: { value: 2, message: "Enter your full name" },
                })}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="buyer-email"
              required
              hint="Your tickets and receipt go here."
              error={form.formState.errors.email?.message}
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                {...form.register("email", { required: "Enter your email" })}
              />
            </Field>
            <Field
              label="Phone (optional)"
              htmlFor="buyer-phone"
              hint="Nigerian number, e.g. 0803 123 4567"
              error={form.formState.errors.phone?.message}
            >
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+234"
                {...form.register("phone")}
              />
            </Field>
            <label className="flex items-start gap-3 text-sm text-fg-muted">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--accent)]"
                {...form.register("acceptTerms", {
                  required: "Please accept the terms to continue",
                })}
              />
              <span>
                I agree to the{" "}
                <a className="text-accent underline" href="/legal/terms" target="_blank">
                  terms
                </a>{" "}
                and the event&apos;s refund policy.
              </span>
            </label>
            {form.formState.errors.acceptTerms && (
              <p role="alert" className="-mt-2 text-xs font-medium text-danger">
                {form.formState.errors.acceptTerms.message}
              </p>
            )}
            {serverError && <Alert tone="danger">{serverError}</Alert>}
            <Button type="submit" size="lg" loading={submitting}>
              {total === 0
                ? "Confirm free order"
                : `Continue to payment${total ? ` · ${formatMoney(total)}` : ""}`}
            </Button>
            <p className="text-center text-xs text-fg-subtle">
              Your tickets are held for 10 minutes while you pay.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
