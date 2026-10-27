# Payments, accounting and settlement

## Money representation

- Amounts are `bigint` minor units (kobo). Rates are integer basis points (100 bps = 1%).
- Rounding: **half-up per order line** (`(amount × bps + 5000) / 10000` in integer arithmetic). Fixed discounts are split across eligible lines in proportion to line subtotal with floor division; any remainder is added one kobo at a time in line order, never above a line's subtotal.
- Order economics are snapshotted at order creation (`order_items.unit_price_minor`, `discount_minor`, `platform_fee_minor`, `commission_minor`, `organizer_net_minor`, and `orders.fee_snapshot` holding the policy id, rates and refundable flag). Later price or fee changes never rewrite past orders.

## Fees

Policy precedence: **event override → organization override → platform default**. Policies are insert-only and versioned by `effective_from`.

| Component | Who pays | Default | Where it goes |
| --- | --- | --- | --- |
| Platform fee (bps of line net + optional fixed per paid admission) | Deducted from organizer proceeds | 5% | `platform_revenue` |
| Buyer booking fee (bps of order net + fixed per order) | Buyer, shown before paying | 0 | `buyer_fee_revenue` |
| Promoter commission | Deducted from organizer proceeds | per program | `promoter_*` |
| Processor (Paystack) fees | Platform at launch | as reported by Paystack verify `fees` | `processor_fees` expense |

Processor fees and taxes are **not** invented. The recorded fee is whatever Paystack's verify response reports. `processor_fee_bearer` currently only accepts `platform`; organizer-borne processing fees are a later option. VAT treatment of platform fees needs tax advice before launch.

### Worked examples (sample values only, before processor fees and taxes)

1. **₦10,000 ticket, 5% platform fee**: platform ₦500, organizer ₦9,500. Buyer pays ₦10,000.
2. **₦10,000 eligible ticket, 5% platform fee, 10% promoter**: platform ₦500, promoter ₦1,000, organizer ₦8,500. Buyer still pays ₦10,000.
3. **2 × ₦20,000 VIP with a 10% promo code**: subtotal ₦40,000, discount ₦4,000, total ₦36,000; platform fee ₦1,800 (5% of ₦36,000); organizer ₦34,200.
4. **₦150,000 table admitting 6**: one unit, 6 admissions, 6 tickets; platform ₦7,500. A fixed per-admission fee would apply 6 times.

These are covered by unit tests (`packages/domain`) and integration tests against the real SQL.

## Chart of accounts

| Code | Owner | Normal side | Meaning |
| --- | --- | --- | --- |
| `provider_clearing` | platform | debit | Funds collected and held in the Paystack balance |
| `bank` | platform | debit | Funds settled to the platform bank account (net of manual payouts) |
| `platform_revenue` | platform | credit | Platform fees earned |
| `buyer_fee_revenue` | platform | credit | Buyer booking fees |
| `processor_fees` | platform | debit | Paystack fees (expense) |
| `refunds_payable` | platform | credit | Approved refunds not yet confirmed by Paystack |
| `unallocated_receipts` | platform | credit | Captured money that couldn't be fulfilled (late or duplicate payments, mismatches); owed back to buyers |
| `org_pending` / `org_available` / `org_payout_locked` | organization | credit | What Project23 owes the organizer: pending release, withdrawable, locked in a payout |
| `promoter_pending` / `promoter_available` / `promoter_locked` | promoter | credit | Same for promoters |
| `promoter_recovery` | promoter | debit | Commission reversed after it was paid out; recoverable from future earnings |

## Journal entries

| Event | Entries |
| --- | --- |
| Paid online order | Dr `provider_clearing` total · Cr `platform_revenue` fee · Cr `buyer_fee_revenue` · Cr `promoter_pending` commission · Cr `org_pending` net |
| Processor fee | Dr `processor_fees` · Cr `provider_clearing` |
| Door cash/POS sale (organizer holds cash) | Dr `org_available` platform fee · Cr `platform_revenue` (no provider account touched; no promoter commission) |
| Maturity release | Dr `*_pending` · Cr `*_available` (promoters: Cr `promoter_recovery` first, up to the debt) |
| Refund approved | Dr `org_pending/available` · Dr `promoter_pending` (or `promoter_available` + `promoter_recovery` if already released) · Dr `platform_revenue` (if refundable) · Dr `buyer_fee_revenue` (full organizer/platform refunds only) · Cr `refunds_payable` |
| Refund confirmed | Dr `refunds_payable` (or `unallocated_receipts` for exception refunds) · Cr `provider_clearing` |
| Late/duplicate/mismatched capture | Dr `provider_clearing` · Cr `unallocated_receipts`; automatic refund queued (wrong-currency or wrong-environment captures raise an ops alert for manual handling instead) |
| Payout requested | Dr `*_available` · Cr `*_locked` |
| Payout rejected/failed/cancelled | Dr `*_locked` · Cr `*_available` |
| Payout paid | Dr `*_locked` · Cr `provider_clearing` (Paystack Transfer) or `bank` (manual) |
| Payout reversed by bank | Dr `provider_clearing`/`bank` · Cr `*_available` |
| Paystack settlement to bank | Dr `bank` · Cr `provider_clearing` |

Every transaction has a unique idempotency key (`sale:<order>`, `release:<allocation>`, `payout_lock:<payout>`…) and must balance at commit. Corrections are new reversing transactions, never edits.

## Sales analytics vs cash vs settlement

- **Sales analytics** (organizer Insights, admin overview) are order-based: gross, discounts, fees, commissions, net, refunds.
- **Balances** (Finance, promoter dashboard) are ledger-based and are what can be withdrawn.
- **Cash position**: compare `provider_clearing` with the Paystack dashboard balance and record settlements (`record_provider_settlement`). Differences show up as reconciliation exceptions; the admin overview runs `run_reconciliation()` for stale attempts, paid orders without ledger entries, ticket count mismatches, stuck refunds and payouts, unallocated receipts, promoter recovery and negative organizer balances.

Internal balances are accounting records of obligations. **They are not a regulated wallet or escrow service**, and the UI says so.

## Payment verification

- The redirect callback, query strings and client events are **never** proof of payment.
- `confirmPayment(reference)` always calls the provider's verify endpoint server-to-server, then calls `payment_confirm` with the provider's status, amount, currency, environment (`domain`), transaction id and fees.
- `payment_confirm` locks the attempt. Already-processed attempts return `already_processed`. A non-success status marks the attempt failed or abandoned. Amount, currency or environment mismatches become `mismatch` with no tickets. A second successful capture for an already-paid order becomes `duplicate_payment` and is refunded. Otherwise it calls `fulfill_order`, which is idempotent and order-locked.
- Webhooks: the raw body is verified with HMAC-SHA512 before parsing; every delivery is recorded by body hash, so exact replays are no-ops. Processing failures return 500 so Paystack retries (live: every 3 minutes for 4 tries, then hourly for 72 hours). The webhook fields themselves are not trusted; the handler re-verifies with the API.
- Reconciliation: attempts still `initialized` after 15 minutes are re-verified hourly for 2 days by `payment.reconcile` jobs.

## Refunds

Lifecycle: `requested → approved → processing → completed | failed` (or `rejected`). Ledger reversals happen at approval, cash movement at provider confirmation. Partial refunds name explicit order items and units. Amounts use the same proportional slice formula, so successive partial refunds sum exactly to the line. Used tickets are excluded from buyer requests and included only when an organizer or admin explicitly chooses (event cancellation includes them). Inventory is restored only while the event is still on sale. Cancellation creates a `refund_batch` and one tracked refund per order; failed provider refunds are retried by finance admins.

## Disputes

Paystack `charge.dispute.*` webhooks create or update `disputes`. Open disputes move the order's pending allocations to `held`. Won disputes release them. Lost disputes create a full refund (including used tickets) that is settled immediately, because the provider has already debited the funds.

## Payouts

- Recipients: NUBAN bank code, account name and last 4 digits are visible to authorized users; the full number lives in `private.payout_recipient_secrets` (service role only). Changing a recipient requires owner role and re-authentication, disables the previous recipient, notifies all owners and is audited. Recipients are verified via Paystack Resolve Account plus Create Transfer Recipient (job `payout_recipient.verify`), or by a finance admin.
- Requests: per-beneficiary advisory lock, available-balance check, minimums, idempotency key, immediate lock entry.
- Approval: finance admins (aal2). Paystack-transfer recipients are sent automatically by the `payout.transfer` job. It **verifies the transfer by reference before every (re)try**, so an ambiguous earlier attempt that actually succeeded is never paid twice. Manual-bank payouts require an external bank reference to be marked paid.
- Webhooks `transfer.success|failed|reversed` drive the same transitions.

## Settlement model choice

**Launch model: platform-controlled collection and payouts.** Every online payment lands in Project23's Paystack balance. Organizer and promoter shares are liabilities in the ledger, released after the event plus a holding period and paid by approved payouts.

Why not Paystack subaccounts (split payments)? Split settlement sends the organizer share directly to the organizer's bank, typically T+1. That leaves no reserve for refunds, chargebacks or promoter commissions, and would need a second payout path for promoters. The two models can't both control the same funds, so only one is used. The `PaymentProvider` and settlement logic are isolated so subaccount splits could replace this for specific organizers later; double payment would then be prevented by not creating `org_pending` allocations for split-settled orders.

### Prerequisites before enabling live collections

1. A Paystack account approved for live payments under a business category that allows collecting on behalf of third parties. Confirm the marketplace model with Paystack, as it may require additional KYC or a different product.
2. Transfers enabled on the live account. Disable transfer OTP for API use, or keep manual approval.
3. Legal review of whether holding organizer funds pending an event requires licensing or specific terms under Nigerian law (CBN guidance on payment service providers). The organizer terms here are a draft.
4. Tax treatment of platform fees (VAT) and promoter commissions (WHT).
5. Agreed processes for reserve levels and handling negative organizer balances (door-sale fees or refunds after payout).
