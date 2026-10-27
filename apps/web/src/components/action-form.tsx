"use client";
import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, type ButtonProps } from "@project23/ui";

export type ActionState = { error?: string; message?: string; ok?: boolean } | undefined;
type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Progressive-enhancement form bound to a server action, with inline status. */
export function ActionForm({ action, children, submitLabel, submitVariant, className, confirm, resetOnSuccess, inline }: {
  action: Action; children?: React.ReactNode; submitLabel: string; submitVariant?: ButtonProps["variant"]; className?: string;
  confirm?: string; resetOnSuccess?: boolean; inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnSuccess && state?.message && !state.error) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className ?? (inline ? "inline-flex flex-wrap items-center gap-2" : "grid gap-4")}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {children}
      <div className={inline ? "contents" : "flex flex-wrap items-center gap-3"}>
        <Button type="submit" variant={submitVariant} loading={pending} size={inline ? "sm" : "md"}>{submitLabel}</Button>
        {inline && state?.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
        {inline && state?.message && <span role="status" className="text-sm text-success">{state.message}</span>}
      </div>
      {!inline && state?.error && <Alert tone="danger">{state.error}</Alert>}
      {!inline && state?.message && <Alert tone="success">{state.message}</Alert>}
    </form>
  );
}
