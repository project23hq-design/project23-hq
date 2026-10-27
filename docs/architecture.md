# Architecture

## Shape

A pnpm monorepo with **one deployable Next.js app** and shared packages. The public site, organizer, gate, promoter and super-admin areas are route groups in the same app, each with server-side authorization. There are no microservices; background work runs through a database outbox driven by a scheduler hitting one authenticated route.

```
Browser ──► Next.js (App Router, Server Components, Server Actions, Route Handlers)
              │  user-scoped Supabase client (anon key + session cookie)  ──► PostgREST ──► Postgres (RLS)
              │  service-role client (server-only, explicit authz first)   ──► PostgREST ──► SECURITY DEFINER RPCs
              │  Paystack REST (server-only)        Resend (server-only)
              ▼
         /api/jobs/tick  ◄── scheduler (pnpm worker / cron) every 15–60s
         /api/webhooks/paystack ◄── Paystack
```

## Packages

- `packages/domain` — framework-free business logic: integer money and basis-point math (mirrors SQL rounding), a TS mirror of order economics for previews, Zod schemas, error-code copy, permission matrix, date/timezone/phone helpers. `@project23/domain/server` holds node:crypto helpers: QR token HMAC, Paystack signature verification, signed cookies, last-click attribution.
- `packages/database` — generated types (`pnpm db:types`) and row/view aliases.
- `packages/ui` — accessible primitives styled with semantic tokens. `index.tsx` is server-safe; `client.tsx` holds Radix-based interactive parts.
- `apps/web/src/lib` — `env` (validated contract; refuses unsafe production combinations), Supabase clients, `auth` guards, `payments` (provider interface, Paystack and test adapters, `confirmPayment` convergence point), `email` (Resend/capture adapters with dedupe), `tickets` (QR credentials, PDF), `jobs` (handlers and runner), `security` (rate limits, signed cookies, sanitisation), `queries`, `orders` (viewer-scoped order loading), `log` (structured JSON, redaction, correlation ids).

## Data model

| Area | Tables | Notes |
| --- | --- | --- |
| Geography | `currencies`, `countries`, `regions`, `cities` | Expansion by data; NGN is the only checkout-enabled currency |
| Identity | `profiles`, `platform_role_assignments` | Profile = display data only; roles provisioned out-of-band |
| Tenancy | `organizations`, `memberships`, `invitations`, `organization_referral_defaults` | Invitation tokens stored hashed |
| Events | `categories`, `venues`, `events`, `event_private`, `event_media`, `ticket_types`, `promotions`, `event_staff`, `favorites`, `reports`, `event_view_counts` | Composite FKs `(event_id, organization_id)` prevent cross-tenant children; staff must be members |
| Commerce | `fee_policies` (insert-only, versioned), `orders`, `order_items` (immutable snapshots), `payment_attempts`, `provider_events`, `tickets`, `check_ins` (append-only) | Holds are counters on `ticket_types`/`events` plus `orders.hold_expires_at` |
| Finance | `ledger_accounts`, `ledger_transactions`, `ledger_entries` (append-only, balanced at commit), `earnings_allocations`, `refund_batches`, `refund_requests`, `refund_items`, `refund_attempts`, `disputes`, `payout_recipients` (+ `private.payout_recipient_secrets`), `payout_requests`, `payout_attempts` | Balances derived from entries only |
| Referrals | `referral_programs`, `referral_program_versions` (insert-only), `promoter_enrollments`, `referral_links`, `referral_visits`, `order_attributions` (insert-only), `referral_flags` | Commissions are `earnings_allocations` of kind `promoter` |
| Operations | `outbox_jobs`, `email_messages`, `order_access_tokens`, `notifications`, `audit_logs` (append-only), `platform_settings`, `private.rate_limits` | |

### Invariants enforced in the database

- `admissions_sold + admissions_held <= capacity`; `units_sold + units_held <= quantity_total`; promo `reserved + completed <= max`.
- `orders.total = subtotal − discount + buyer_fee`; `discount <= subtotal`; line math checked per item.
- One successful payment attempt per order; provider transaction id and reference unique.
- Ticket `(order_item_id, unit_number, admission_number)` unique; `qr_hash` unique.
- Every ledger transaction balances per currency (deferred constraint trigger); idempotency key unique.
- Guard triggers make engine columns writable only from engine functions (`project23.internal` GUC), the service role, or a direct DB-admin session **with no request claims**. A request carrying anon/authenticated claims is never internal, even on a privileged connection — this was found and fixed by the integration suite.
- Event state machine enforced by trigger.

## Security boundaries

1. **Public projection**: clients cannot select base `events`, `organizations` or `ticket_types`. They read `public_events`, `public_ticket_types`, `public_organizations`, `public_event_media`, `trending_events`, `public_referral_programs` — views with explicit safe columns, filtered to approved, active, non-private records.
2. **RLS on every table** (asserted by pgTAP). Customers see their own orders/tickets; org roles see their tenant per the matrix; scanners see nothing directly, only gate RPCs for assigned events; promoters see their own data and a privacy-safe dashboard RPC; admins only with aal2.
3. **Least-privilege grants**: all table and function privileges revoked, then re-granted deliberately (e.g. `tickets` without `qr_hash`, `payout_recipients` without account numbers). Checkout, payment, job, maturity and test-provider RPCs are service-role only.
4. **SECURITY DEFINER functions** pin `search_path = ''` (asserted by pgTAP) and check `auth.uid()`, membership, aal and recent authentication (`amr` within 15 minutes) themselves.
5. **Service role** is used only server-side for guest checkout (after validation and rate limits), webhooks and verification, jobs, and guest order viewing after access was established by ownership, a browser-created-order cookie or an emailed token.
6. **Request hygiene**: SSR httpOnly session cookies verified with `getUser()`, server-action origin checks, same-origin check on sign-out, internal-only redirect targets, signed httpOnly cookies for referral and guest access, DB-backed rate limits, security headers (HSTS in production).
7. **Content**: descriptions converted from text and allow-list sanitised; CSV exports neutralise formula injection; uploads go to `{orgId}/…` paths with size/MIME limits and storage RLS; ticket PDFs and QR codes are generated on demand and never stored publicly.
8. **Credentials**: QR = `P23T.` + truncated HMAC-SHA256(`TICKET_QR_SECRET`, ticket id + version). Only SHA-256 hashes are stored; reissue bumps the version. Logs redact secret-like keys.

## Integration decisions

- **Payments**: Paystack hosted checkout (initialize → redirect → callback), verified with `GET /transaction/verify/:reference`; webhooks verified by HMAC-SHA512 of the raw body (`x-paystack-signature`). Behind a `PaymentProvider` interface; a test provider mirrors the contract locally.
- **Settlement**: Project23 collects online funds into its own Paystack balance and settles organizers and promoters from the ledger. Split settlement is not used. See `payments-and-settlement.md`.
- **Email**: Resend with idempotency keys behind an adapter; local capture writes to `.mail-capture/`, rendered at `/dev/mail`.
- **Auth**: Supabase email/password with confirmation, PKCE links at `/auth/confirm`, TOTP MFA for platform staff, password re-entry for sensitive actions.
- **Images**: `next/image` (AVIF/WebP) for uploaded posters; CSS-generated posters otherwise (zero image bytes).
