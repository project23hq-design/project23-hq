# Project23

Event discovery and ticketing for Nigeria, launching in Osun State (Osogbo, Ile-Ife, Ilesa, Ede) and modelled to expand across Nigeria and Africa.

One Next.js app with four separately secured experiences on one shared engine:

| Area | Route | Who |
| --- | --- | --- |
| Public discovery, checkout, tickets | `/`, `/explore`, `/project23`, `/events/[slug]`, `/checkout/[orderId]`, `/orders/*`, `/account/*` | Everyone; no account needed to buy |
| Organizer dashboard | `/organizer/[org]/*` | Organization members (owner / manager / finance / event staff) |
| Gate | `/gate`, `/gate/[eventId]` | Staff assigned to an event |
| Promoter earnings | `/promoter` | Any verified user enrolled in a referral program |
| Platform administration | `/super-admin/*` | Provisioned platform staff with an MFA-verified session |

> **Status:** working local build with test-mode integrations. **Not production-ready**: see "Readiness" below and [`docs/progress.md`](docs/progress.md).

## Stack (pinned)

Next.js 16.4.3 (App Router, Turbopack) · React 19.3.1 · TypeScript 5.9.3 (strict) · Tailwind CSS 4.3.3 · Radix primitives (shadcn/ui-style, in `packages/ui`) · Motion 14.6 · Supabase (Postgres 17, Auth, Storage, RLS; CLI 2.122) · `@supabase/ssr` 0.12.7 · Zod 4.6 · React Hook Form 7.91 · Paystack REST API · Resend 6.34 · pdf-lib · qrcode · qr-scanner · Recharts 3.10 · Vitest 5 · Playwright 1.64 · pnpm 10.30 · Node ≥ 22 (developed on 24).

TypeScript 7 (native compiler) was deliberately not used yet; Next.js and typescript-eslint tooling target the 5.x JS compiler API. ESLint is pinned to 9.x because `eslint-config-next`'s plugins don't support ESLint 10 yet.

## Repository layout

```text
apps/web/              Next.js app (public, organizer, gate, promoter, super-admin) + worker script
packages/domain/       Pure TS: money/bps math, fee mirror, validation schemas, permissions, crypto helpers (+ unit tests)
packages/database/     Generated Supabase types + helpers
packages/ui/           Design-system primitives (server-safe index + Radix client parts)
packages/config/       Shared tsconfig / eslint
supabase/migrations/   Ordered SQL: schema, guards, engine RPCs, finance, referrals, RLS, storage
supabase/seed.sql      Fictional Nigerian seed data (built through the real engine)
supabase/tests/        pgTAP structural security invariants
tests/integration/     Vitest against real Postgres: concurrency, RLS, payments, refunds, payouts, referrals, jobs
tests/e2e/             Playwright: acceptance journey, webhooks, access control, mobile/a11y
docs/                  Product spec, architecture, payments & settlement, operations, progress
scripts/               create-super-admin.mts (local/staging provisioning)
```

## Local setup

Prerequisites: Node 22+, pnpm 10, Docker (for local Supabase). About 3 GB of Docker images on first start.

```bash
pnpm install
```

```bash
pnpm db:start
```

The local Supabase stack uses ports **55320–55329** (API `http://127.0.0.1:55321`, DB `55322`, Studio `http://127.0.0.1:55323`, Mailpit `http://127.0.0.1:55324`) so it can run beside other Supabase projects.

Create `apps/web/.env.local` from [`.env.example`](.env.example). Copy the anon and service-role keys from `pnpm exec supabase status -o env`, and generate each secret with `openssl rand -hex 32`.

```bash
pnpm db:reset
```

This applies all migrations and loads the seed. Then, in two terminals:

```bash
pnpm dev
```

```bash
pnpm --filter @project23/web worker
```

The worker drives the scheduler: it calls `POST /api/jobs/tick` every 15 seconds to expire holds, release matured earnings, reconcile stale payments, deliver emails and process refunds and payouts. Open http://localhost:3000. Captured emails are at http://localhost:3000/dev/mail; Supabase Auth emails (verification, password reset) go to Mailpit.

### Test accounts (local seed only)

All seed accounts use the password `Letmein1!`. They exist only in your local database.

| Email | Role |
| --- | --- |
| `organizer@project23.test` | Owner, Osun Sound Collective (+ Ilesa Laugh Factory) |
| `ops@project23.test` | Owner, Project23 (first-party organization) |
| `finance@project23.test` | Finance member, Osun Sound Collective |
| `scanner@project23.test` | Event staff, assigned to Osogbo Afrobeats Night and the Project23 rooftop event |
| `promoter@project23.test` | Approved promoter (links `/r/bisi-osogbo`, `/r/bisi-rooftop`) |
| `customer@project23.test` | Customer with paid, refunded and checked-in orders |
| `campus@project23.test` | Owner, Ife Campus Arts Society + a pending organization |

No seed account is a platform admin. To create one locally:

```bash
pnpm admin:create --email admin@project23.test
```

The script prints a one-time password and refuses non-local Supabase URLs unless `--allow-remote` is passed. Sign in, enrol an authenticator app at `/account/security`, then open `/super-admin`. The database requires an MFA (aal2) session for every privileged call.

Useful seeded data: promo code `OSUN10` (10% off Osogbo Afrobeats Night), access code `STUDENT23` (student workshop ticket), a VIP table admitting 6, a sold-out event, a not-yet-on-sale event, a cancelled event with refunded orders, a draft and a pending-review event.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev server / production build / serve the build |
| `pnpm worker` | Scheduler loop (`--once` for a single tick) |
| `pnpm lint` · `pnpm typecheck` | ESLint and strict `tsc` across the workspace |
| `pnpm test` | Unit tests (domain package) |
| `pnpm test:integration` | Database integration suite (needs `pnpm db:start`) |
| `pnpm test:db` | pgTAP security invariants |
| `pnpm test:e2e` | Playwright (starts/reuses `pnpm dev`; needs DB + `apps/web/.env.local`) |
| `pnpm db:reset` · `pnpm db:types` | Re-apply migrations + seed · regenerate `packages/database/src/types.gen.ts` |
| `pnpm admin:create --email …` | Provision a local platform admin |

## Credentials & approvals checklist (before any real money)

- [ ] **Paystack business account** fully verified (CAC registration, BVN of directors, settlement bank), live keys issued. Confirm with Paystack in writing that the *platform-collects-then-pays-out* marketplace model is permitted for your business category, or switch to Subaccount split settlement (see `docs/payments-and-settlement.md`).
- [ ] **Paystack Transfers** enabled on the live account (and OTP disabled for API transfers, or a manual approval process accepted); otherwise payouts stay in the manual-bank mode already implemented.
- [ ] Webhook URL `https://<domain>/api/webhooks/paystack` registered in the Paystack dashboard (test and live) and the Paystack IPs allow-listed if your edge supports it.
- [ ] **Resend** account with a verified sending domain (SPF/DKIM/DMARC). Set `EMAIL_PROVIDER=resend`.
- [ ] Hosted **Supabase project** (paid tier for PITR backups), Auth SMTP configured, site URL and redirect URLs set, MFA (TOTP) enabled, leaked-password protection on.
- [ ] Production secrets generated and stored in the host's secret manager (`TICKET_QR_SECRET`, `COOKIE_SIGNING_SECRET`, `JOB_RUNNER_SECRET`).
- [ ] A scheduler calling `/api/jobs/tick` every minute (see `docs/operations.md`).
- [ ] Legal review of `/legal/*` (all marked draft), NDPA 2023 data-protection assessment, tax treatment of platform fees (VAT) and of promoter commissions.

## Readiness

- **Code implemented:** everything described in `docs/product-spec.md`.
- **Locally verified:** 19 unit, 54 database integration, 7 pgTAP, 17 Playwright tests passing; production build passing. See `docs/progress.md` for exact evidence.
- **Not provider-sandbox verified:** the Paystack adapter has **not** been exercised against Paystack's real test environment, because no test keys were provided. The same code paths run against the local test provider, which uses the same signature scheme.
- **Production prerequisites:** the checklist above, plus the gaps listed in `docs/progress.md`.
