"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@project23/ui";
import { Wordmark } from "@/components/wordmark";

type Action = (
  s: { error?: string; message?: string } | undefined,
  f: FormData,
) => Promise<{ error?: string; message?: string } | undefined>;

const input =
  "h-10 w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-3 text-sm placeholder:text-fg-subtle focus:border-white/25 focus:outline-none";

/** Centered, card-less auth screens (reference login style). */
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
    "sign-in": "Log in to Project23",
    "sign-up": "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  };
  const cta = {
    "sign-in": "Log in",
    "sign-up": "Sign up",
    forgot: "Send reset link",
    reset: "Update password",
  }[mode];
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-[325px] text-center">
        <Wordmark className="mx-auto h-14" priority />
        <h1 className="mt-5 text-lg font-medium">{titles[mode]}</h1>
        {state?.message ? (
          <Alert tone="success" className="mt-6 text-left">
            {state.message}
          </Alert>
        ) : (
          <form action={formAction} className="mt-6 grid gap-2.5 text-left">
            <input type="hidden" name="next" value={next ?? ""} />
            {mode === "sign-up" && (
              <>
                <label htmlFor="fullName" className="sr-only">
                  Full name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Full name"
                  className={input}
                  required
                />
              </>
            )}
            {mode !== "reset" && (
              <>
                <label htmlFor="email" className="sr-only">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  className={input}
                  required
                />
              </>
            )}
            {mode !== "forgot" && (
              <>
                <label htmlFor="password" className="sr-only">
                  {mode === "reset" ? "New password" : "Password"}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  placeholder={mode === "sign-in" ? "Password" : "Password (10+ characters)"}
                  className={input}
                  required
                />
              </>
            )}
            {mode === "reset" && (
              <>
                <label htmlFor="confirm" className="sr-only">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  className={input}
                  required
                />
              </>
            )}
            {state?.error && (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="mt-3 h-9 rounded-full bg-zinc-300 text-sm font-medium text-black hover:bg-white disabled:opacity-60"
            >
              {pending ? "Please wait…" : cta}
            </button>
          </form>
        )}
        <div className="mt-6 grid gap-3 text-sm font-medium">
          {mode === "sign-in" && (
            <>
              <Link
                className="hover:underline"
                href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              >
                Create an account
              </Link>
              <Link className="text-fg-muted hover:text-fg" href="/forgot-password">
                Forgot password?
              </Link>
            </>
          )}
          {mode === "sign-up" && (
            <Link className="hover:underline" href="/sign-in">
              I already have an account
            </Link>
          )}
          {mode === "forgot" && (
            <Link className="hover:underline" href="/sign-in">
              Back to log in
            </Link>
          )}
          <Link className="text-xs font-normal text-fg-muted hover:text-fg" href="/orders/lookup">
            Bought tickets as a guest? Find them by email
          </Link>
        </div>
      </div>
    </div>
  );
}
