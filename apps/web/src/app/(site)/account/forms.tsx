"use client";
import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Textarea } from "@project23/ui";
import { buyerRefundRequestAction, reauthenticateAction, resendTicketsAction, updateProfileAction } from "./actions";

type S = { error?: string; message?: string } | undefined;

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action, pending] = useActionState<S, FormData>(updateProfileAction, undefined);
  return (
    <form action={action} className="grid max-w-md gap-4">
      <Field label="Full name" htmlFor="fullName"><Input name="fullName" defaultValue={fullName} autoComplete="name" /></Field>
      <Field label="Phone" htmlFor="phone" hint="Nigerian number, used only for event updates."><Input name="phone" type="tel" defaultValue={phone} placeholder="+234" /></Field>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.message && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" loading={pending} className="justify-self-start">Save profile</Button>
    </form>
  );
}

export function ReauthForm() {
  const [state, action, pending] = useActionState<S, FormData>(reauthenticateAction, undefined);
  return (
    <form action={action} className="grid max-w-md gap-3">
      <Field label="Confirm your password" htmlFor="reauth-password" hint="Required before changing bank details or requesting withdrawals."><Input name="password" type="password" autoComplete="current-password" /></Field>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.message && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" variant="secondary" loading={pending} className="justify-self-start">Confirm identity</Button>
    </form>
  );
}

export function RefundRequestForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<S, FormData>(buyerRefundRequestAction, undefined);
  if (state?.message) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Why do you need a refund?" htmlFor="refund-reason"><Textarea name="reason" required minLength={3} maxLength={1000} /></Field>
      <p className="text-xs text-fg-muted">Requests cover all unused tickets on this order and are reviewed under the event&apos;s refund policy. Booking fees are not refundable on buyer requests.</p>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" variant="secondary" loading={pending} className="justify-self-start">Request refund</Button>
    </form>
  );
}

export function ResendButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" loading={pending} onClick={() => start(async () => { const r = await resendTicketsAction(orderId); setMsg(r.error ?? r.message ?? null); })}>Resend tickets email</Button>
      {msg && <span role="status" className="text-sm text-fg-muted">{msg}</span>}
    </div>
  );
}
