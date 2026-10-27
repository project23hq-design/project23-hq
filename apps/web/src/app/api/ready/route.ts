import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Readiness: configuration valid and database reachable. Reports booleans only. */
export async function GET() {
  const checks: Record<string, boolean> = { config: false, database: false };
  try {
    env();
    checks.config = true;
  } catch {
    /* invalid env */
  }
  if (checks.config) {
    const { error } = await adminClient().from("currencies").select("code").limit(1);
    checks.database = !error;
  }
  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json(
    {
      status: ok ? "ready" : "not_ready",
      checks,
      payments: ok ? env().PAYMENT_PROVIDER : undefined,
    },
    { status: ok ? 200 : 503 },
  );
}
