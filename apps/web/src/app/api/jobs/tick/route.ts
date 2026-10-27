import { NextResponse } from "next/server";
import { safeEqual } from "@project23/domain/server";
import { env } from "@/lib/env";
import { runTick } from "@/lib/jobs/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduler entry point: POST with `Authorization: Bearer $JOB_RUNNER_SECRET`. */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().JOB_RUNNER_SECRET}`))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runTick({ batch: 25 });
  return NextResponse.json(result);
}
