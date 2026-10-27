"use client";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card, Field, Input } from "@project23/ui";
import { requestOrderLinkAction } from "./actions";

export default function LookupPage() {
  const [state, action, pending] = useActionState(requestOrderLinkAction, { message: "" });
  const err = useSearchParams().get("error");
  return (
    <div className="container-page flex justify-center py-16">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold">Find my tickets</h1>
        <p className="mt-2 text-sm text-fg-muted">Bought tickets without an account? Enter the email you used at checkout and we&apos;ll send you a secure link.</p>
        {err && <Alert tone="warning" className="mt-4">That link is invalid or has expired. Request a new one below.</Alert>}
        <form action={action} className="mt-6 grid gap-4">
          <Field label="Email address" htmlFor="lookup-email" required error={state.error}><Input name="email" type="email" autoComplete="email" /></Field>
          <Button type="submit" loading={pending}>Email me a link</Button>
          {state.message && <Alert tone="success">{state.message}</Alert>}
        </form>
      </Card>
    </div>
  );
}
