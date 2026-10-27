# Progress

Location: `/Users/ayenikoemmanuel/Downloads/project23` (macOS user Downloads folder, not redirected). Created fresh on 2026-10-27; git repository on branch `main`.

## Milestones

| # | Milestone | Status |
| - | --- | --- |
| 1 | Foundation: workspace, design system, local Supabase, schema, migrations, auth, tenancy, RLS | Done |
| 2 | Event creation and moderation, public discovery and event pages | Done |
| 3 | Inventory, checkout, payment verification, fulfillment, email, retrieval | Done (test provider; Paystack adapter not exercised against Paystack's sandbox) |
| 4 | Gate scanning, door sales and comps, organizer orders and attendees | Done |
| 5 | Fees, ledger, refunds, disputes, payouts, referral programs, promoter dashboard, super-admin | Done |
| 6 | Security and concurrency tests, visual polish, docs, validation | Done (see gaps) |

## Verified evidence (local, 2026-10-27, from a freshly reset database)

| Check | Result |
| --- | --- |
| `pnpm test` (domain unit tests: money/bps rounding, fee examples, phone/time zone handling, validation, QR rotation, webhook signatures, signed cookies, attribution) | 19 / 19 passed |
| `pnpm test:integration` (real Postgres; concurrent connections) | 54 / 54 passed |
| `pnpm test:db` (pgTAP structural invariants) | 7 / 7 passed |
| `pnpm test:e2e` (Playwright, desktop + Pixel 7) | 17 / 17 passed |
| `pnpm typecheck` (strict, all packages) | clean |
| `pnpm lint` (all packages) | clean |
| `pnpm build` (Next.js production build, 31 routes) | success |
| Manual browser checks | Home, explore, event page, checkout → test payment → tickets (desktop and 375 px); organizer dashboard; gate console at 375 px |

What the test suites cover against the acceptance criteria (spec §15/§16):

1. Organizer signup and onboarding, event creation with tiers, MFA-gated approval, public discovery: E2E `core-journey`.
2. Guest purchase through verified test payment, two unique tickets, single email capture with PDF, secure email-link retrieval, strangers denied: E2E.
3. Free orders, 100%-discount orders, one ticket per table seat: integration.
4. Concurrent final-admission checkout, aggregate capacity across types including table seats: integration (25 parallel buyers for 5 seats sell exactly 5).
5. Hold expiry and late payment, both with and without remaining inventory (exception + automatic refund, no overselling): integration.
6. Concurrent and replayed confirmations, webhook replays, callback/webhook races: one fulfillment, one sale ledger transaction, one delivery job (integration + E2E).
7. Forged and mismatched amount/currency/environment, unknown references, invalid and missing signatures, malformed bodies, forged redirects: integration + E2E.
8. Promo caps under concurrency (12 racing for 3), expiry release, fixed-discount cap, immutable price and fee snapshots: integration.
9. Cross-tenant reads/writes, organization-id spoofing, engine-field tampering, self-promotion to admin, MFA requirement, service-only RPCs, finance/scanner scoping, verified-email order linking, invitation identity, last-owner protection: integration + pgTAP + E2E.
10. Racing gate scans (3 scanners → exactly 1 admitted), wrong event, unknown, refunded, rotated tickets, gated and audited re-entry, door cash not booked as provider revenue, comp permission and capacity: integration + E2E.
11. Partial and buyer refunds (used tickets excluded, policy enforced), ledger reversal, replay-safe provider confirmation, cancellation batch: integration.
12. Concurrent withdrawals (6 racing → 1), idempotency, re-auth requirement, fail/paid/reversed ledger movements, available vs gross balance: integration.
13. Job claiming with `SKIP LOCKED` (no double claims), email dedupe, backoff to dead-letter: integration.
14. Responsive and keyboard checks: E2E mobile (skip link, no horizontal overflow, keyboard ticket selection, sticky purchase bar, URL-persisted filters across back navigation, honest availability labels).
15. Referral programs: single accrual on verified fulfillment under racing confirmations (10% after the 5% fee = ₦1,000/₦500/₦8,500 per ₦10,000), event scope, expired/future/forged/suspended links rejected, self-referral blocked and flagged, discounted base, free tickets excluded, rate snapshot vs new terms, exactly-once maturity, post-payout refund → recovery balance → offset from the next commission, proportional partial reversal, promoter privacy and balance separation: integration.

## Defects found and fixed by testing

- Guard triggers trusted the database login role. A privileged connection carrying user claims could bypass engine-field guards. Internal sessions are now defined by the engine flag, the service role, or an admin session **without request claims**.
- A payment reported in an unsupported currency made confirmation fail and roll back, which would cause endless provider retries. It is now recorded as a mismatch with an operations alert.
- Mobile home page overflowed horizontally by about 2,500 px (rail and grid sizing). Fixed and covered by an E2E test.
- The gate console could silently ignore a scan submitted while a previous check was in flight and kept the old green result visible. It now clears the result and disables Check while a check is pending.
- The MFA QR crashed the security page (`next/image` rejects raw SVG data URIs).

## Not verified / known gaps

- **Paystack sandbox:** the adapter (`apps/web/src/lib/payments/paystack.ts`) follows the documented API (initialize, verify, refund, resolve account, transfer recipient, transfer, verify transfer, banks, webhook HMAC-SHA512) but was **not run against Paystack's test environment**, because no `sk_test_` key was available. Dispute payload field mapping (`resolution` values) in particular must be confirmed with real test events.
- **Resend:** the adapter was not exercised (no API key). All email in tests goes through the capture adapter.
- **Supabase Auth email flows** (verification link, password reset) were wired up but not exercised end to end in automated tests. Seeded users are pre-confirmed; Mailpit receives these emails locally.
- **Camera scanning** uses `qr-scanner` and needs HTTPS plus a real camera. It was not tested automatically; manual entry and search were.
- **Referral acceptance journey via UI:** covered at the database level (integration). There is no Playwright test of the promoter dashboard and withdrawal UI.
- **Organizer onboarding uploads** (posters/logos): storage policies exist; the upload UI was not exercised in automated tests. The organization logo upload UI isn't built (field exists).
- **Self-service data export and account deletion** for customers: documented as an operator procedure, no UI.
- Accessibility: keyboard paths and labelling checked on key flows; no full axe/screen-reader audit was run.
- Offline gate mode, reserved seating, resale, subscriptions, multi-currency checkout and split settlement are out of scope (`product-spec.md` §13).

## Next actions

1. Add Paystack test keys (`PAYMENT_PROVIDER=paystack`, `PAYSTACK_SECRET_KEY=sk_test_…`), expose a tunnel, and run the acceptance journey against the Paystack sandbox, including refund, transfer and dispute webhooks. Record the results here.
2. Configure Resend with a verified domain and send a test ticket email.
3. Add Playwright coverage for the promoter apply → link → purchase → withdrawal UI and for organizer refunds.
4. Run an axe accessibility scan in E2E; add a customer data-export page.
5. Complete the legal, tax and Paystack marketplace approvals in the README checklist before any live collection.
