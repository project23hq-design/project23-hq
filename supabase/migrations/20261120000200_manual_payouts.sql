-- Manual payouts until Paystack Transfers is available on the account.
--
-- Paystack refuses transfers for "starter" businesses, so automated payouts can't work yet.
-- A new platform setting, paystack_transfers_enabled (default OFF), decides how payouts are
-- settled:
--   OFF: finance pays from the bank and records the bank reference (manual_bank). Bank accounts
--        are verified with Paystack's account-name lookup only.
--   ON:  approved payouts are sent through Paystack Transfers (paystack_transfer). The Paystack
--        transfer recipient is created when first needed.
-- The route is fixed when a payout is approved. Finance can reveal the full account number of an
-- approved manual payout (audited), since paying by hand needs it.

insert into public.platform_settings (key, value, description) values
  ('paystack_transfers_enabled', 'false',
   'Send approved payouts automatically through Paystack Transfers. Off: finance pays from the bank and records the reference.')
on conflict (key) do nothing;

create or replace function private.payout_settlement_method() returns text
language sql stable security definer set search_path = '' as $$
  select case when private.setting_text('paystack_transfers_enabled', 'false') = 'true'
    then 'paystack_transfer' else 'manual_bank' end;
$$;

create or replace function public.payout_request(p_kind text, p_org uuid, p_amount_minor bigint, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.payout_requests; rec public.payout_recipients; v_id uuid; v_avail bigint; v_debt bigint := 0;
  v_user uuid := case when p_kind = 'promoter' then auth.uid() end; c record; v_min bigint;
begin
  perform private.require_beneficiary(p_kind, p_org, array['owner', 'finance']::public.org_role[]);
  if not private.has_recent_auth(900) then perform private.fail('reauth_required'); end if;
  select * into v_existing from public.payout_requests where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.requested_by <> auth.uid() then perform private.fail('forbidden'); end if;
    return v_existing.id;
  end if;
  if p_kind = 'organization' and not exists (select 1 from public.organizations where id = p_org
       and payout_status = 'eligible' and status = 'active') then
    perform private.fail('payouts_not_enabled');
  end if;
  v_min := case when p_kind = 'organization' then private.setting_int('min_payout_minor', 500000)
                else private.setting_int('promoter_min_withdrawal_minor', 200000) end;
  if p_amount_minor < v_min then perform private.fail('below_minimum', v_min::text); end if;
  select * into rec from public.payout_recipients where status = 'verified' and beneficiary_kind = p_kind
    and ((p_kind = 'organization' and organization_id = p_org) or (p_kind = 'promoter' and user_id = v_user));
  if not found then perform private.fail('no_verified_recipient'); end if;
  -- Serialize per beneficiary so concurrent requests cannot spend the same balance.
  perform pg_advisory_xact_lock(hashtextextended('payout:' || p_kind || ':' || coalesce(p_org, v_user)::text, 0));
  select * into c from private.beneficiary_codes(p_kind);
  select coalesce(sum(balance_minor), 0) into v_avail from private.ledger_balances
  where code = c.avail and currency = 'NGN'
    and ((p_kind = 'organization' and organization_id = p_org) or (p_kind = 'promoter' and user_id = v_user));
  if p_kind = 'promoter' then
    select coalesce(sum(balance_minor), 0) into v_debt from private.ledger_balances
    where code = 'promoter_recovery' and owner_kind = 'promoter' and user_id = v_user and currency = 'NGN';
  end if;
  if v_debt > 0 then perform private.fail('recovery_outstanding'); end if;
  if p_amount_minor > v_avail then perform private.fail('insufficient_available_balance'); end if;
  insert into public.payout_requests (beneficiary_kind, organization_id, user_id, recipient_id, amount_minor, currency,
    idempotency_key, requested_by, settlement_method)
  values (p_kind, case when p_kind = 'organization' then p_org end, v_user, rec.id, p_amount_minor, 'NGN',
    p_idempotency_key, auth.uid(), private.payout_settlement_method())
  returning id into v_id;
  perform private.post_ledger('payout_lock:' || v_id, 'payout_lock', 'NGN', jsonb_build_array(
    jsonb_build_object('code', c.avail, 'owner', p_kind, 'org', p_org, 'user', v_user, 'debit', p_amount_minor),
    jsonb_build_object('code', c.locked, 'owner', p_kind, 'org', p_org, 'user', v_user, 'credit', p_amount_minor)), null, null, v_id);
  perform private.audit('payout.request', 'payout_request', v_id::text, p_org, null, jsonb_build_object('amount_minor', p_amount_minor));
  return v_id;
end $$;

create or replace function public.payout_transition(p_payout uuid, p_to public.payout_status, p_note text default null,
  p_external_ref text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare po public.payout_requests; c record; v_ok boolean; v_cash text;
begin
  select * into po from public.payout_requests where id = p_payout for update;
  if not found then perform private.fail('not_found'); end if;
  if p_to = 'cancelled' then
    if po.requested_by <> auth.uid() or po.status <> 'pending' then perform private.fail('forbidden'); end if;
  elsif not (private.has_platform_role(array['finance_admin']::public.platform_role[]) or coalesce(auth.role(), '') = 'service_role') then
    perform private.fail('forbidden');
  end if;
  v_ok := (po.status, p_to) in (('pending', 'approved'), ('pending', 'rejected'), ('pending', 'cancelled'),
    ('approved', 'processing'), ('approved', 'paid'), ('approved', 'failed'), ('processing', 'paid'), ('processing', 'failed'),
    ('paid', 'reversed'));
  if not v_ok then perform private.fail('invalid_transition'); end if;
  if p_to in ('rejected', 'failed', 'reversed') and length(coalesce(trim(p_note), '')) < 3 then perform private.fail('reason_required'); end if;
  if p_to = 'paid' and po.settlement_method = 'manual_bank' and coalesce(p_external_ref, '') = '' then
    perform private.fail('external_reference_required');
  end if;
  perform private.begin_internal();
  -- The payout route is fixed when finance approves, from the current switch: a payout
  -- requested while automatic payouts were on is still paid by hand if they're off now.
  if p_to = 'approved' then
    po.settlement_method := private.payout_settlement_method();
    update public.payout_requests set settlement_method = po.settlement_method where id = po.id;
  end if;
  select * into c from private.beneficiary_codes(po.beneficiary_kind);
  v_cash := case when po.settlement_method = 'paystack_transfer' then 'provider_clearing' else 'bank' end;
  if p_to in ('rejected', 'failed', 'cancelled') then
    perform private.post_ledger('payout_unlock:' || po.id, 'payout_unlock', po.currency, jsonb_build_array(
      jsonb_build_object('code', c.locked, 'owner', po.beneficiary_kind, 'org', po.organization_id, 'user', po.user_id, 'debit', po.amount_minor),
      jsonb_build_object('code', c.avail, 'owner', po.beneficiary_kind, 'org', po.organization_id, 'user', po.user_id, 'credit', po.amount_minor)),
      null, null, po.id);
  elsif p_to = 'paid' then
    perform private.post_ledger('payout_paid:' || po.id, 'payout_paid', po.currency, jsonb_build_array(
      jsonb_build_object('code', c.locked, 'owner', po.beneficiary_kind, 'org', po.organization_id, 'user', po.user_id, 'debit', po.amount_minor),
      jsonb_build_object('code', v_cash, 'owner', 'platform', 'credit', po.amount_minor)), null, null, po.id);
  elsif p_to = 'reversed' then
    perform private.post_ledger('payout_reversed:' || po.id, 'payout_reversed', po.currency, jsonb_build_array(
      jsonb_build_object('code', v_cash, 'owner', 'platform', 'debit', po.amount_minor),
      jsonb_build_object('code', c.avail, 'owner', po.beneficiary_kind, 'org', po.organization_id, 'user', po.user_id, 'credit', po.amount_minor)),
      null, null, po.id);
  end if;
  update public.payout_requests set status = p_to, review_note = coalesce(p_note, review_note),
    reviewed_by = case when p_to in ('approved', 'rejected') then auth.uid() else reviewed_by end,
    external_reference = coalesce(p_external_ref, external_reference),
    failure_reason = case when p_to in ('failed', 'reversed') then p_note else failure_reason end, updated_at = now()
  where id = po.id;
  insert into public.payout_attempts (payout_id, provider, status, detail, created_by)
  values (po.id, po.settlement_method, p_to::text, jsonb_build_object('note', p_note, 'external_ref', p_external_ref), auth.uid());
  if p_to = 'approved' and po.settlement_method = 'paystack_transfer' then
    insert into public.outbox_jobs (kind, payload, dedupe_key)
    values ('payout.transfer', jsonb_build_object('payout_id', po.id), 'payout.transfer:' || po.id);
  end if;
  insert into public.outbox_jobs (kind, payload, dedupe_key)
  values ('payout.status_notice', jsonb_build_object('payout_id', po.id, 'status', p_to), 'payout.notice:' || po.id || ':' || p_to)
  on conflict do nothing;
  perform private.audit('payout.' || p_to, 'payout_request', po.id::text, po.organization_id, p_note,
    jsonb_build_object('amount_minor', po.amount_minor, 'external_ref', p_external_ref));
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  select value into v_old from public.platform_settings where key = p_key for update;
  if not found then perform private.fail('not_found'); end if;
  if p_key = 'processor_fee_bearer' and p_value <> '"platform"'::jsonb then perform private.fail('unsupported_fee_configuration'); end if;
  if p_key = 'promoter_maturity_days' and (p_value #>> '{}')::int < 0 then perform private.fail('invalid_value'); end if;
  if p_key = 'paystack_transfers_enabled' then
    if jsonb_typeof(p_value) <> 'boolean' then perform private.fail('invalid_value'); end if;
    -- Moves money automatically, so only a super admin may switch it.
    if not private.has_platform_role(array['super_admin']::public.platform_role[]) then perform private.fail('forbidden'); end if;
  end if;
  update public.platform_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform private.audit('settings.update', 'platform_setting', p_key, null, p_reason, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

-- Store the Paystack recipient created at transfer time for an already-verified account.
create or replace function public.payout_recipient_set_provider_code(p_recipient uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  update public.payout_recipients set provider_recipient_code = p_code
  where id = p_recipient and status = 'verified';
end $$;

-- Bank details finance needs to pay an approved manual payout. Every reveal is audited.
create or replace function public.admin_payout_bank_details(p_payout uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare po public.payout_requests; rec public.payout_recipients; v_number text;
begin
  if not private.has_platform_role(array['finance_admin']::public.platform_role[]) then perform private.fail('forbidden'); end if;
  select * into po from public.payout_requests where id = p_payout;
  if not found then perform private.fail('not_found'); end if;
  if po.settlement_method <> 'manual_bank' or po.status not in ('approved', 'processing') then
    perform private.fail('invalid_transition');
  end if;
  select * into rec from public.payout_recipients where id = po.recipient_id;
  select account_number into v_number from private.payout_recipient_secrets where recipient_id = rec.id;
  perform private.audit('payout.bank_details_viewed', 'payout_request', po.id::text, po.organization_id, null,
    jsonb_build_object('recipient_id', rec.id, 'last4', rec.account_last4));
  return jsonb_build_object('account_number', v_number, 'account_name', rec.account_name,
    'bank_name', rec.bank_name, 'bank_code', rec.bank_code, 'amount_minor', po.amount_minor, 'reference', po.reference);
end $$;

revoke execute on function private.payout_settlement_method() from public, anon, authenticated;
revoke execute on function public.payout_recipient_set_provider_code(uuid, text) from public, anon, authenticated;
grant execute on function public.payout_recipient_set_provider_code(uuid, text) to service_role;
revoke execute on function public.admin_payout_bank_details(uuid) from public, anon;
grant execute on function public.admin_payout_bank_details(uuid) to authenticated;
