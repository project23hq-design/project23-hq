/**
 * Scheduler/worker loop. Calls POST /api/jobs/tick every TICK_SECONDS (default 15s) with
 * the JOB_RUNNER_SECRET bearer token. Each tick expires holds, releases matured earnings,
 * queues payment reconciliation and processes a batch of outbox jobs.
 *
 * Production: run this as a long-lived process (e.g. a small container or systemd unit),
 * or replace it with any scheduler that POSTs the same request every minute (see docs/operations.md).
 *   pnpm worker            # loop
 *   pnpm worker --once     # single tick (useful in cron)
 */
const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/jobs/tick`;
const secret = process.env.JOB_RUNNER_SECRET;
const interval = Number(process.env.TICK_SECONDS ?? 15) * 1000;
const once = process.argv.includes("--once");

if (!secret) {
  console.error("JOB_RUNNER_SECRET is not set");
  process.exit(1);
}

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55_000) });
    const body = await res.json().catch(() => ({}));
    console.info(JSON.stringify({ ts: new Date().toISOString(), msg: "tick", status: res.status, ms: Date.now() - started, ...body }));
    return res.ok;
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), msg: "tick failed", error: String(e) }));
    return false;
  }
}

if (once) {
  process.exit((await tick()) ? 0 : 1);
}
let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));
while (!stopping) {
  await tick();
  await new Promise((r) => setTimeout(r, interval));
}
export {};
