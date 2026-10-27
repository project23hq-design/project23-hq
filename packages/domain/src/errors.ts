/** Engine error codes (raised by SQL functions via private.fail) mapped to user-facing copy. */
export const ENGINE_ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find that.",
  event_not_found: "This event no longer exists.",
  event_not_on_sale: "Tickets for this event aren't on sale right now.",
  event_ended: "This event has ended.",
  event_sold_out: "Sorry — this event has sold out.",
  organizer_suspended: "This organizer can't sell tickets right now.",
  currency_not_supported: "Checkout isn't available in this currency yet.",
  invalid_items: "Choose at least one ticket (up to 10 ticket types).",
  invalid_ticket_type: "One of the selected tickets isn't valid for this event.",
  invalid_quantity: "That quantity isn't allowed for this ticket.",
  ticket_unavailable: "That ticket isn't available.",
  invalid_access_code: "That access code isn't valid.",
  sales_not_started: "Sales for that ticket haven't started yet.",
  sales_ended: "Sales for that ticket have ended.",
  insufficient_inventory: "Not enough tickets left — try a smaller quantity.",
  invalid_promo_code: "That promo code isn't valid for this event.",
  promo_exhausted: "That promo code has reached its limit.",
  promo_not_applicable: "That promo code doesn't apply to the selected tickets.",
  fee_policy_missing: "Checkout is temporarily unavailable. Please try again shortly.",
  unsupported_fee_configuration: "Checkout is temporarily unavailable.",
  order_not_payable: "This order can no longer be paid. Please start again.",
  too_many_payment_attempts: "Too many payment attempts for this order. Please start a new order.",
  invalid_idempotency_key: "Something went wrong. Please refresh and try again.",
  email_not_verified: "Please verify your email address first.",
  slug_taken: "That URL is already taken — try another.",
  organization_limit: "You've reached the maximum number of organizations.",
  invitation_invalid: "This invitation is invalid or has expired.",
  invitation_wrong_account: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  last_owner: "An organization must always have at least one owner.",
  not_a_member: "That person must be a member of your organization first.",
  invalid_transition: "That status change isn't allowed.",
  event_incomplete: "Finish the required details before submitting.",
  organization_not_approved: "The organization must be approved first.",
  reason_required: "Please provide a reason.",
  invalid_decision: "Unknown decision.",
  order_not_refundable: "This order can't be refunded.",
  refund_policy_disallows: "This event's refund policy doesn't allow refunds now. Contact the organizer.",
  units_not_refundable: "Some selected tickets have already been used or refunded.",
  nothing_to_refund: "There is nothing left to refund on this order.",
  refund_stale: "Tickets changed since the request was made. Please create a new request.",
  reauth_required: "For your security, please confirm your password and try again.",
  invalid_account_number: "Enter a valid 10-digit NUBAN account number.",
  payouts_not_enabled: "Payouts aren't enabled for this organization yet.",
  below_minimum: "That amount is below the minimum withdrawal.",
  no_verified_recipient: "Add and verify a payout bank account first.",
  insufficient_available_balance: "That's more than your available balance.",
  recovery_outstanding: "An outstanding reversal must be recovered from future earnings before you can withdraw.",
  external_reference_required: "Enter the bank transfer reference.",
  rate_out_of_bounds: "That commission rate is outside the allowed range.",
  rate_exceeds_proceeds: "That rate would leave too little of the ticket price for the organizer.",
  invalid_window: "Attribution window must be between 1 and 60 days.",
  terms_required: "Write program terms (at least 20 characters).",
  program_not_active: "This referral program isn't accepting promoters.",
  terms_outdated: "The program terms changed. Please review and accept the latest version.",
  self_referral_not_allowed: "Organization members can't promote their own events for commission.",
  enrollment_closed: "Your enrollment for this program is closed.",
  ticket_not_valid: "This ticket isn't valid.",
  not_checked_in: "This ticket hasn't been checked in yet.",
  invalid_payment_method: "Choose cash or external POS.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  effective_date_in_past: "Effective date can't be in the past.",
  invalid_amount: "Enter a valid amount.",
  invalid_value: "That value isn't valid.",
};

export function engineErrorMessage(code: string | undefined | null, fallback = "Something went wrong. Please try again."): string {
  if (!code) return fallback;
  return ENGINE_ERRORS[code] ?? fallback;
}

/** Extract an engine code from a PostgREST error ({ message, code: 'P0001' }). */
export function engineCode(err: { message?: string; code?: string } | null | undefined): string | null {
  if (!err) return null;
  if (err.code === "P0001" && err.message && /^[a-z_]+$/.test(err.message)) return err.message;
  return null;
}
