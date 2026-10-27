# Operations

## Processes

| Process | Command | Notes |
| --- | --- | --- |
| Web | `pnpm build && pnpm start` (or a Next.js host) | Stateless; scale horizontally |
| Scheduler | `pnpm worker` (loop) or `pnpm worker --once` from cron | Calls `POST /api/jobs/tick` with `Authorization: Bearer $JOB_RUNNER_SECRET` |

A cron route without a scheduler is not a background system. Choose one of these:

- **Recommended:** run `pnpm --filter @project23/web worker` as a long-lived process (small container or systemd unit) with `NEXT_PUBLIC_APP_URL` and `JOB_RUNNER_SECRET` set. It ticks every `TICK_SECONDS` (default 15).
- **Vercel Cron, GitHub Actions or system cron:** call the tick endpoint every minute with the bearer token. Each tick processes up to 25 jobs and the full maintenance pass.
- **Supabase pg_cron + pg_net:** `select net.http_post(url := 'https://…/api/jobs/tick', headers := jsonb_build_object('Authorization', 'Bearer …'))` every minute. Store the secret in Vault.

## What a tick does

1. `run_maintenance()`: expires checkout holds (`FOR UPDATE SKIP LOCKED`), releases matured earnings exactly once, completes past events, queues `payment.reconcile` for attempts stuck in `initialized` for more than 15 minutes, and prunes rate-limit windows and referral visits older than 90 days.
2. `jobs_claim(worker, 25)`: claims ready jobs with `SKIP LOCKED`. Jobs stuck in `running` for over 5 minutes (crashed worker) are reclaimed.
3. Runs each handler, then `jobs_complete` or `jobs_fail`. Failures back off by 30s × 2^attempt (max 6 hours). After `max_attempts` (8) a job becomes `dead`.

Job kinds: `order.deliver`, `ticket.reissued`, `order.exception_notice`, `refund.process`, `refund.completed_notice`, `event.cancelled`, `event.material_change`, `event.moderation_feedback`, `payment.reconcile`, `payout_recipient.verify`, `payout_recipient.changed_notice`, `payout.transfer`, `payout.status_notice`, `ops.alert`.

Handlers are idempotent. Emails go through `email_intent`, keyed by a dedupe key, so a retried job never sends twice. Ticket credentials are deterministic. Ledger posts are idempotency-keyed. `payout.transfer` re-verifies at the provider before sending.

## Failed jobs and delivery

`/super-admin/jobs` lists dead and pending jobs with their last error, plus failed emails. "Retry" re-queues a dead job with attempts reset (audited). Buyers can resend their own ticket email (3 per hour). Admins can find any order in `/super-admin/orders`, which shows the fee snapshot, attempts, tickets, refunds, ledger entries and audit history.

## Common support procedures

| Situation | Action |
| --- | --- |
| "I paid but have no tickets" | Find the order. If `pending_payment` with an initialized attempt, reconciliation re-verifies hourly; payment confirmation is idempotent and safe to repeat. If `fulfillment_exception`, the refund is automatic: check `/super-admin/finance`. |
| Lost tickets | Buyer uses `/orders/lookup` (a 30-minute email link). Support never sends tickets to a different email than the buyer's. |
| QR shared or leaked | Organizer reissues the ticket (Orders page). The old QR stops working immediately. |
| Event cancelled | Organizer or admin cancels. Refunds run as a batch; monitor refund status on the finance page. |
| Bank change dispute | Every change is in the audit log with actor and time, and owners were emailed. Disable the recipient and verify identity offline. |
| Promoter fraud suspicion | `/super-admin/reports` shows referral flags; suspend the enrollment. Already-earned commissions follow the refund and dispute rules. |
| Organizer suspension | `/super-admin/organizations` → status suspended (with a reason). Sales and publishing stop; tickets and history are preserved. |

## Cancellations at scale

`cancel_event` runs in one transaction: it creates all refund requests and ledger reversals, then queues one `refund.process` job per order. Provider calls happen in jobs, so a large event drains over successive ticks; Paystack rate limits are absorbed by retries. Track progress with `refund_requests.batch_id`.

## Observability

- Structured JSON logs (`ts`, `level`, `msg`, `correlationId`, context) with secrets and credential-like keys redacted. The proxy sets `x-correlation-id`; webhook and job logs include order and payment references, so an order can be traced from checkout through payment, fulfillment, delivery, admission and settlement.
- `GET /api/health`: liveness check with no dependencies.
- `GET /api/ready`: verifies config and database reachability, reporting booleans only.
- Alert on `ops.alert` log lines, dead jobs above 0, fulfillment exceptions, payment mismatches, and reconciliation issues on the admin overview.

## Backups and restores

- Hosted Supabase: enable daily backups and point-in-time recovery (Pro plan or above). Test a restore into a staging project quarterly.
- The ledger is append-only and balances are derived, so a restore needs no rebuild step. After restoring, run `select public.run_reconciliation()` and compare `provider_clearing` against the Paystack dashboard.
- Uploaded posters live in Storage; back up the `event-media` and `org-logos` buckets with the Supabase S3-compatible endpoint if they must be retained.

## Data retention and deletion

- Referral visits: 90 days. Rate-limit windows: 1 day.
- Orders, tickets, ledger, refunds, payouts and audit logs are retained for accounting, tax and fraud purposes (set the retention period with counsel; 6+ years is typical for financial records). Deleting a user account sets `orders.buyer_user_id` to null and cascades profile, favorites and notifications. Buyer name and email on orders remain as financial records, and can be anonymised by a documented operator procedure once the retention period ends.
- Data export: an operator query per user (orders, tickets, profile). A self-service export is listed as a next action.

## Deployment checklist

1. Create a hosted Supabase project and run `supabase link` then `supabase db push`. **Do not run `seed.sql` in production.**
2. Configure Auth: site URL, redirect URLs (`https://<domain>/auth/confirm`), custom SMTP, TOTP MFA enabled, minimum password length 10, leaked-password protection, email confirmation on.
3. Set environment variables from `.env.example` with `APP_ENV=production`, `PAYMENT_PROVIDER=paystack` and `EMAIL_PROVIDER=resend`. The app refuses to start with the test provider or captured email in production.
4. Register the Paystack webhook URL. Start the scheduler.
5. Provision platform staff: create the user via the Supabase dashboard, then (as a DB operator) `insert into platform_role_assignments (user_id, role) values (…, 'super_admin')`. Never through the app.
6. Create the first-party organization and set `is_first_party = true` as a DB operator, plus its fee policy.
7. Smoke test with a live ₦100 ticket, then refund it.

## Local webhook forwarding

Paystack can't reach `localhost`. To test real Paystack test-mode webhooks, expose the dev server with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set the test webhook URL in the Paystack dashboard to `https://<tunnel>/api/webhooks/paystack`. Without a tunnel, the return-page verification and the hourly reconciliation still fulfill paid orders, because webhooks are not the only path.
