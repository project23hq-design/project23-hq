"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Field, Input } from "@project23/ui";

type Action = (
  s: { error?: string; message?: string } | undefined,
  f: FormData,
) => Promise<{ error?: string; message?: string } | undefined>;

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "sign-in" | "sign-up" | "forgot" | "reset";
  action: Action;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const titles = {
    "sign-in": "Welcome back",
    "sign-up": "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  };
  return (
    <div className="container-page flex justify-center py-14">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{titles[mode]}</h1>
        {mode === "sign-up" && (
          <p className="mt-1 text-sm text-fg-muted">
            Save events, keep tickets in one place, or start selling.
          </p>
        )}
        {state?.message ? (
          <Alert tone="success" className="mt-6">
            {state.message}
          </Alert>
        ) : (
          <form action={formAction} className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={next ?? ""} />
            {mode === "sign-up" && (
              <Field label="Full name" htmlFor="fullName" required>
                <Input name="fullName" autoComplete="name" />
              </Field>
            )}
            {mode !== "reset" && (
              <Field label="Email" htmlFor="email" required>
                <Input name="email" type="email" autoComplete="email" />
              </Field>
            )}
            {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
              <Field
                label={mode === "reset" ? "New password" : "Password"}
                htmlFor="password"
                required
                hint={mode !== "sign-in" ? "At least 10 characters." : undefined}
              >
                <Input
                  name="password"
                  type="password"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                />
              </Field>
            )}
            {mode === "reset" && (
              <Field label="Confirm password" htmlFor="confirm" required>
                <Input name="confirm" type="password" autoComplete="new-password" />
              </Field>
            )}
            {state?.error && <Alert tone="danger">{state.error}</Alert>}
            <Button type="submit" size="lg" loading={pending}>
              {
                {
                  "sign-in": "Log in",
                  "sign-up": "Create account",
                  forgot: "Send reset link",
                  reset: "Update password",
                }[mode]
              }
            </Button>
          </form>
        )}
        <div className="mt-6 space-y-2 text-center text-sm text-fg-muted">
          {mode === "sign-in" && (
            <>
              <p>
                <Link className="text-accent hover:underline" href="/forgot-password">
                  Forgot your password?
                </Link>
              </p>
              <p>
                New here?{" "}
                <Link
                  className="text-accent hover:underline"
                  href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                >
                  Create an account
                </Link>
              </p>
            </>
          )}
          {mode === "sign-up" && (
            <p>
              Already have an account?{" "}
              <Link className="text-accent hover:underline" href="/sign-in">
                Log in
              </Link>
            </p>
          )}
          {mode === "forgot" && (
            <p>
              <Link className="text-accent hover:underline" href="/sign-in">
                Back to log in
              </Link>
            </p>
          )}
          <p className="text-xs">
            Bought tickets as a guest?{" "}
            <Link className="underline" href="/orders/lookup">
              Find them by email
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  );
}
