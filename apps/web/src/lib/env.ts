import "server-only";
import { z } from "zod";

/**
 * Server environment contract. Parsed once; the app refuses to start with an unsafe
 * combination (e.g. the test payment provider or captured email in production).
 */
const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    PAYMENT_PROVIDER: z.enum(["paystack", "test"]).default("test"),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    TEST_PROVIDER_SECRET: z.string().min(32).optional(),
    EMAIL_PROVIDER: z.enum(["resend", "capture"]).default("capture"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Project23 <tickets@project23.example>"),
    TICKET_QR_SECRET: z.string().min(32),
    COOKIE_SIGNING_SECRET: z.string().min(32),
    JOB_RUNNER_SECRET: z.string().min(32),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((v, ctx) => {
    if (v.PAYMENT_PROVIDER === "paystack" && !v.PAYSTACK_SECRET_KEY?.startsWith("sk_")) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYSTACK_SECRET_KEY"],
        message: "Required when PAYMENT_PROVIDER=paystack",
      });
    }
    if (v.PAYMENT_PROVIDER === "test" && !v.TEST_PROVIDER_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["TEST_PROVIDER_SECRET"],
        message: "Required when PAYMENT_PROVIDER=test",
      });
    }
    if (v.EMAIL_PROVIDER === "resend" && !v.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Required when EMAIL_PROVIDER=resend",
      });
    }
    if (v.APP_ENV === "production") {
      if (v.PAYMENT_PROVIDER === "test")
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENT_PROVIDER"],
          message: "The test payment provider is disabled in production",
        });
      if (v.EMAIL_PROVIDER === "capture")
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_PROVIDER"],
          message: "Captured email is disabled in production",
        });
      if (!v.NEXT_PUBLIC_APP_URL.startsWith("https://"))
        ctx.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_APP_URL"],
          message: "Production must use https",
        });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Demo mode = any simulated integration is active. Always visibly labelled in the UI. */
export function isDemoMode(): boolean {
  const e = env();
  return e.PAYMENT_PROVIDER === "test" || e.EMAIL_PROVIDER === "capture";
}

export function paymentEnvironment(): "test" | "live" {
  const e = env();
  if (e.PAYMENT_PROVIDER === "test") return "test";
  return e.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
}
