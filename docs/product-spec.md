# Project23 product specification

Scope as implemented. "Later" items are explicitly out of the launch build.

## 1. Experiences

**Customers** discover events (`/`, `/explore`, `/project23`, organizer profiles), choose tickets, pay (Paystack hosted checkout, or the labelled test provider locally), receive per-admission QR tickets by email (PDF attached), retrieve orders by secure email link or account, save events, add to calendar, request refunds under the event policy, and resend ticket emails (rate limited).

**Organizers** create an organization (pending platform approval), build events through a tabbed editor (details → tickets → promo codes → promoters → gate staff → attendees → insights → publish), manage orders and refunds, team roles and invitations, balances, bank details and withdrawals.

**Gate staff** select an assigned event, scan QR codes (camera over HTTPS, or paste/type), search by reference/name, record door sales (cash/external POS) and complimentary tickets when permitted, and apply audited re-entry overrides.

**Promoters** apply to organizer-approved (or open) referral programs, receive an event-scoped link and QR, see visits/orders/earnings, and withdraw available earnings to a verified bank account.

**Platform admins** (provisioned, MFA) review events, approve/verify/suspend organizations, set fee policies, manage featured placement, handle refunds/payout queues/settlements/disputes, inspect order timelines and ledgers, retry dead jobs, read audit logs and edit platform settings.

**Project23 itself** is the organization `project23` with `is_first_party = true` (a platform-controlled column with a unique index — one first-party org). Its events use the same engine, fees and ledger; the badge is never inferred from a display name.

## 2. Nigeria-first defaults

NGN only at checkout (currency table has GHS/KES disabled), naira formatting via `Intl` on integer kobo, `Africa/Lagos` default timezone with explicit IANA zone per event, `+234` phone normalisation (`0803…`, `234…`, `+234…`), Osun as the launch region. Countries/regions/cities/currencies are tables, so expansion is configuration plus provider support — not a rewrite.

## 3. Organization roles (permission matrix)

| Permission | Owner | Manager | Finance | Event staff |
| --- | :-: | :-: | :-: | :-: |
| Edit organization profile | ✓ | ✓ | | |
| Change roles / remove members | ✓ | | | |
| Invite (managers may invite managers & staff only) | ✓ | ✓ | | |
| Create/edit/publish/cancel events, tickets, promos, promoter programs | ✓ | ✓ | | |
| View orders | ✓ | ✓ | ✓ | |
| View attendee lists / export CSV | ✓ | ✓ | | |
| Approve/issue refunds | ✓ | ✓ | ✓ | |
| View balances / request withdrawals | ✓ | | ✓ | |
| Change payout bank account (re-auth required) | ✓ | | | |
| Scan tickets | ✓ | ✓ | | assigned events only |
| Door sales / comps / re-entry override | ✓ | ✓ | | per-event flags |

Final-owner protection: the last owner can't be demoted or removed. Invitations expire after 7 days, are single use, are stored hashed, and can only be accepted by a signed-in user whose **verified** email matches. Promoter enrollment is not membership and grants no dashboard access; members can't promote their own organization's events.

Platform roles (`super_admin`, `finance_admin`, `support`) live in `platform_role_assignments`, insertable only by the service role/DB operators. `is_platform_admin()` requires an active assignment **and** an `aal2` JWT.

## 4. Organizer lifecycle

`approval_status` (approved on creation; admins may set `rejected` to block), `verification_status` (public badge), `payout_status` (not_ready/pending_review/eligible/suspended) and `status` (active/suspended) are independent, platform-controlled fields (guard trigger). Suspension hides the organizer's events from discovery and blocks checkout, publishing, invitations and new referral programs; existing tickets stay valid and financial records are untouched.

## 5. Event lifecycle

States: `draft → pending_review → published ⇄ paused → completed → archived`, plus `published|paused → cancelled → archived` and `pending_review → draft` (changes requested / rejected). Transitions are enforced by a trigger; engine-controlled fields (status, moderation, counters, featuring, organization) can't be changed by clients.

- **Submission** validates description, future start, venue+city for in-person, category, and at least one active ticket type.
- **Moderation**: admins approve (requires an approved organization), request changes or reject with notes; the organizer is emailed; resubmission is allowed.
- **Edits after sales**: slug and admissions-per-unit/currency are frozen; capacity/quantities can't drop below sold+held (CHECK constraints); date/venue changes are audited and every buyer is emailed (`event.material_change` job). Price edits affect new orders only (order items snapshot prices).
- **Cancellation** stops sales, releases holds, closes the referral program, refunds every paid order (including used tickets) as a tracked refund batch, reverses commissions, and emails buyers.
- **Completion** is automatic 6 hours after `ends_at`.
- **Visibility**: `public` (discovery), `unlisted` (link only, `noindex`), `private` (no online sales; door/comp only). Unlisted links expose only the public projection.

## 6. Tickets & inventory

Ticket kinds: early bird, regular, general, VIP, VVIP, student, group/table, free, complimentary — names are free text. Each type has price, allocation (units), **admissions per unit**, min/max per order, sale window, visibility (public / access code / hidden), dependency ("opens after X sells out or its sales end"), and active flag.

- **Units vs admissions**: a 6-seat table is 1 unit and 6 admissions; event capacity counts admissions (including comps); one independently scannable ticket per admission (`unit_number`, `admission_number`).
- **Availability** is computed server-side and shown honestly: available, sold out, sales ended, not on sale yet, opens after X, "all remaining tickets are in checkout". A coarse "few left" signal replaces exact counts.
- **Promo codes**: percent or fixed, per event, optional ticket-type scope, window, cap. **Caps count active reservations + completed redemptions**; expired holds release their reservation. Fixed discounts are allocated proportionally across eligible lines and never exceed the payable amount (100%-discounted orders become free orders).

## 7. Checkout rules

1. Server validates publication, org status, sales windows, dependencies, access codes, quantities, promo and capacity, then snapshots prices, discounts, the fee policy and the promoter rate into the order (`build_order`).
2. Inventory is held for `checkout_hold_minutes` (default 10). Row locks + CHECK constraints make overselling impossible.
3. Payment attempts get unique references; retries reuse a recent initialized attempt for 5 minutes, then create a new one (max 5 per order).
4. Paid status comes only from a server-to-server verify call or an authenticated webhook; both converge on `payment_confirm` → `fulfill_order` (idempotent).
5. Late payments after a hold expired are re-allocated if inventory allows; otherwise the order becomes a `fulfillment_exception`, no tickets are issued, an automatic full refund is queued, and the buyer is notified.
6. Free orders and door sales use the same engine.
7. The buyer sees all charges (subtotal, discount, booking fee if configured, total) before paying.

Guest checkout needs name + email (+ optional phone). Orders link to an account only when the account's email is **verified** (`link_my_orders`).

## 8. Referral programs (promoters)

- Per-event program with versioned terms (rate in bps, eligible ticket types, attribution window, maturity days, dates). Optional organization defaults table. New versions never change existing orders; promoters re-accept newer terms.
- Enrollment: `pending → approved | rejected`, later `suspended | revoked`, with reasons and audit; promoter-specific rate override (bounded by `max_promoter_rate_bps`, default 30%, and rate + platform fee ≤ 95%). Open-enrollment mode auto-approves verified users.
- Links: `/r/[code]` resolves server-side, records an approximate visit (salted session hash, no IP/UA, 90-day retention), sets a signed first-party cookie holding the **latest click per event**, and redirects only to the internal event page.
- Attribution: last eligible click for that event within the window (default 7 days) on the same browser. Rejected if expired, future-dated, wrong event, suspended/revoked, program paused/closed, forged or self-referral (buyer = promoter by id or email, or promoter is a member of the organizer). Frozen into `order_attributions` at order creation.
- Commission base: eligible line net after discounts, excluding booking fees, processor fees, taxes, free/comp items. Rounded half-up per line; capped so organizer net is never negative. Only verified paid online orders accrue; door/cash sales never generate commission.
- Promo codes and promoter links coexist; a promo code never replaces the promoter.
- Disclosed limitations: cleared cookies, blocked tracking and cross-device purchases can prevent attribution; no fingerprinting is used.

## 9. Refunds

Requests are not refunds. Buyers can request for **unused** tickets within the event policy (no booking-fee refund); organizers (owner/manager/finance) and admins create pre-approved refunds, optionally including used tickets. Units are whole purchased units (a table refunds all its seats). Approval voids exactly the selected tickets, reverses ledger entries proportionally under the order's snapshot (platform fee refundable flag), reverses commissions (or creates promoter recovery after payout), restores inventory only while the event is still on sale, and queues provider processing; provider confirmation completes it. Failed refunds can be retried by finance admins.

## 10. Payouts & earnings balances

Organizations and promoters share one payout engine. Earnings mature (pending → available) after `event end + organizer_hold_days (3)` or `+ max(program maturity, promoter_maturity_days (7))`; disputes hold them. Withdrawals require a verified recipient, recent re-authentication, the minimum amount (₦5,000 org / ₦2,000 promoter), no outstanding promoter recovery, and enough **available** balance; the amount is locked immediately. Statuses: `pending → approved → processing → paid | failed`, `paid → reversed`, `pending → rejected | cancelled`. Bank changes notify all owners and are audited.

"Wallet" in the UI = a ledger-backed earnings balance. No deposits, transfers between users or spending.

## 11. Gate

Online-only validation. First admission is an atomic row-locked update; concurrent scans produce one `admitted` and the rest `already_checked_in`. Results: admitted, already checked in, invalid, wrong event (reveals nothing), refunded, void, event not active. Every attempt is logged with staff, device id and server time. QR payloads are opaque HMAC tokens (no personal data); reissuing rotates the token. Screenshots can be copied — first scan wins; we don't claim otherwise. Offline check-in is a **later** feature; the UI shows "Not confirmed — no connection" and never a green result without a server response.

## 12. Discovery

Search (title, summary, venue, organizer, tags; prefix full-text), city, region, category, date windows (today/weekend/7/30 days, Lagos time), free/paid, sorting (soonest, price, newly listed), URL-persisted filters, pagination. **Featured** = editorial (admin-set, labelled "Editor's picks"). **Selling now** = ranked by admissions sold online in the last 7 days (shown only with ≥ 3), labelled as such. Event pages include SEO metadata, canonical URLs, Event JSON-LD for public events, a sitemap and robots rules.

## 13. Later (documented, not built)

Reserved seating maps, offline gate sync, resale/transfers, subscriptions/memberships, native apps, multi-currency checkout, Paystack subaccount split settlement, SMS/WhatsApp delivery, organizer-borne processor fees, image moderation.
