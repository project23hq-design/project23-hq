"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { env } from "@/lib/env";

type State = { error?: string; message?: string } | undefined;
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export async function signInAction(_: State, form: FormData): Promise<State> {
  const email = emailSchema.safeParse(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email.success || !password) return { error: "Enter your email and password." };
  if (!(await rateLimit("signin", 10, 600)) || !(await rateLimit("signin-email", 8, 600, email.data))) return { error: "Too many attempts. Wait a few minutes and try again." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  // One generic message: never reveal whether the account exists.
  if (error) return { error: error.code === "email_not_confirmed" ? "Please verify your email first — check your inbox for the link." : "Incorrect email or password." };
  await supabase.rpc("link_my_orders");
  redirect(safeNext(String(form.get("next") ?? ""), "/account"));
}

export async function signUpAction(_: State, form: FormData): Promise<State> {
  const parsed = z.object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: z.string().min(10, "Use at least 10 characters").max(128),
  }).safeParse({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  if (!(await rateLimit("signup", 5, 3600))) return { error: "Too many sign-ups from this network. Try again later." };
  const supabase = await createClient();
  const next = safeNext(String(form.get("next") ?? ""), "/account");
  // full_name is display-only metadata; it never grants privileges.
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName }, emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error && error.code === "weak_password") return { error: "Choose a stronger password." };
  // Same response whether or not the email is already registered (no enumeration).
  return { message: `Check ${parsed.data.email} for a verification link to finish creating your account.` };
}

export async function forgotPasswordAction(_: State, form: FormData): Promise<State> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  if (await rateLimit("forgot", 5, 3600, email.data)) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password` });
  }
  return { message: "If an account exists for that email, we've sent a reset link." };
}

export async function resetPasswordAction(_: State, form: FormData): Promise<State> {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "Passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Your reset link has expired. Request a new one." };
  redirect("/account?reset=1");
}
