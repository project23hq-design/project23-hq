-- Tenancy, moderation, refunds, cancellations, disputes, earnings maturity, payouts,
-- referral programs, administration and analytics RPCs.

-- ===========================================================================
-- Organizations & membership
-- ===========================================================================
create or replace function private.require_verified_email() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select lower(email) into v from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v is null then perform private.fail('email_not_verified'); end if;
  return v;
end $$;

create or replace function public.create_organization(
  p_name text, p_slug text, p_description text default null, p_contact_email text default null,
  p_contact_phone text default null, p_city_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_region uuid;
begin
  if auth.uid() is null then perform private.fail('forbidden'); end if;
  perform private.require_verified_email();
  if (select count(*) from public.memberships where user_id = auth.uid() and role = 'owner') >= 5 then
    perform private.fail('organization_limit');
  end if;
  select region_id into v_region from public.cities where id = p_city_id;
  insert into public.organizations (slug, name, description, contact_email, contact_phone, city_id, region_id, created_by)
  values (lower(p_slug), trim(p_name), p_description, lower(p_contact_email), p_contact_phone, p_city_id, v_region, auth.uid())
  returning id into v_id;
  insert into public.memberships (organization_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.organization_referral_defaults (organization_id, rate_bps, terms_text)
  values (v_id, 1000, 'Promoters earn the stated commission on verified, fulfilled ticket sales attributed to their link. Commissions on refunded or disputed sales are reversed. Self-referrals are not eligible.');
  perform private.audit('organization.create', 'organization', v_id::text, v_id);
  return v_id;
exception when unique_violation then
  perform private.fail('slug_taken');
end $$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role public.org_role, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_my public.org_role := private.org_role_of(p_org);
begin
  if v_my is null or v_my not in ('owner', 'manager') then perform private.fail('forbidden'); end if;
  if v_my = 'manager' and p_role in ('owner', 'finance') then perform private.fail('forbidden'); end if;
  if not private.org_is_active(p_org) then perform private.fail('organizer_suspended'); end if;
  if (select count(*) from public.invitations where organization_id = p_org and created_at > now() - interval '1 day') >= 30 then
    perform private.fail('rate_limited');
  end if;
  update public.invitations set revoked_at = now()
  where organization_id = p_org and email = lower(trim(p_email)) and accepted_at is null and revoked_at is null;
  insert into public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  values (p_org, lower(trim(p_email)), p_role, p_token_hash, auth.uid(), now() + interval '7 days')
  returning id into v_id;
  perform private.audit('membership.invite', 'invitation', v_id::text, p_org, null,
    jsonb_build_object('role', p_role));
  return v_id;
end $$;

create or replace function public.accept_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; v_email text;
begin
  if auth.uid() is null then perform private.fail('forbidden'); end if;
  v_email := private.require_verified_email();
  select * into inv from public.invitations where token_hash = p_token_hash for update;
  if not found or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at < now() then
    perform private.fail('invitation_invalid');
  end if;
  if inv.email <> v_email then perform private.fail('invitation_wrong_account'); end if;
  insert into public.memberships (organization_id, user_id, role) values (inv.organization_id, auth.uid(), inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  perform private.audit('membership.accept', 'invitation', inv.id::text, inv.organization_id, null,
    jsonb_build_object('role', inv.role));
  return inv.organization_id;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation;
  if not private.has_org_role(inv.organization_id, array['owner', 'manager']::public.org_role[]) then perform private.fail('forbidden'); end if;
  update public.invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
  perform private.audit('membership.invite_revoke', 'invitation', p_invitation::text, inv.organization_id);
end $$;

create or replace function public.change_member_role(p_org uuid, p_user uuid, p_role public.org_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.org_role;
begin
  if not private.has_org_role(p_org, array['owner']::public.org_role[]) then perform private.fail('forbidden'); end if;
  perform 1 from public.memberships where organization_id = p_org and role = 'owner' for update;
  select role into v_old from public.memberships where organization_id = p_org and user_id = p_user;
  if v_old is null then perform private.fail('not_found'); end if;
  if v_old = 'owner' and p_role <> 'owner'
     and (select count(*) from public.memberships where organization_id = p_org and role = 'owner') <= 1 then
    perform private.fail('last_owner');
  end if;
  update public.memberships set role = p_role where organization_id = p_org and user_id = p_user;
  if p_role not in ('owner', 'manager', 'scanner') then
    delete from public.event_staff where organization_id = p_org and user_id = p_user;
  end if;
  perform private.audit('membership.role_change', 'membership', p_user::text, p_org, null,
    jsonb_build_object('from', v_old, 'to', p_role));
end $$;

create or replace function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.org_role;
begin
  if not (private.has_org_role(p_org, array['owner']::public.org_role[]) or p_user = auth.uid()) then
    perform private.fail('forbidden');
  end if;
  perform 1 from public.memberships where organization_id = p_org and role = 'owner' for update;
  select role into v_role from public.memberships where organization_id = p_org and user_id = p_user;
  if v_role is null then perform private.fail('not_found'); end if;
  if v_role = 'owner' and (select count(*) from public.memberships where organization_id = p_org and role = 'owner') <= 1 then
    perform private.fail('last_owner');
  end if;
  delete from public.event_staff where organization_id = p_org and user_id = p_user;
  delete from public.memberships where organization_id = p_org and user_id = p_user;
  perform private.audit('membership.remove', 'membership', p_user::text, p_org);
end $$;

create or replace function public.org_members(p_org uuid) returns table (user_id uuid, role public.org_role, full_name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_org_role(p_org, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  return query select m.user_id, m.role, p.full_name, u.email::text, m.created_at
    from public.memberships m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org order by m.created_at;
end $$;

create or replace function public.assign_event_staff(p_event uuid, p_user uuid, p_door boolean, p_comps boolean, p_reentry boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.event_org(p_event);
begin
  if not private.has_org_role(v_org, array['owner', 'manager']::public.org_role[]) then perform private.fail('forbidden'); end if;
  if not exists (select 1 from public.memberships where organization_id = v_org and user_id = p_user
                 and role in ('owner', 'manager', 'scanner')) then
    perform private.fail('not_a_member');
  end if;
  insert into public.event_staff (event_id, organization_id, user_id, can_door_sell, can_issue_comps, can_override_reentry, assigned_by)
  values (p_event, v_org, p_user, p_door, p_comps, p_reentry, auth.uid())
  on conflict (event_id, user_id) do update set can_door_sell = excluded.can_door_sell,
    can_issue_comps = excluded.can_issue_comps, can_override_reentry = excluded.can_override_reentry;
  perform private.audit('event.staff_assign', 'event', p_event::text, v_org, null,
    jsonb_build_object('user_id', p_user, 'door', p_door, 'comps', p_comps, 'reentry', p_reentry));
end $$;

create or replace function public.unassign_event_staff(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.event_org(p_event);
begin
  if not private.has_org_role(v_org, array['owner', 'manager']::public.org_role[]) then perform private.fail('forbidden'); end if;
  delete from public.event_staff where event_id = p_event and user_id = p_user;
  perform private.audit('event.staff_unassign', 'event', p_event::text, v_org, null, jsonb_build_object('user_id', p_user));
end $$;

-- ===========================================================================
-- Event lifecycle & moderation
-- ===========================================================================
create or replace function public.event_submit_for_review(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_problems text[] := '{}';
begin
  select * into ev from public.events where id = p_event for update;
  if not private.has_org_role(ev.organization_id, array['owner', 'manager']::public.org_role[]) then perform private.fail('forbidden'); end if;
  if not private.org_is_active(ev.organization_id) then perform private.fail('organizer_suspended'); end if;
  if ev.status <> 'draft' then perform private.fail('invalid_transition'); end if;
  if coalesce(length(ev.description_html), 0) < 20 then v_problems := v_problems || 'description'; end if;
  if ev.starts_at <= now() then v_problems := v_problems || 'starts_at'; end if;
  if ev.format <> 'online' and (ev.venue_name is null or ev.city_id is null) then v_problems := v_problems || 'venue'; end if;
  if ev.category_id is null then v_problems := v_problems || 'category'; end if;
  if not exists (select 1 from public.ticket_types where event_id = ev.id and is_active and quantity_total > 0) then
    v_problems := v_problems || 'ticket_types';
  end if;
  if cardinality(v_problems) > 0 then perform private.fail('event_incomplete', array_to_string(v_problems, ',')); end if;
  perform private.begin_internal();
  update public.events set status = 'pending_review', moderation_status = 'pending', moderation_notes = null where id = ev.id;
  perform private.audit('event.submit', 'event', ev.id::text, ev.organization_id);
end $$;

create or replace function public.admin_moderate_event(p_event uuid, p_decision text, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  select * into ev from public.events where id = p_event for update;
  if ev.status <> 'pending_review' then perform private.fail('invalid_transition'); end if;
  perform private.begin_internal();
  if p_decision = 'approve' then
    if not exists (select 1 from public.organizations where id = ev.organization_id and approval_status = 'approved' and status = 'active') then
      perform private.fail('organization_not_approved');
    end if;
    update public.events set status = 'published', moderation_status = 'approved', moderation_notes = p_notes,
      published_at = coalesce(published_at, now()) where id = ev.id;
  elsif p_decision in ('changes_requested', 'reject') then
    if length(coalesce(trim(p_notes), '')) < 5 then perform private.fail('reason_required'); end if;
    update public.events set status = 'draft',
      moderation_status = case when p_decision = 'reject' then 'rejected' else 'changes_requested' end::public.moderation_status,
      moderation_notes = p_notes where id = ev.id;
    insert into public.outbox_jobs (kind, payload, dedupe_key)
    values ('event.moderation_feedback', jsonb_build_object('event_id', ev.id), 'event.moderation:' || ev.id || ':' || extract(epoch from now()));
  else
    perform private.fail('invalid_decision');
  end if;
  perform private.audit('event.moderate', 'event', ev.id::text, ev.organization_id, p_notes, jsonb_build_object('decision', p_decision));
end $$;

create or replace function public.event_set_status(p_event uuid, p_status public.event_status, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event for update;
  if not (private.has_org_role(ev.organization_id, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  if p_status not in ('paused', 'published', 'archived') then perform private.fail('invalid_transition'); end if;
  if p_status = 'published' and (ev.status <> 'paused' or ev.moderation_status <> 'approved') then perform private.fail('invalid_transition'); end if;
  if p_status = 'published' and not private.org_is_active(ev.organization_id) then perform private.fail('organizer_suspended'); end if;
  perform private.begin_internal();
  update public.events set status = p_status where id = ev.id;
  perform private.audit('event.status', 'event', ev.id::text, ev.organization_id, p_reason,
    jsonb_build_object('from', ev.status, 'to', p_status));
end $$;

create or replace function public.admin_feature_event(p_event uuid, p_featured boolean, p_rank int default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  perform private.begin_internal();
  update public.events set is_featured = p_featured, featured_rank = case when p_featured then p_rank end where id = p_event;
  perform private.audit('event.feature', 'event', p_event::text, private.event_org(p_event), null,
    jsonb_build_object('featured', p_featured, 'rank', p_rank));
end $$;

create or replace function public.complete_past_events() returns int
language plpgsql security definer set search_path = '' as $$
declare c int;
begin
  perform private.require_service();
  perform private.begin_internal();
  update public.events set status = 'completed' where status in ('published', 'paused') and ends_at < now() - interval '6 hours';
  get diagnostics c = row_count;
  return c;
end $$;

-- ===========================================================================
-- Refunds
-- ===========================================================================
-- Creates a refund request. Units are whole purchased units (a table = all its seats).
-- Used (checked-in) units are excluded unless p_include_used (organizer/platform only).
create or replace function public.refund_request_create(
  p_order uuid, p_items jsonb, p_reason text, p_include_used boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ord public.orders; ev public.events; it public.order_items; v_kind text; v_id uuid;
  v_units int; v_avail int; v_amount bigint; v_total bigint := 0; v_fee bigint; v_comm bigint;
  v_unit_nums int[]; v_all_remaining boolean := true; v_requested jsonb;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found then perform private.fail('not_found'); end if;
  select * into ev from public.events where id = ord.event_id;
  if private.is_platform_admin() or coalesce(auth.role(), '') = 'service_role' then v_kind := 'platform';
  elsif private.has_org_role(ord.organization_id, array['owner', 'manager', 'finance']::public.org_role[]) then v_kind := 'organizer';
  elsif ord.buyer_user_id = auth.uid() then v_kind := 'buyer';
  else perform private.fail('forbidden');
  end if;
  if ord.status not in ('paid', 'partially_refunded') then perform private.fail('order_not_refundable'); end if;
  if length(coalesce(trim(p_reason), '')) < 3 then perform private.fail('reason_required'); end if;
  if v_kind = 'buyer' then
    if p_include_used then perform private.fail('forbidden'); end if;
    if ev.refund_policy = 'no_refunds'
       or (ev.refund_policy = 'until_24h' and now() > ev.starts_at - interval '24 hours')
       or (ev.refund_policy = 'until_7d' and now() > ev.starts_at - interval '7 days') then
      perform private.fail('refund_policy_disallows');
    end if;
  end if;

  insert into public.refund_requests (order_id, organization_id, requested_by, requester_kind, reason, include_used_tickets)
  values (ord.id, ord.organization_id, auth.uid(), v_kind, trim(p_reason), coalesce(p_include_used, false))
  returning id into v_id;

  for it in select * from public.order_items where order_id = ord.id order by id loop
    v_requested := (select x.value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x(value)
                    where x.value ->> 'order_item_id' = it.id::text limit 1);
    if p_items is not null and v_requested is null then
      if it.refunded_units < it.quantity then v_all_remaining := false; end if;
      continue;
    end if;
    -- refundable units: every ticket in the unit valid and (unused or include_used)
    select array_agg(unit_number order by unit_number) into v_unit_nums from (
      select t.unit_number from public.tickets t where t.order_item_id = it.id
      group by t.unit_number
      having bool_and(t.status = 'valid') and (p_include_used or bool_and(t.first_checked_in_at is null))) s;
    v_avail := coalesce(cardinality(v_unit_nums), 0);
    v_units := coalesce((v_requested ->> 'units')::int, v_avail);
    if v_units > v_avail then perform private.fail('units_not_refundable', it.ticket_type_name); end if;
    if v_units < it.quantity - it.refunded_units then v_all_remaining := false; end if;
    if v_units = 0 then continue; end if;
    v_amount := (it.line_net_minor * (it.refunded_units + v_units)) / it.quantity - (it.line_net_minor * it.refunded_units) / it.quantity;
    v_fee := case when (ord.fee_snapshot ->> 'platform_fee_refundable')::boolean
                  then (it.platform_fee_minor * (it.refunded_units + v_units)) / it.quantity - (it.platform_fee_minor * it.refunded_units) / it.quantity
                  else 0 end;
    v_comm := (it.commission_minor * (it.refunded_units + v_units)) / it.quantity - (it.commission_minor * it.refunded_units) / it.quantity;
    -- independent floor rounding can overshoot by a kobo; organizer reversal never goes negative
    v_fee := least(v_fee, v_amount);
    v_comm := least(v_comm, v_amount - v_fee);
    insert into public.refund_items (refund_request_id, order_item_id, units, amount_minor, platform_fee_reversed_minor,
      commission_reversed_minor, organizer_reversed_minor, ticket_ids)
    values (v_id, it.id, v_units, v_amount, v_fee, v_comm, v_amount - v_fee - v_comm,
      (select array_agg(t.id) from public.tickets t where t.order_item_id = it.id and t.unit_number = any(v_unit_nums[1:v_units])));
    v_total := v_total + v_amount;
  end loop;

  if not exists (select 1 from public.refund_items where refund_request_id = v_id) then perform private.fail('nothing_to_refund'); end if;
  -- Buyer booking fee is returned only on full organizer/platform-initiated refunds.
  if v_all_remaining and v_kind <> 'buyer' then v_total := v_total + ord.buyer_fee_minor; end if;
  perform private.begin_internal();
  update public.refund_requests set amount_minor = v_total where id = v_id;
  perform private.audit('refund.request', 'refund_request', v_id::text, ord.organization_id, p_reason,
    jsonb_build_object('amount_minor', v_total, 'requester', v_kind));
  if v_kind <> 'buyer' then
    perform private.refund_apply(v_id, auth.uid(), 'Initiated by ' || v_kind);
  end if;
  return v_id;
end $$;

-- Approves and books a refund: voids tickets, reverses ledger/allocations, restores inventory
-- only while the event is still on sale, then queues provider processing.
create or replace function private.refund_apply(p_refund uuid, p_reviewer uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rr public.refund_requests; ord public.orders; ev public.events; ri record; al public.earnings_allocations;
  v_lines jsonb := '[]'; v_fee_total bigint := 0; v_buyer_fee bigint; v_items_total bigint := 0;
  v_promoter uuid; v_avail bigint; v_from_avail bigint; v_restore boolean;
begin
  perform private.begin_internal();
  select * into rr from public.refund_requests where id = p_refund for update;
  if rr.status <> 'requested' then perform private.fail('invalid_transition'); end if;
  select * into ord from public.orders where id = rr.order_id for update;
  select * into ev from public.events where id = ord.event_id for update;
  v_restore := ev.status = 'published' and ev.ends_at > now();

  for ri in select r.*, i.ticket_type_id, i.admissions_per_unit, i.quantity, i.refunded_units
            from public.refund_items r join public.order_items i on i.id = r.order_item_id
            where r.refund_request_id = rr.id loop
    -- re-validate tickets (state may have changed since the request)
    if exists (select 1 from public.tickets where id = any(ri.ticket_ids)
               and (status <> 'valid' or (not rr.include_used_tickets and first_checked_in_at is not null))) then
      perform private.fail('refund_stale');
    end if;
    update public.tickets set status = 'refunded', voided_at = now(), void_reason = 'refund:' || rr.id, qr_hash = null
    where id = any(ri.ticket_ids);
    update public.order_items set refunded_units = refunded_units + ri.units where id = ri.order_item_id;
    if v_restore then
      update public.ticket_types set units_sold = units_sold - ri.units where id = ri.ticket_type_id;
      update public.events set admissions_sold = admissions_sold - ri.units * ri.admissions_per_unit where id = ev.id;
    end if;
    v_items_total := v_items_total + ri.amount_minor;
    v_fee_total := v_fee_total + ri.platform_fee_reversed_minor;

    if ord.payment_method = 'paystack' then
      -- organizer portion
      select * into al from public.earnings_allocations where order_item_id = ri.order_item_id and beneficiary_kind = 'organization' for update;
      v_lines := v_lines || jsonb_build_object('code', case when al.status = 'released' then 'org_available' else 'org_pending' end,
        'owner', 'organization', 'org', ord.organization_id, 'debit', ri.organizer_reversed_minor);
      if al.id is not null then
        update public.earnings_allocations set reversed_minor = least(amount_minor, reversed_minor + greatest(ri.organizer_reversed_minor, 0)),
          status = case when least(amount_minor, reversed_minor + greatest(ri.organizer_reversed_minor, 0)) = amount_minor and status <> 'released'
                        then 'reversed' else status end
        where id = al.id;
      end if;
      -- promoter portion (recovery balance if already released and spent)
      if ri.commission_reversed_minor > 0 then
        select * into al from public.earnings_allocations where order_item_id = ri.order_item_id and beneficiary_kind = 'promoter' for update;
        v_promoter := al.promoter_user_id;
        if al.status = 'released' then
          select coalesce(sum(balance_minor), 0) into v_avail from private.ledger_balances
          where code = 'promoter_available' and user_id = v_promoter and currency = ord.currency;
          v_from_avail := least(greatest(v_avail, 0), ri.commission_reversed_minor);
          -- Already released: take what is still available; the remainder becomes an explicit
          -- recovery receivable from the promoter, offset against future releases.
          v_lines := v_lines
            || jsonb_build_object('code', 'promoter_available', 'owner', 'promoter', 'user', v_promoter, 'debit', v_from_avail)
            || jsonb_build_object('code', 'promoter_recovery', 'owner', 'promoter', 'user', v_promoter,
                                  'debit', ri.commission_reversed_minor - v_from_avail);
        else
          v_lines := v_lines || jsonb_build_object('code', 'promoter_pending', 'owner', 'promoter', 'user', v_promoter,
            'debit', ri.commission_reversed_minor);
        end if;
        update public.earnings_allocations set reversed_minor = reversed_minor + ri.commission_reversed_minor,
          status = case when reversed_minor + ri.commission_reversed_minor = amount_minor and status <> 'released' then 'reversed' else status end
        where id = al.id;
      end if;
    end if;
  end loop;

  v_buyer_fee := rr.amount_minor - v_items_total;
  if ord.payment_method = 'paystack' then
    v_lines := v_lines
      || jsonb_build_object('code', 'platform_revenue', 'owner', 'platform', 'debit', v_fee_total)
      || jsonb_build_object('code', 'buyer_fee_revenue', 'owner', 'platform', 'debit', v_buyer_fee)
      || jsonb_build_object('code', 'refunds_payable', 'owner', 'platform', 'credit', rr.amount_minor);
    perform private.post_ledger('refund_approve:' || rr.id, 'refund_approved', ord.currency, v_lines, ord.id, rr.id);
  elsif ord.payment_method in ('cash', 'pos_external') and v_fee_total > 0 then
    perform private.post_ledger('refund_approve:' || rr.id, 'door_refund_fee_reversal', ord.currency, jsonb_build_array(
      jsonb_build_object('code', 'platform_revenue', 'owner', 'platform', 'debit', v_fee_total),
      jsonb_build_object('code', 'org_available', 'owner', 'organization', 'org', ord.organization_id, 'credit', v_fee_total)), ord.id, rr.id);
  end if;

  update public.orders set status = case
      when not exists (select 1 from public.order_items where order_id = ord.id and refunded_units < quantity) then 'refunded'
      else 'partially_refunded' end::public.order_status
  where id = ord.id;

  if ord.payment_method = 'paystack' and rr.amount_minor > 0 then
    update public.refund_requests set status = 'processing', reviewed_by = p_reviewer, reviewed_at = now(), review_note = p_note,
      payment_attempt_id = (select id from public.payment_attempts where order_id = ord.id and status = 'success')
    where id = rr.id;
    insert into public.outbox_jobs (kind, payload, dedupe_key)
    values ('refund.process', jsonb_build_object('refund_id', rr.id), 'refund.process:' || rr.id);
  else
    -- free/comp: nothing to return; cash/POS: organizer returns funds directly (recorded as manual).
    update public.refund_requests set status = 'completed', reviewed_by = p_reviewer, reviewed_at = now(),
      review_note = p_note, completed_at = now() where id = rr.id;
    insert into public.refund_attempts (refund_request_id, provider, status, amount_minor)
    values (rr.id, 'manual', 'manual', rr.amount_minor);
    insert into public.outbox_jobs (kind, payload, dedupe_key)
    values ('refund.completed_notice', jsonb_build_object('refund_id', rr.id), 'refund.completed_notice:' || rr.id);
  end if;
  perform private.audit('refund.approve', 'refund_request', rr.id::text, ord.organization_id, p_note,
    jsonb_build_object('amount_minor', rr.amount_minor));
end $$;

create or replace function public.refund_review(p_refund uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare rr public.refund_requests;
begin
  select * into rr from public.refund_requests where id = p_refund;
  if not found then perform private.fail('not_found'); end if;
  if not (private.has_org_role(rr.organization_id, array['owner', 'manager', 'finance']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  if p_approve then
    perform private.refund_apply(p_refund, auth.uid(), p_note);
  else
    if length(coalesce(trim(p_note), '')) < 3 then perform private.fail('reason_required'); end if;
    perform private.begin_internal();
    update public.refund_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
    where id = p_refund and status = 'requested';
    if not found then perform private.fail('invalid_transition'); end if;
    perform private.audit('refund.reject', 'refund_request', p_refund::text, rr.organization_id, p_note);
  end if;
end $$;

-- Provider outcome for a refund (from the refund job or refund webhooks).
create or replace function public.refund_mark_result(p_refund uuid, p_status text, p_provider_refund_id text default null, p_failure text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare rr public.refund_requests; ord public.orders;
begin
  perform private.require_service();
  perform private.begin_internal();
  select * into rr from public.refund_requests where id = p_refund for update;
  if rr.status in ('completed') then return; end if;
  select * into ord from public.orders where id = rr.order_id;
  insert into public.refund_attempts (refund_request_id, provider, provider_refund_id, status, amount_minor, failure_reason)
  values (rr.id, 'paystack', p_provider_refund_id, p_status, rr.amount_minor, p_failure)
  on conflict (provider_refund_id) do update set status = excluded.status, failure_reason = excluded.failure_reason, updated_at = now();
  if p_status = 'processed' then
    perform private.post_ledger('refund_paid:' || rr.id, 'refund_paid', ord.currency, jsonb_build_array(
      jsonb_build_object('code', case when rr.kind = 'exception' then 'unallocated_receipts' else 'refunds_payable' end,
                         'owner', 'platform', 'debit', rr.amount_minor),
      jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'credit', rr.amount_minor)), ord.id, rr.id);
    update public.refund_requests set status = 'completed', completed_at = now() where id = rr.id;
    insert into public.outbox_jobs (kind, payload, dedupe_key)
    values ('refund.completed_notice', jsonb_build_object('refund_id', rr.id), 'refund.completed_notice:' || rr.id)
    on conflict do nothing;
  elsif p_status = 'failed' then
    update public.refund_requests set status = 'failed' where id = rr.id;
    perform private.audit('refund.failed', 'refund_request', rr.id::text, rr.organization_id, p_failure);
  else
    update public.refund_requests set status = 'processing' where id = rr.id;
  end if;
end $$;

create or replace function public.refund_retry(p_refund uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.has_platform_role(array['finance_admin']::public.platform_role[]) or coalesce(auth.role(), '') = 'service_role') then
    perform private.fail('forbidden');
  end if;
  perform private.begin_internal();
  update public.refund_requests set status = 'processing' where id = p_refund and status = 'failed';
  if not found then perform private.fail('invalid_transition'); end if;
  insert into public.outbox_jobs (kind, payload, dedupe_key)
  values ('refund.process', jsonb_build_object('refund_id', p_refund), 'refund.process:' || p_refund || ':' || extract(epoch from now())::bigint);
  perform private.audit('refund.retry', 'refund_request', p_refund::text);
end $$;

-- ===========================================================================
-- Event cancellation: stop sales, release holds, refund every paid order (tracked batch).
-- ===========================================================================
create or replace function public.cancel_event(p_event uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_batch uuid; o record; v_rr uuid;
begin
  select * into ev from public.events where id = p_event for update;
  if not (private.has_org_role(ev.organization_id, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  if length(coalesce(trim(p_reason), '')) < 5 then perform private.fail('reason_required'); end if;
  if ev.status not in ('published', 'paused') then perform private.fail('invalid_transition'); end if;
  perform private.begin_internal();
  update public.events set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason where id = ev.id;
  update public.referral_programs set status = 'closed' where event_id = ev.id;
  for o in select id from public.orders where event_id = ev.id and status = 'pending_payment' loop
    perform private.release_order_hold(o.id, 'cancelled');
  end loop;
  insert into public.refund_batches (event_id, reason, created_by) values (ev.id, p_reason, auth.uid()) returning id into v_batch;
  for o in select id from public.orders where event_id = ev.id and status in ('paid', 'partially_refunded') loop
    v_rr := public.refund_request_create(o.id, null, 'Event cancelled: ' || p_reason, true);
    update public.refund_requests set batch_id = v_batch where id = v_rr;
  end loop;
  insert into public.outbox_jobs (kind, payload, dedupe_key)
  values ('event.cancelled', jsonb_build_object('event_id', ev.id, 'batch_id', v_batch), 'event.cancelled:' || ev.id);
  perform private.audit('event.cancel', 'event', ev.id::text, ev.organization_id, p_reason);
  return v_batch;
end $$;

-- ===========================================================================
-- Disputes / chargebacks
-- ===========================================================================
create or replace function public.dispute_record(
  p_provider text, p_dispute_id text, p_reference text, p_status text, p_amount_minor bigint, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare pa public.payment_attempts; d public.disputes; v_rr uuid;
begin
  perform private.require_service();
  perform private.begin_internal();
  select * into pa from public.payment_attempts where reference = p_reference;
  if not found then perform private.fail('unknown_reference'); end if;
  insert into public.disputes (order_id, provider, provider_dispute_id, status, amount_minor, reason)
  values (pa.order_id, p_provider, p_dispute_id, p_status, p_amount_minor, p_reason)
  on conflict (provider_dispute_id) do update set status = excluded.status,
    resolved_at = case when excluded.status in ('won', 'lost', 'resolved') then now() end
  returning * into d;
  if p_status in ('open', 'awaiting_response') then
    update public.earnings_allocations set status = 'held', hold_reason = 'dispute:' || d.id
    where order_id = pa.order_id and status = 'pending';
  elsif p_status in ('won', 'resolved') then
    update public.earnings_allocations set status = 'pending', hold_reason = null
    where order_id = pa.order_id and status = 'held' and hold_reason = 'dispute:' || d.id;
  elsif p_status = 'lost' then
    update public.earnings_allocations set status = 'pending', hold_reason = null
    where order_id = pa.order_id and status = 'held';
    if exists (select 1 from public.orders where id = pa.order_id and status in ('paid', 'partially_refunded')) then
      v_rr := public.refund_request_create(pa.order_id, null, 'Chargeback lost: ' || coalesce(p_reason, p_dispute_id), true);
      update public.refund_requests set kind = 'dispute' where id = v_rr;
      -- provider already debited the funds: settle the refund immediately
      perform public.refund_mark_result(v_rr, 'processed', 'dispute:' || p_dispute_id, null);
    end if;
  end if;
  perform private.audit('dispute.' || p_status, 'dispute', d.id::text,
    (select organization_id from public.orders where id = pa.order_id), p_reason);
end $$;

-- ===========================================================================
-- Earnings maturity (exactly-once release; offsets promoter recovery debt first)
-- ===========================================================================
create or replace function public.release_matured_earnings(p_limit int default 500) returns int
language plpgsql security definer set search_path = '' as $$
declare al public.earnings_allocations; v_net bigint; v_debt bigint; v_offset bigint; c int := 0;
begin
  perform private.require_service();
  for al in select * from public.earnings_allocations where status = 'pending' and matures_at <= now()
            order by matures_at limit p_limit for update skip locked loop
    v_net := al.amount_minor - al.reversed_minor;
    if v_net > 0 and al.beneficiary_kind = 'organization' then
      perform private.post_ledger('release:' || al.id, 'earnings_release', al.currency, jsonb_build_array(
        jsonb_build_object('code', 'org_pending', 'owner', 'organization', 'org', al.organization_id, 'debit', v_net),
        jsonb_build_object('code', 'org_available', 'owner', 'organization', 'org', al.organization_id, 'credit', v_net)), al.order_id);
    elsif v_net > 0 then
      select coalesce(sum(balance_minor), 0) into v_debt from private.ledger_balances
      where code = 'promoter_recovery' and owner_kind = 'promoter' and user_id = al.promoter_user_id and currency = al.currency;
      v_offset := least(greatest(v_debt, 0), v_net);
      perform private.post_ledger('release:' || al.id, 'earnings_release', al.currency, jsonb_build_array(
        jsonb_build_object('code', 'promoter_pending', 'owner', 'promoter', 'user', al.promoter_user_id, 'debit', v_net),
        jsonb_build_object('code', 'promoter_recovery', 'owner', 'promoter', 'user', al.promoter_user_id, 'credit', v_offset),
        jsonb_build_object('code', 'promoter_available', 'owner', 'promoter', 'user', al.promoter_user_id, 'credit', v_net - v_offset)), al.order_id);
    end if;
    update public.earnings_allocations set status = case when v_net > 0 then 'released' else 'reversed' end,
      released_at = now() where id = al.id;
    c := c + 1;
  end loop;
  return c;
end $$;

-- ===========================================================================
-- Payout recipients & payouts (organization and promoter beneficiaries)
-- ===========================================================================
create or replace function private.require_beneficiary(p_kind text, p_org uuid, p_roles public.org_role[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform private.fail('forbidden'); end if;
  if p_kind = 'organization' then
    if p_org is null or not private.has_org_role(p_org, p_roles) then perform private.fail('forbidden'); end if;
  elsif p_kind <> 'promoter' or p_org is not null then
    perform private.fail('forbidden');
  end if;
end $$;

create or replace function public.payout_recipient_set(
  p_kind text, p_org uuid, p_bank_code text, p_bank_name text, p_account_number text, p_account_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_beneficiary(p_kind, p_org, array['owner']::public.org_role[]);
  if not private.has_recent_auth(900) then perform private.fail('reauth_required'); end if;
  if p_account_number !~ '^[0-9]{10}$' then perform private.fail('invalid_account_number'); end if;
  update public.payout_recipients set status = 'disabled'
  where status <> 'disabled' and beneficiary_kind = p_kind
    and ((p_kind = 'organization' and organization_id = p_org) or (p_kind = 'promoter' and user_id = auth.uid()));
  insert into public.payout_recipients (beneficiary_kind, organization_id, user_id, bank_code, bank_name, account_name, account_last4, created_by)
  values (p_kind, case when p_kind = 'organization' then p_org end, case when p_kind = 'promoter' then auth.uid() end,
          p_bank_code, p_bank_name, trim(p_account_name), right(p_account_number, 4), auth.uid())
  returning id into v_id;
  insert into private.payout_recipient_secrets (recipient_id, account_number) values (v_id, p_account_number);
  insert into public.outbox_jobs (kind, payload, dedupe_key)
  values ('payout_recipient.verify', jsonb_build_object('recipient_id', v_id), 'payout_recipient.verify:' || v_id),
         ('payout_recipient.changed_notice', jsonb_build_object('recipient_id', v_id), 'payout_recipient.changed:' || v_id);
  perform private.audit('payout_recipient.set', 'payout_recipient', v_id::text, p_org, null,
    jsonb_build_object('bank_code', p_bank_code, 'last4', right(p_account_number, 4)));
  return v_id;
end $$;

create or replace function public.payout_recipient_secret(p_recipient uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  return (select account_number from private.payout_recipient_secrets where recipient_id = p_recipient);
end $$;

create or replace function public.payout_recipient_mark_verified(p_recipient uuid, p_recipient_code text, p_resolved_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or private.has_platform_role(array['finance_admin']::public.platform_role[])) then
    perform private.fail('forbidden');
  end if;
  update public.payout_recipients set status = 'verified', verified_at = now(), provider_recipient_code = p_recipient_code,
    account_name = coalesce(nullif(p_resolved_name, ''), account_name)
  where id = p_recipient and status = 'pending_verification';
  perform private.audit('payout_recipient.verified', 'payout_recipient', p_recipient::text);
end $$;

create or replace function private.beneficiary_codes(p_kind text, out avail text, out locked text) language sql immutable set search_path = '' as $$
  select case p_kind when 'organization' then 'org_available' else 'promoter_available' end,
         case p_kind when 'organization' then 'org_payout_locked' else 'promoter_locked' end;
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
    p_idempotency_key, auth.uid(), case when rec.provider_recipient_code is not null then 'paystack_transfer' else 'manual_bank' end)
  returning id into v_id;
  perform private.post_ledger('payout_lock:' || v_id, 'payout_lock', 'NGN', jsonb_build_array(
    jsonb_build_object('code', c.avail, 'owner', p_kind, 'org', p_org, 'user', v_user, 'debit', p_amount_minor),
    jsonb_build_object('code', c.locked, 'owner', p_kind, 'org', p_org, 'user', v_user, 'credit', p_amount_minor)), null, null, v_id);
  perform private.audit('payout.request', 'payout_request', v_id::text, p_org, null, jsonb_build_object('amount_minor', p_amount_minor));
  return v_id;
end $$;

-- Lifecycle: pending -> approved -> processing -> paid | failed ; paid -> reversed ; pending -> rejected | cancelled
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

-- Records Paystack settling funds to the platform's bank account (reconciliation).
create or replace function public.record_provider_settlement(p_amount_minor bigint, p_reference text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.has_platform_role(array['finance_admin']::public.platform_role[]) or coalesce(auth.role(), '') = 'service_role') then
    perform private.fail('forbidden');
  end if;
  if p_amount_minor <= 0 then perform private.fail('invalid_amount'); end if;
  perform private.post_ledger('settlement:' || p_reference, 'provider_settlement', 'NGN', jsonb_build_array(
    jsonb_build_object('code', 'bank', 'owner', 'platform', 'debit', p_amount_minor),
    jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'credit', p_amount_minor)), null, null, null, p_note);
  perform private.audit('finance.settlement', 'settlement', p_reference, null, p_note, jsonb_build_object('amount_minor', p_amount_minor));
end $$;

-- ===========================================================================
-- Referral programs
-- ===========================================================================
create or replace function public.referral_program_upsert(
  p_event uuid, p_rate_bps int, p_eligible_ticket_type_ids uuid[], p_window_days int, p_terms text,
  p_enrollment_mode text default 'approval', p_maturity_days int default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare ev public.events; prog public.referral_programs; v_ver uuid; v_n int; v_fee int; v_mat int;
begin
  select * into ev from public.events where id = p_event;
  if not private.has_org_role(ev.organization_id, array['owner', 'manager']::public.org_role[]) then perform private.fail('forbidden'); end if;
  if not private.org_is_active(ev.organization_id) then perform private.fail('organizer_suspended'); end if;
  if ev.status in ('cancelled', 'completed', 'archived') then perform private.fail('invalid_transition'); end if;
  if p_rate_bps < 1 or p_rate_bps > private.setting_int('max_promoter_rate_bps', 3000) then perform private.fail('rate_out_of_bounds'); end if;
  v_fee := coalesce((private.resolve_fee_policy(ev.id)).platform_fee_bps, 0);
  if p_rate_bps + v_fee > 9500 then perform private.fail('rate_exceeds_proceeds'); end if;
  if p_window_days < 1 or p_window_days > 60 then perform private.fail('invalid_window'); end if;
  if length(coalesce(p_terms, '')) < 20 then perform private.fail('terms_required'); end if;
  if p_eligible_ticket_type_ids is not null and exists (
       select 1 from unnest(p_eligible_ticket_type_ids) x where x not in (select id from public.ticket_types where event_id = ev.id)) then
    perform private.fail('invalid_ticket_type');
  end if;
  v_mat := greatest(coalesce(p_maturity_days, 0), private.setting_int('promoter_maturity_days', 7)::int);
  perform private.begin_internal();
  insert into public.referral_programs (event_id, organization_id, enrollment_mode)
  values (ev.id, ev.organization_id, p_enrollment_mode)
  on conflict (event_id) do update set enrollment_mode = excluded.enrollment_mode
  returning * into prog;
  select coalesce(max(version), 0) + 1 into v_n from public.referral_program_versions where program_id = prog.id;
  insert into public.referral_program_versions (program_id, version, rate_bps, eligible_ticket_type_ids, attribution_window_days,
    maturity_days_after_event, starts_at, ends_at, terms_text, created_by)
  values (prog.id, v_n, p_rate_bps, p_eligible_ticket_type_ids, p_window_days, v_mat, p_starts_at, p_ends_at, p_terms, auth.uid())
  returning id into v_ver;
  update public.referral_programs set current_version_id = v_ver where id = prog.id;
  perform private.audit('referral.program_version', 'referral_program', prog.id::text, ev.organization_id, null,
    jsonb_build_object('version', v_n, 'rate_bps', p_rate_bps));
  return prog.id;
end $$;

create or replace function public.referral_program_set_status(p_program uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare prog public.referral_programs;
begin
  select * into prog from public.referral_programs where id = p_program for update;
  if not (private.has_org_role(prog.organization_id, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  if p_status not in ('active', 'paused', 'closed') or prog.status = 'closed' then perform private.fail('invalid_transition'); end if;
  update public.referral_programs set status = p_status where id = p_program;
  perform private.audit('referral.program_status', 'referral_program', p_program::text, prog.organization_id, p_reason,
    jsonb_build_object('status', p_status));
end $$;

create or replace function public.promoter_apply(p_program uuid, p_version uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare prog public.referral_programs; v_id uuid; v_status text; en public.promoter_enrollments;
begin
  if auth.uid() is null then perform private.fail('forbidden'); end if;
  perform private.require_verified_email();
  select * into prog from public.referral_programs where id = p_program;
  if not found or prog.status <> 'active' then perform private.fail('program_not_active'); end if;
  if p_version <> prog.current_version_id then perform private.fail('terms_outdated'); end if;
  if private.is_org_member(prog.organization_id) then perform private.fail('self_referral_not_allowed'); end if;
  select * into en from public.promoter_enrollments where program_id = p_program and user_id = auth.uid() for update;
  if found then
    if en.status in ('rejected', 'suspended', 'revoked') then perform private.fail('enrollment_closed'); end if;
    -- accepting a newer version of the terms
    update public.promoter_enrollments set accepted_version_id = p_version, accepted_terms_at = now() where id = en.id;
    return en.id;
  end if;
  v_status := case when prog.enrollment_mode = 'open' then 'approved' else 'pending' end;
  insert into public.promoter_enrollments (program_id, user_id, status, accepted_version_id, application_note, decided_at)
  values (p_program, auth.uid(), v_status, p_version, p_note, case when v_status = 'approved' then now() end)
  returning id into v_id;
  if v_status = 'approved' then
    insert into public.referral_links (enrollment_id, event_id) values (v_id, prog.event_id);
  end if;
  return v_id;
end $$;

create or replace function public.promoter_decide(p_enrollment uuid, p_status text, p_reason text default null, p_rate_override_bps int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare en public.promoter_enrollments; prog public.referral_programs; v_admin boolean := private.is_platform_admin();
begin
  select * into en from public.promoter_enrollments where id = p_enrollment for update;
  select * into prog from public.referral_programs where id = en.program_id;
  if not (private.has_org_role(prog.organization_id, array['owner', 'manager']::public.org_role[]) or v_admin) then
    perform private.fail('forbidden');
  end if;
  if p_status not in ('approved', 'rejected', 'suspended', 'revoked') then perform private.fail('invalid_transition'); end if;
  if p_status <> 'approved' and length(coalesce(trim(p_reason), '')) < 3 then perform private.fail('reason_required'); end if;
  if p_rate_override_bps is not null and (p_rate_override_bps < 1 or p_rate_override_bps > private.setting_int('max_promoter_rate_bps', 3000)) then
    perform private.fail('rate_out_of_bounds');
  end if;
  update public.promoter_enrollments set status = p_status, decided_by = auth.uid(), decided_at = now(),
    decision_reason = p_reason, rate_override_bps = coalesce(p_rate_override_bps, rate_override_bps)
  where id = en.id;
  if p_status = 'approved' then
    insert into public.referral_links (enrollment_id, event_id)
    select en.id, prog.event_id where not exists (select 1 from public.referral_links where enrollment_id = en.id and disabled_at is null);
  else
    update public.referral_links set disabled_at = now() where enrollment_id = en.id and disabled_at is null;
  end if;
  perform private.audit('referral.enrollment_' || p_status, 'promoter_enrollment', en.id::text, prog.organization_id, p_reason,
    jsonb_build_object('rate_override_bps', p_rate_override_bps));
end $$;

-- Resolve /r/[code]: returns the destination and records an approximate visit.
create or replace function public.referral_resolve(p_code text, p_session_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform private.require_service();
  select l.id link_id, e.slug, e.id event_id, (en.status = 'approved' and p.status = 'active'
         and e.status = 'published' and e.visibility <> 'private') eligible
    into r
  from public.referral_links l
  join public.promoter_enrollments en on en.id = l.enrollment_id
  join public.referral_programs p on p.id = en.program_id
  join public.events e on e.id = l.event_id
  where l.code = lower(p_code) and l.disabled_at is null;
  if not found then return null; end if;
  if r.eligible then
    insert into public.referral_visits (link_id, session_hash) values (r.link_id, p_session_hash);
  end if;
  return jsonb_build_object('link_id', r.link_id, 'event_id', r.event_id, 'event_slug', r.slug, 'eligible', r.eligible);
end $$;

-- Promoter dashboard: own data only, buyer identity never exposed.
create or replace function public.promoter_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; uid uuid := auth.uid();
begin
  if uid is null then perform private.fail('forbidden'); end if;
  select jsonb_build_object(
    'balances', (select jsonb_build_object(
        'pending', coalesce(sum(balance_minor) filter (where code = 'promoter_pending'), 0),
        'available', coalesce(sum(balance_minor) filter (where code = 'promoter_available'), 0),
        'processing', coalesce(sum(balance_minor) filter (where code = 'promoter_locked'), 0),
        'recovery', coalesce(sum(balance_minor) filter (where code = 'promoter_recovery'), 0))
      from private.ledger_balances where owner_kind = 'promoter' and user_id = uid and currency = 'NGN'),
    'held_minor', (select coalesce(sum(amount_minor - reversed_minor), 0) from public.earnings_allocations
                   where promoter_user_id = uid and status = 'held'),
    'reversed_minor', (select coalesce(sum(reversed_minor), 0) from public.earnings_allocations where promoter_user_id = uid),
    'paid_out_minor', (select coalesce(sum(amount_minor), 0) from public.payout_requests where user_id = uid and status = 'paid'),
    'enrollments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', en.id, 'status', en.status, 'program_id', p.id, 'program_status', p.status,
        'event_title', e.title, 'event_slug', e.slug, 'event_starts_at', e.starts_at,
        'rate_bps', coalesce(en.rate_override_bps, v.rate_bps), 'accepted_version', v.version,
        'current_version_id', p.current_version_id, 'needs_terms', en.accepted_version_id <> p.current_version_id,
        'link_code', (select code from public.referral_links where enrollment_id = en.id and disabled_at is null),
        'visits', (select count(*) from public.referral_visits rv join public.referral_links l on l.id = rv.link_id where l.enrollment_id = en.id),
        'orders', (select count(*) from public.order_attributions oa join public.orders o on o.id = oa.order_id
                   where oa.enrollment_id = en.id and o.status in ('paid', 'partially_refunded', 'refunded')),
        'admissions', (select coalesce(sum(o.admissions), 0) from public.order_attributions oa join public.orders o on o.id = oa.order_id
                   where oa.enrollment_id = en.id and o.status in ('paid', 'partially_refunded')),
        'earned_minor', (select coalesce(sum(amount_minor - reversed_minor), 0) from public.earnings_allocations where enrollment_id = en.id)
      ) order by e.starts_at desc), '[]')
      from public.promoter_enrollments en
      join public.referral_programs p on p.id = en.program_id
      join public.events e on e.id = p.event_id
      join public.referral_program_versions v on v.id = en.accepted_version_id
      where en.user_id = uid),
    'commissions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'event_title', e.title, 'sale_ref', 'SALE-' || upper(left(md5(a.order_id::text), 6)),
        'base_minor', a.base_minor, 'rate_bps', a.rate_bps, 'amount_minor', a.amount_minor,
        'reversed_minor', a.reversed_minor, 'status', a.status, 'matures_at', a.matures_at, 'created_at', a.created_at)
        order by a.created_at desc), '[]')
      from (select * from public.earnings_allocations where promoter_user_id = uid order by created_at desc limit 200) a
      join public.orders o on o.id = a.order_id join public.events e on e.id = o.event_id),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'reference', reference, 'amount_minor', amount_minor,
        'status', status, 'created_at', created_at) order by created_at desc), '[]')
      from public.payout_requests where user_id = uid)
  ) into v;
  return v;
end $$;

-- ===========================================================================
-- Customer helpers
-- ===========================================================================
-- Links guest orders to the signed-in account only when the account's email is verified.
create or replace function public.link_my_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare v_email text; c int;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  perform private.begin_internal();
  update public.orders set buyer_user_id = auth.uid() where buyer_user_id is null and buyer_email = v_email;
  get diagnostics c = row_count;
  return c;
end $$;

-- ===========================================================================
-- Analytics (organizer-scoped, from real data)
-- ===========================================================================
create or replace function public.org_event_summary(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; v jsonb;
begin
  select * into ev from public.events where id = p_event;
  if not (private.has_org_role(ev.organization_id, array['owner', 'manager', 'finance']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  select jsonb_build_object(
    'views', (select coalesce(sum(views), 0) from public.event_view_counts where event_id = ev.id),
    'capacity', ev.capacity, 'admissions_sold', ev.admissions_sold, 'admissions_held', ev.admissions_held,
    'orders_paid', count(*) filter (where o.status in ('paid', 'partially_refunded', 'refunded')),
    'online_orders', count(*) filter (where o.status in ('paid', 'partially_refunded', 'refunded') and o.channel = 'online'),
    'gross_minor', coalesce(sum(o.subtotal_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded') and o.payment_method = 'paystack'), 0),
    'discount_minor', coalesce(sum(o.discount_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded') and o.payment_method = 'paystack'), 0),
    'platform_fee_minor', coalesce(sum(o.platform_fee_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded')), 0),
    'commission_minor', coalesce(sum(o.promoter_commission_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded')), 0),
    'organizer_net_minor', coalesce(sum(o.organizer_net_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded') and o.payment_method = 'paystack'), 0),
    'door_cash_minor', coalesce(sum(o.total_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded') and o.payment_method in ('cash', 'pos_external')), 0),
    'refunded_minor', (select coalesce(sum(amount_minor), 0) from public.refund_requests where order_id in
                        (select id from public.orders where event_id = ev.id) and status in ('processing', 'completed') and kind <> 'exception'),
    'checked_in', (select count(*) from public.tickets where event_id = ev.id and first_checked_in_at is not null and status = 'valid'),
    'valid_tickets', (select count(*) from public.tickets where event_id = ev.id and status = 'valid'),
    'by_ticket_type', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price_minor', t.price_minor,
        'quantity_total', t.quantity_total, 'units_sold', t.units_sold, 'units_held', t.units_held,
        'admissions_per_unit', t.admissions_per_unit,
        'checked_in', (select count(*) from public.tickets x where x.ticket_type_id = t.id and x.first_checked_in_at is not null)) order by t.sort_order), '[]')
      from public.ticket_types t where t.event_id = ev.id),
    'promo_codes', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'completed', redemptions_completed,
        'reserved', redemptions_reserved, 'max', max_redemptions)), '[]') from public.promotions where event_id = ev.id),
    'referrals', (select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', en.id, 'status', en.status,
        'promoter_name', coalesce(pr.full_name, 'Promoter'),
        'orders', (select count(*) from public.order_attributions oa join public.orders o2 on o2.id = oa.order_id
                   where oa.enrollment_id = en.id and o2.status in ('paid', 'partially_refunded', 'refunded')),
        'commission_minor', (select coalesce(sum(amount_minor - reversed_minor), 0) from public.earnings_allocations where enrollment_id = en.id))), '[]')
      from public.promoter_enrollments en join public.referral_programs p on p.id = en.program_id
      left join public.profiles pr on pr.id = en.user_id where p.event_id = ev.id)
  ) into v
  from public.orders o where o.event_id = ev.id;
  return v;
end $$;

create or replace function public.org_sales_series(p_org uuid, p_event uuid default null, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not (private.has_org_role(p_org, array['owner', 'manager', 'finance']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('day', d.d::date, 'orders', coalesce(s.orders, 0), 'admissions', coalesce(s.admissions, 0),
      'net_minor', coalesce(s.net, 0)) order by d.d), '[]') into v
  from generate_series(((now() at time zone 'Africa/Lagos')::date - (least(p_days, 365) - 1)), (now() at time zone 'Africa/Lagos')::date, interval '1 day') d(d)
  left join (
    select (paid_at at time zone 'Africa/Lagos')::date sale_day, count(*) orders, sum(admissions) admissions,
           sum(organizer_net_minor) filter (where payment_method = 'paystack') net
    from public.orders where organization_id = p_org and (p_event is null or event_id = p_event)
      and status in ('paid', 'partially_refunded', 'refunded') and paid_at > now() - make_interval(days => least(p_days, 365))
    group by 1) s on s.sale_day = d.d::date;
  return v;
end $$;

create or replace function public.org_balances(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not (private.has_org_role(p_org, array['owner', 'finance']::public.org_role[]) or private.is_platform_admin()) then
    perform private.fail('forbidden');
  end if;
  select jsonb_build_object('currency', 'NGN',
    'pending_minor', coalesce(sum(balance_minor) filter (where code = 'org_pending'), 0),
    'available_minor', coalesce(sum(balance_minor) filter (where code = 'org_available'), 0),
    'processing_minor', coalesce(sum(balance_minor) filter (where code = 'org_payout_locked'), 0),
    'held_minor', (select coalesce(sum(amount_minor - reversed_minor), 0) from public.earnings_allocations
                   where organization_id = p_org and beneficiary_kind = 'organization' and status = 'held'),
    'paid_out_minor', (select coalesce(sum(amount_minor), 0) from public.payout_requests where organization_id = p_org and status = 'paid'))
  into v from private.ledger_balances where owner_kind = 'organization' and organization_id = p_org and currency = 'NGN';
  return v;
end $$;

-- ===========================================================================
-- Platform administration
-- ===========================================================================
create or replace function public.admin_update_organization(p_org uuid, p_changes jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.organizations;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  if length(coalesce(trim(p_reason), '')) < 3 then perform private.fail('reason_required'); end if;
  select * into o from public.organizations where id = p_org for update;
  perform private.begin_internal();
  update public.organizations set
    approval_status = coalesce((p_changes ->> 'approval_status')::public.org_approval_status, approval_status),
    verification_status = coalesce((p_changes ->> 'verification_status')::public.org_verification_status, verification_status),
    payout_status = coalesce((p_changes ->> 'payout_status')::public.org_payout_status, payout_status),
    status = coalesce((p_changes ->> 'status')::public.org_status, status),
    status_reason = case when p_changes ? 'status' then p_reason else status_reason end
  where id = p_org;
  -- Suspension stops new activity: events leave discovery and checkout via org status checks.
  -- Existing tickets, orders and financial records are untouched.
  perform private.audit('organization.admin_update', 'organization', p_org::text, p_org, p_reason, p_changes);
end $$;

create or replace function public.admin_set_fee_policy(
  p_scope text, p_org uuid, p_event uuid, p_platform_fee_bps int, p_platform_fixed_minor bigint,
  p_buyer_fee_bps int, p_buyer_fixed_minor bigint, p_refundable boolean, p_effective_from timestamptz, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_platform_role(array['finance_admin']::public.platform_role[]) then perform private.fail('forbidden'); end if;
  if p_effective_from < now() - interval '1 minute' then perform private.fail('effective_date_in_past'); end if;
  insert into public.fee_policies (scope, organization_id, event_id, platform_fee_bps, platform_fixed_minor, buyer_fee_bps,
    buyer_fixed_minor, platform_fee_refundable, effective_from, note, created_by)
  values (p_scope, case when p_scope = 'organization' then p_org end, case when p_scope = 'event' then p_event end,
    p_platform_fee_bps, coalesce(p_platform_fixed_minor, 0), coalesce(p_buyer_fee_bps, 0), coalesce(p_buyer_fixed_minor, 0),
    coalesce(p_refundable, true), coalesce(p_effective_from, now()), p_note, auth.uid())
  returning id into v_id;
  perform private.audit('fee_policy.create', 'fee_policy', v_id::text, p_org, p_note,
    jsonb_build_object('scope', p_scope, 'platform_fee_bps', p_platform_fee_bps, 'event_id', p_event));
  return v_id;
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
  update public.platform_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform private.audit('settings.update', 'platform_setting', p_key, null, p_reason, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

create or replace function public.admin_retry_job(p_job bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  update public.outbox_jobs set status = 'pending', attempts = 0, run_after = now(), last_error = null where id = p_job and status = 'dead';
  if not found then perform private.fail('invalid_transition'); end if;
  perform private.audit('job.retry', 'outbox_job', p_job::text);
end $$;

create or replace function public.admin_overview(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  select jsonb_build_object('currency', 'NGN', 'from', p_from, 'to', p_to,
    'orders_paid', (select count(*) from public.orders where paid_at between p_from and p_to and status in ('paid', 'partially_refunded', 'refunded')),
    'gross_collected_minor', (select coalesce(sum(total_minor), 0) from public.orders where paid_at between p_from and p_to
                              and payment_method = 'paystack' and status in ('paid', 'partially_refunded', 'refunded')),
    'platform_fee_minor', (select coalesce(sum(platform_fee_minor + buyer_fee_minor), 0) from public.orders where paid_at between p_from and p_to
                           and status in ('paid', 'partially_refunded', 'refunded')),
    'refunds_minor', (select coalesce(sum(amount_minor), 0) from public.refund_requests where created_at between p_from and p_to and status in ('processing', 'completed')),
    'open_refund_requests', (select count(*) from public.refund_requests where status in ('requested', 'failed')),
    'open_disputes', (select count(*) from public.disputes where status in ('open', 'awaiting_response')),
    'payout_queue', (select count(*) from public.payout_requests where status in ('pending', 'approved', 'processing')),
    'dead_jobs', (select count(*) from public.outbox_jobs where status = 'dead'),
    'fulfillment_exceptions', (select count(*) from public.orders where status = 'fulfillment_exception'),
    'payment_mismatches', (select count(*) from public.payment_attempts where status = 'mismatch'),
    'pending_events', (select count(*) from public.events where status = 'pending_review'),
    'pending_organizations', (select count(*) from public.organizations where approval_status = 'pending'),
    'open_referral_flags', (select count(*) from public.referral_flags where status = 'open'),
    'balances', (select coalesce(jsonb_object_agg(k, b), '{}') from (
        select code || ':' || owner_kind k, sum(balance_minor) b from private.ledger_balances where currency = 'NGN' group by 1) x)
  ) into v;
  return v;
end $$;

-- Ledger view for admins (with account labels).
create or replace function public.admin_ledger(p_order uuid default null, p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  select coalesce(jsonb_agg(r order by r.created_at desc), '[]') into v from (
    select t.id, t.kind, t.idempotency_key, t.order_id, t.created_at,
      (select jsonb_agg(jsonb_build_object('code', a.code, 'owner', a.owner_kind, 'organization_id', a.organization_id,
              'user_id', a.user_id, 'debit', e.debit_minor, 'credit', e.credit_minor) order by e.id)
       from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id where e.transaction_id = t.id) entries
    from public.ledger_transactions t where p_order is null or t.order_id = p_order
    order by t.created_at desc limit p_limit) r;
  return v;
end $$;

-- Reconciliation snapshot: ledger vs operational records.
create or replace function public.run_reconciliation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or private.is_platform_admin()) then perform private.fail('forbidden'); end if;
  select jsonb_build_object(
    'stale_payment_attempts', (select coalesce(jsonb_agg(reference), '[]') from public.payment_attempts
       where status = 'initialized' and created_at < now() - interval '20 minutes' and created_at > now() - interval '2 days'),
    'paid_orders_without_ledger', (select coalesce(jsonb_agg(o.id), '[]') from public.orders o where o.payment_method = 'paystack'
       and o.status in ('paid', 'partially_refunded', 'refunded')
       and not exists (select 1 from public.ledger_transactions t where t.idempotency_key = 'sale:' || o.id)),
    'paid_orders_ticket_mismatch', (select coalesce(jsonb_agg(o.id), '[]') from public.orders o where o.status = 'paid'
       and (select count(*) from public.tickets t where t.order_id = o.id) <> o.admissions),
    'refunds_stuck', (select coalesce(jsonb_agg(id), '[]') from public.refund_requests where status in ('processing', 'failed')
       and created_at < now() - interval '2 days'),
    'payouts_processing', (select coalesce(jsonb_agg(reference), '[]') from public.payout_requests where status = 'processing'
       and updated_at < now() - interval '1 day'),
    'unallocated_receipts_minor', (select coalesce(sum(balance_minor), 0) from private.ledger_balances where code = 'unallocated_receipts'),
    'promoter_recovery_minor', (select coalesce(sum(balance_minor), 0) from private.ledger_balances where code = 'promoter_recovery' and owner_kind = 'promoter'),
    'negative_org_available', (select coalesce(jsonb_agg(jsonb_build_object('organization_id', organization_id, 'balance_minor', balance_minor)), '[]')
       from private.ledger_balances where code = 'org_available' and balance_minor < 0),
    'checked_at', now()) into v;
  return v;
end $$;

-- Scheduler entry point (called every minute by the worker/cron).
create or replace function public.run_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_exp int; v_rel int; v_comp int; r text;
begin
  perform private.require_service();
  v_exp := public.expire_holds(500);
  v_rel := public.release_matured_earnings(500);
  v_comp := public.complete_past_events();
  -- queue provider verification for stale attempts (reconciliation)
  for r in select reference from public.payment_attempts where status = 'initialized'
           and created_at < now() - interval '15 minutes' and created_at > now() - interval '2 days' loop
    insert into public.outbox_jobs (kind, payload, dedupe_key, run_after)
    values ('payment.reconcile', jsonb_build_object('reference', r), 'payment.reconcile:' || r || ':' || to_char(now(), 'YYYYMMDDHH24'), now())
    on conflict do nothing;
  end loop;
  delete from private.rate_limits where window_start < now() - interval '1 day';
  delete from public.referral_visits where visited_at < now() - interval '90 days';
  return jsonb_build_object('expired_holds', v_exp, 'released_allocations', v_rel, 'completed_events', v_comp);
end $$;
