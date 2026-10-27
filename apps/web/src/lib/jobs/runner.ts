import "server-only";
import { hostname } from "node:os";
import { adminClient } from "../supabase/admin";
import { logger } from "../log";
import { runJob } from "./handlers";

/**
 * One scheduler tick: housekeeping (hold expiry, maturity release, stale payment
 * reconciliation) then a batch of outbox jobs. Claiming uses FOR UPDATE SKIP LOCKED so
 * several workers can run safely; crashed jobs are reclaimed after 5 minutes.
 */
export async function runTick(opts: { batch?: number; worker?: string } = {}) {
  const db = adminClient();
  const worker = opts.worker ?? `${hostname()}:${process.pid}`;
  const log = logger({ scope: "jobs.tick", worker });
  const { data: maintenance, error: mErr } = await db.rpc("run_maintenance");
  if (mErr) log.error("maintenance failed", { error: mErr.message });

  const { data: jobs, error } = await db.rpc("jobs_claim", {
    p_worker: worker,
    p_limit: opts.batch ?? 20,
  });
  if (error) throw error;
  let ok = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    const jl = log.child({ jobId: job.id, kind: job.kind, attempt: job.attempts });
    try {
      await runJob(job.kind, job.payload as Record<string, string>, job.id);
      await db.rpc("jobs_complete", { p_id: job.id });
      ok++;
    } catch (e) {
      failed++;
      jl.warn("job failed", { error: String(e) });
      await db.rpc("jobs_fail", { p_id: job.id, p_error: String(e) });
    }
  }
  return { maintenance, claimed: jobs?.length ?? 0, ok, failed };
}
