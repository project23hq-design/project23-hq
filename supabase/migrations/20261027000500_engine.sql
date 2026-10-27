-- Checkout engine: quoting, holds, fulfillment, payment confirmation, expiry,
-- gate admission, door sales, complimentary issue, durable jobs.
-- All functions: SECURITY DEFINER + empty search_path + explicit authorization.

alter table public.refund_requests
  add column kind text not null default 'standard' check (kind in ('standard', 'exception', 'dispute')),
  add column payment_attempt_id uuid references public.payment_attempts(id);
drop index public.refund_requests_one_open;
create unique index refund_requests_one_open on public.refund_requests(order_id)
  where status in ('requested', 'approved', 'processing') and kind = 'standard';

create or replace function private.fail(p_code text, p_detail text default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using message = p_code, detail = coalesce(p_detail, ''), errcode = 'P0001';
end $$;

-- Round-half-up basis-point application on non-negative minor units.
create or replace function private.apply_bps(p_amount bigint, p_bps int) returns bigint
language sql immutable set search_path = '' as $$
  select (p_amount * p_bps + 5000) / 10000;
$$;

create or replace function private.require_service() returns void
language plpgsql stable set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    perform private.fail('forbidden');
  end if;
end $$;

-- A dependent ticket type opens when its predecessor is sold out (counting holds)
-- or its sales window has closed.
create or replace function private.ticket_dependency_open(p_dep uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (t.units_sold + t.units_held >= t.quantity_total)
        or (t.sales_end_at is not null and t.sales_end_at <= now())
        or not t.is_active
    from public.ticket_types t where t.id = p_dep), true);
$$;

-- ---------------------------------------------------------------------------
-- build_order: validates everything server-side, snapshots economics, holds inventory.
-- ---------------------------------------------------------------------------
create or replace function private.build_order(
  p_event uuid, p_items jsonb, p_buyer jsonb, p_promo_code text, p_referral jsonb,
  p_idempotency_key text, p_answers jsonb, p_channel text, p_method public.payment_method, p_staff uuid
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; org public.organizations; tt public.ticket_types; promo public.promotions;
  fp public.fee_policies; ord public.orders;
  req record; n int := 0; i int;
  a_tt uuid[] := '{}'; a_name text[] := '{}'; a_kind public.ticket_kind[] := '{}';
  a_price bigint[] := '{}'; a_qty int[] := '{}'; a_apu int[] := '{}'; a_line bigint[] := '{}';
  a_disc bigint[] := '{}'; a_fee bigint[] := '{}'; a_comm bigint[] := '{}';
  v_qty int; v_subtotal bigint := 0; v_discount bigint := 0; v_buyer_fee bigint := 0;
  v_fee_total bigint := 0; v_comm_total bigint := 0; v_admissions int := 0; v_total bigint;
  v_net bigint; v_eligible_sum bigint := 0; v_alloc bigint; v_rem bigint;
  v_promo_eligible boolean[] := '{}';
  v_buyer_email text := lower(trim(p_buyer ->> 'email'));
  v_buyer_user uuid := nullif(p_buyer ->> 'user_id', '')::uuid;
  v_attr record; v_rate int := 0; v_self boolean; v_attr_ok boolean := false;
  v_apply_fee boolean;
  v_method public.payment_method := p_method;
  v_snapshot jsonb;
begin
  perform private.begin_internal();

  select * into ord from public.orders where idempotency_key = p_idempotency_key;
  if found then return ord; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 10 then
    perform private.fail('invalid_items');
  end if;

  select * into ev from public.events where id = p_event for update;
  if not found then perform private.fail('event_not_found'); end if;
  select * into org from public.organizations where id = ev.organization_id;
  if org.status <> 'active' then perform private.fail('organizer_suspended'); end if;
  if ev.status <> 'published' or ev.moderation_status <> 'approved' then perform private.fail('event_not_on_sale'); end if;
  if p_channel = 'online' and ev.visibility = 'private' then perform private.fail('event_not_on_sale'); end if;
  if now() >= ev.ends_at then perform private.fail('event_ended'); end if;
  if not exists (select 1 from public.currencies where code = ev.currency and checkout_enabled) then
    perform private.fail('currency_not_supported');
  end if;

  -- Normalize: merge duplicate lines, lock ticket types in a consistent order (deadlock-safe).
  for req in
    select (x.value ->> 'ticket_type_id')::uuid tid, sum((x.value ->> 'quantity')::int) qty, max(x.value ->> 'access_code') code
    from jsonb_array_elements(p_items) as x(value) group by 1 order by 1
  loop
    select * into tt from public.ticket_types where id = req.tid for update;
    if not found or tt.event_id <> ev.id then perform private.fail('invalid_ticket_type'); end if;
    v_qty := req.qty;
    if v_qty is null or v_qty < 1 or v_qty > 100 then perform private.fail('invalid_quantity'); end if;
    if not tt.is_active then perform private.fail('ticket_unavailable', tt.name); end if;

    if p_channel = 'online' then
      if tt.visibility = 'hidden' or tt.kind = 'complimentary' then perform private.fail('ticket_unavailable', tt.name); end if;
      if tt.visibility = 'access_code' and (req.code is null or
         encode(extensions.digest(upper(trim(req.code)), 'sha256'), 'hex') <> tt.access_code_hash) then
        perform private.fail('invalid_access_code', tt.name);
      end if;
      if tt.sales_start_at is not null and tt.sales_start_at > now() then perform private.fail('sales_not_started', tt.name); end if;
      if tt.sales_end_at is not null and tt.sales_end_at <= now() then perform private.fail('sales_ended', tt.name); end if;
      if tt.opens_after_ticket_type_id is not null and not private.ticket_dependency_open(tt.opens_after_ticket_type_id) then
        perform private.fail('sales_not_started', tt.name);
      end if;
      if v_qty < tt.min_per_order or v_qty > tt.max_per_order then perform private.fail('invalid_quantity', tt.name); end if;
    elsif p_channel = 'door' and tt.kind = 'complimentary' then
      perform private.fail('ticket_unavailable', tt.name);
    end if;

    if tt.quantity_total - tt.units_sold - tt.units_held < v_qty then
      perform private.fail('insufficient_inventory', tt.name);
    end if;

    n := n + 1;
    a_tt := a_tt || tt.id; a_name := a_name || tt.name; a_kind := a_kind || tt.kind;
    a_price := a_price || (case when p_method = 'complimentary' then 0 else tt.price_minor end);
    a_qty := a_qty || v_qty; a_apu := a_apu || tt.admissions_per_unit;
    a_line := a_line || (a_price[n] * v_qty);
    a_disc := a_disc || 0::bigint; a_fee := a_fee || 0::bigint; a_comm := a_comm || 0::bigint;
    v_promo_eligible := v_promo_eligible || false;
    v_subtotal := v_subtotal + a_line[n];
    v_admissions := v_admissions + v_qty * tt.admissions_per_unit;
  end loop;

  -- Aggregate admission capacity across all ticket types (tables count every seat).
  if ev.admissions_sold + ev.admissions_held + v_admissions > ev.capacity then
    perform private.fail('event_sold_out');
  end if;

  -- Promo codes (online only). Cap counts active reservations + completed redemptions.
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    if p_channel <> 'online' then perform private.fail('invalid_promo_code'); end if;
    select * into promo from public.promotions
    where event_id = ev.id and code = upper(trim(p_promo_code)) for update;
    if not found or not promo.is_active or (promo.starts_at is not null and promo.starts_at > now())
       or (promo.ends_at is not null and promo.ends_at <= now()) then
      perform private.fail('invalid_promo_code');
    end if;
    if promo.max_redemptions is not null
       and promo.redemptions_reserved + promo.redemptions_completed >= promo.max_redemptions then
      perform private.fail('promo_exhausted');
    end if;
    for i in 1 .. n loop
      if a_line[i] > 0 and (promo.ticket_type_ids is null or a_tt[i] = any(promo.ticket_type_ids)) then
        v_promo_eligible[i] := true; v_eligible_sum := v_eligible_sum + a_line[i];
      end if;
    end loop;
    if v_eligible_sum = 0 then perform private.fail('promo_not_applicable'); end if;
    if promo.discount_type = 'percent' then
      for i in 1 .. n loop
        if v_promo_eligible[i] then a_disc[i] := least(a_line[i], private.apply_bps(a_line[i], promo.percent_bps)); end if;
      end loop;
    else
      v_alloc := least(promo.amount_minor, v_eligible_sum);  -- never discount below zero
      v_rem := v_alloc;
      for i in 1 .. n loop
        if v_promo_eligible[i] then
          a_disc[i] := (v_alloc * a_line[i]) / v_eligible_sum; v_rem := v_rem - a_disc[i];
        end if;
      end loop;
      i := 1;
      while v_rem > 0 loop  -- distribute rounding remainder one kobo at a time, in line order
        if v_promo_eligible[i] and a_disc[i] < a_line[i] then a_disc[i] := a_disc[i] + 1; v_rem := v_rem - 1; end if;
        i := (i % n) + 1;
      end loop;
    end if;
    for i in 1 .. n loop v_discount := v_discount + a_disc[i]; end loop;
  end if;

  -- Fee policy snapshot.
  fp := private.resolve_fee_policy(ev.id);
  if fp.id is null then perform private.fail('fee_policy_missing'); end if;
  if private.setting_text('processor_fee_bearer', 'platform') <> 'platform' then
    perform private.fail('unsupported_fee_configuration');
  end if;
  v_apply_fee := p_method in ('paystack', 'free') or
                 (p_method in ('cash', 'pos_external') and private.setting_text('door_sales_platform_fee', 'true') = 'true');
  for i in 1 .. n loop
    v_net := a_line[i] - a_disc[i];
    if v_apply_fee and v_net > 0 then
      a_fee[i] := least(v_net, private.apply_bps(v_net, fp.platform_fee_bps) + fp.platform_fixed_minor * a_qty[i] * a_apu[i]);
    end if;
    v_fee_total := v_fee_total + a_fee[i];
  end loop;
  if p_channel = 'online' and v_subtotal - v_discount > 0 then
    v_buyer_fee := private.apply_bps(v_subtotal - v_discount, fp.buyer_fee_bps) + fp.buyer_fixed_minor;
  end if;

  -- Referral attribution (online, server-verified link reference only).
  if p_channel = 'online' and p_referral is not null and p_referral ->> 'link_id' is not null then
    select l.id link_id, en.id enrollment_id, en.user_id promoter_id, en.rate_override_bps,
           v.id version_id, v.rate_bps, v.eligible_ticket_type_ids, v.attribution_window_days,
           v.maturity_days_after_event, v.starts_at vs, v.ends_at ve
      into v_attr
    from public.referral_links l
    join public.promoter_enrollments en on en.id = l.enrollment_id
    join public.referral_programs p on p.id = en.program_id
    join public.referral_program_versions v on v.id = en.accepted_version_id
    where l.id = (p_referral ->> 'link_id')::uuid and l.disabled_at is null and l.event_id = ev.id
      and p.event_id = ev.id and p.status = 'active' and en.status = 'approved'
      and (v.starts_at is null or v.starts_at <= now()) and (v.ends_at is null or v.ends_at > now())
      and (p_referral ->> 'clicked_at')::timestamptz between now() - make_interval(days => v.attribution_window_days) and now();
    if found then
      v_self := v_attr.promoter_id = v_buyer_user
             or exists (select 1 from auth.users u where u.id = v_attr.promoter_id and lower(u.email) = v_buyer_email)
             or exists (select 1 from public.memberships m where m.organization_id = ev.organization_id and m.user_id = v_attr.promoter_id);
      if v_self then
        insert into public.referral_flags (enrollment_id, kind, details)
        values (v_attr.enrollment_id, 'self_referral_blocked', jsonb_build_object('event_id', ev.id));
      else
        v_attr_ok := true;
        v_rate := coalesce(v_attr.rate_override_bps, v_attr.rate_bps);
        for i in 1 .. n loop
          v_net := a_line[i] - a_disc[i];
          if v_net > 0 and a_kind[i] not in ('free', 'complimentary')
             and (v_attr.eligible_ticket_type_ids is null or a_tt[i] = any(v_attr.eligible_ticket_type_ids)) then
            -- organizer funds commission; never allow organizer net to go negative
            a_comm[i] := least(private.apply_bps(v_net, v_rate), v_net - a_fee[i]);
            v_comm_total := v_comm_total + a_comm[i];
          end if;
        end loop;
      end if;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_buyer_fee;
  if p_channel = 'online' then
    v_method := case when v_total = 0 then 'free'::public.payment_method else 'paystack'::public.payment_method end;
  end if;

  v_snapshot := jsonb_build_object(
    'policy_id', fp.id, 'scope', fp.scope, 'platform_fee_bps', fp.platform_fee_bps,
    'platform_fixed_minor', fp.platform_fixed_minor, 'buyer_fee_bps', fp.buyer_fee_bps,
    'buyer_fixed_minor', fp.buyer_fixed_minor, 'platform_fee_refundable', fp.platform_fee_refundable,
    'fee_applied', v_apply_fee, 'processor_fee_bearer', 'platform', 'rounding', 'half_up_per_line',
    'promoter_rate_bps', case when v_attr_ok then v_rate end,
    'organizer_hold_days', private.setting_int('organizer_hold_days', 3));

  insert into public.orders (
    event_id, organization_id, buyer_user_id, buyer_name, buyer_email, buyer_phone, channel, payment_method,
    status, currency, subtotal_minor, discount_minor, buyer_fee_minor, total_minor, platform_fee_minor,
    promoter_commission_minor, organizer_net_minor, fee_policy_id, fee_snapshot, promotion_id, promo_code,
    admissions, answers, idempotency_key, hold_expires_at, door_staff_id, cash_collected_by)
  values (
    ev.id, ev.organization_id, v_buyer_user, trim(p_buyer ->> 'name'), v_buyer_email,
    nullif(trim(p_buyer ->> 'phone'), ''), p_channel, v_method, 'pending_payment', ev.currency,
    v_subtotal, v_discount, v_buyer_fee, v_total, v_fee_total, v_comm_total,
    v_subtotal - v_discount - v_fee_total - v_comm_total, fp.id, v_snapshot, promo.id,
    case when promo.id is not null then promo.code end, v_admissions, coalesce(p_answers, '{}'),
    p_idempotency_key, now() + make_interval(mins => private.setting_int('checkout_hold_minutes', 10)::int),
    p_staff, case when p_method = 'cash' then 'organizer' end)
  returning * into ord;

  for i in 1 .. n loop
    insert into public.order_items (order_id, ticket_type_id, ticket_type_name, ticket_kind, unit_price_minor,
      quantity, admissions_per_unit, line_subtotal_minor, discount_minor, line_net_minor, platform_fee_minor,
      commission_minor, organizer_net_minor)
    values (ord.id, a_tt[i], a_name[i], a_kind[i], a_price[i], a_qty[i], a_apu[i], a_line[i], a_disc[i],
      a_line[i] - a_disc[i], a_fee[i], a_comm[i], a_line[i] - a_disc[i] - a_fee[i] - a_comm[i]);
    update public.ticket_types set units_held = units_held + a_qty[i] where id = a_tt[i];
  end loop;
  update public.events set admissions_held = admissions_held + v_admissions where id = ev.id;
  if promo.id is not null then
    update public.promotions set redemptions_reserved = redemptions_reserved + 1 where id = promo.id;
  end if;

  if v_attr_ok then
    insert into public.order_attributions (order_id, link_id, enrollment_id, promoter_user_id, program_version_id,
      rate_bps, eligible_ticket_type_ids, attribution_window_days, maturity_days_after_event, clicked_at)
    values (ord.id, v_attr.link_id, v_attr.enrollment_id, v_attr.promoter_id, v_attr.version_id, v_rate,
      v_attr.eligible_ticket_type_ids, v_attr.attribution_window_days, v_attr.maturity_days_after_event,
      (p_referral ->> 'clicked_at')::timestamptz);
    -- Heuristic review flag (not an automated penalty): many attributed orders from one buyer.
    if (select count(*) from public.order_attributions oa join public.orders o on o.id = oa.order_id
        where oa.enrollment_id = v_attr.enrollment_id and o.buyer_email = v_buyer_email
          and o.created_at > now() - interval '24 hours') >= 3 then
      insert into public.referral_flags (order_id, enrollment_id, kind, details)
      values (ord.id, v_attr.enrollment_id, 'repeat_buyer_pattern', '{}');
    end if;
  end if;

  return ord;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory release for an unpaid order (expiry / cancellation).
-- ---------------------------------------------------------------------------
create or replace function private.release_order_hold(p_order uuid, p_status public.order_status)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ord public.orders; it record;
begin
  perform private.begin_internal();
  select * into ord from public.orders where id = p_order for update;
  if ord.status <> 'pending_payment' then return false; end if;
  perform 1 from public.events where id = ord.event_id for update;
  for it in select ticket_type_id, quantity from public.order_items where order_id = ord.id order by ticket_type_id loop
    update public.ticket_types set units_held = units_held - it.quantity where id = it.ticket_type_id;
  end loop;
  update public.events set admissions_held = admissions_held - ord.admissions where id = ord.event_id;
  if ord.promotion_id is not null then
    update public.promotions set redemptions_reserved = redemptions_reserved - 1 where id = ord.promotion_id;
  end if;
  update public.orders set status = p_status, expired_at = now() where id = ord.id;
  return true;
end $$;

create or replace function public.expire_holds(p_limit int default 500) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; c int := 0;
begin
  perform private.require_service();
  for r in select id from public.orders where status = 'pending_payment' and hold_expires_at < now()
           order by hold_expires_at limit p_limit for update skip locked loop
    if private.release_order_hold(r.id, 'expired') then c := c + 1; end if;
  end loop;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- fulfill_order: the single idempotent fulfillment path (webhook, return-page
-- verification, reconciliation, free orders, door sales and comps all converge here).
-- ---------------------------------------------------------------------------
create or replace function private.fulfill_order(p_order uuid, p_source text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  ord public.orders; ev public.events; it record; tt public.ticket_types; promo public.promotions;
  v_late boolean; v_ok boolean := true; v_reason text; u int; a int;
  v_lines jsonb := '[]'; v_org_hold int; v_matures timestamptz; attr public.order_attributions;
  v_refund uuid; v_attempt uuid; v_promoter_mat int;
begin
  perform private.begin_internal();
  select * into ord from public.orders where id = p_order for update;
  if not found then perform private.fail('order_not_found'); end if;
  if ord.status in ('paid', 'partially_refunded', 'refunded') then return 'already_fulfilled'; end if;
  if ord.status = 'fulfillment_exception' then return 'exception'; end if;

  select * into ev from public.events where id = ord.event_id for update;
  v_late := ord.status in ('expired', 'cancelled');

  if not v_late and (ev.status <> 'published' or now() >= ev.ends_at) and ord.channel = 'online' then
    perform private.release_order_hold(ord.id, 'expired');
    select * into ord from public.orders where id = p_order;
    v_late := true;
  end if;

  if v_late then
    -- Late payment: try to re-acquire inventory atomically; never oversell.
    if ev.status <> 'published' or now() >= ev.ends_at then v_ok := false; v_reason := 'event_not_on_sale';
    elsif ev.admissions_sold + ev.admissions_held + ord.admissions > ev.capacity then v_ok := false; v_reason := 'event_sold_out';
    end if;
    if v_ok then
      for it in select ticket_type_id, quantity from public.order_items where order_id = ord.id order by ticket_type_id loop
        select * into tt from public.ticket_types where id = it.ticket_type_id for update;
        if tt.quantity_total - tt.units_sold - tt.units_held < it.quantity then v_ok := false; v_reason := 'insufficient_inventory'; end if;
      end loop;
    end if;
    if v_ok and ord.promotion_id is not null then
      select * into promo from public.promotions where id = ord.promotion_id for update;
      if promo.max_redemptions is not null and promo.redemptions_reserved + promo.redemptions_completed >= promo.max_redemptions then
        v_ok := false; v_reason := 'promo_exhausted';
      end if;
    end if;

    if not v_ok then
      update public.orders set status = 'fulfillment_exception', exception_reason = v_reason where id = ord.id;
      if ord.total_minor > 0 and p_source = 'paystack' then
        perform private.post_ledger('exception:' || ord.id, 'payment_exception', ord.currency, jsonb_build_array(
          jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'debit', ord.total_minor),
          jsonb_build_object('code', 'unallocated_receipts', 'owner', 'platform', 'credit', ord.total_minor)), ord.id);
        select id into v_attempt from public.payment_attempts where order_id = ord.id and status = 'success';
        insert into public.refund_requests (order_id, organization_id, requester_kind, reason, status, amount_minor, kind, payment_attempt_id)
        values (ord.id, ord.organization_id, 'system', 'Payment received after tickets became unavailable: ' || v_reason,
                'processing', ord.total_minor, 'exception', v_attempt)
        returning id into v_refund;
        insert into public.outbox_jobs (kind, payload, dedupe_key) values
          ('refund.process', jsonb_build_object('refund_id', v_refund), 'refund.process:' || v_refund),
          ('order.exception_notice', jsonb_build_object('order_id', ord.id), 'order.exception_notice:' || ord.id);
      end if;
      perform private.audit('order.fulfillment_exception', 'order', ord.id::text, ord.organization_id, v_reason);
      return 'exception';
    end if;

    for it in select ticket_type_id, quantity from public.order_items where order_id = ord.id order by ticket_type_id loop
      update public.ticket_types set units_sold = units_sold + it.quantity where id = it.ticket_type_id;
    end loop;
    update public.events set admissions_sold = admissions_sold + ord.admissions where id = ev.id;
    if ord.promotion_id is not null then
      update public.promotions set redemptions_completed = redemptions_completed + 1 where id = ord.promotion_id;
    end if;
  else
    for it in select ticket_type_id, quantity from public.order_items where order_id = ord.id order by ticket_type_id loop
      update public.ticket_types set units_held = units_held - it.quantity, units_sold = units_sold + it.quantity
      where id = it.ticket_type_id;
    end loop;
    update public.events set admissions_held = admissions_held - ord.admissions,
      admissions_sold = admissions_sold + ord.admissions where id = ev.id;
    if ord.promotion_id is not null then
      update public.promotions set redemptions_reserved = redemptions_reserved - 1,
        redemptions_completed = redemptions_completed + 1 where id = ord.promotion_id;
    end if;
  end if;

  -- One ticket per admission (a 10-seat table unit yields 10 independently scannable tickets).
  for it in select * from public.order_items where order_id = ord.id loop
    for u in 1 .. it.quantity loop
      for a in 1 .. it.admissions_per_unit loop
        insert into public.tickets (order_id, order_item_id, event_id, ticket_type_id, unit_number, admission_number,
          attendee_name, attendee_email)
        values (ord.id, it.id, ord.event_id, it.ticket_type_id, u, a,
          case when u = 1 and a = 1 then ord.buyer_name end, case when u = 1 and a = 1 then ord.buyer_email end)
        on conflict (order_item_id, unit_number, admission_number) do nothing;
      end loop;
    end loop;
  end loop;

  select * into attr from public.order_attributions where order_id = ord.id;
  v_org_hold := coalesce((ord.fee_snapshot ->> 'organizer_hold_days')::int, private.setting_int('organizer_hold_days', 3)::int);
  v_promoter_mat := greatest(coalesce(attr.maturity_days_after_event, 0), private.setting_int('promoter_maturity_days', 7)::int);

  if ord.payment_method = 'paystack' then
    v_lines := jsonb_build_array(
      jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'debit', ord.total_minor),
      jsonb_build_object('code', 'platform_revenue', 'owner', 'platform', 'credit', ord.platform_fee_minor),
      jsonb_build_object('code', 'buyer_fee_revenue', 'owner', 'platform', 'credit', ord.buyer_fee_minor),
      jsonb_build_object('code', 'org_pending', 'owner', 'organization', 'org', ord.organization_id, 'credit', ord.organizer_net_minor));
    if attr.order_id is not null and ord.promoter_commission_minor > 0 then
      v_lines := v_lines || jsonb_build_object('code', 'promoter_pending', 'owner', 'promoter',
        'user', attr.promoter_user_id, 'credit', ord.promoter_commission_minor);
    end if;
    perform private.post_ledger('sale:' || ord.id, 'sale', ord.currency, v_lines, ord.id);

    for it in select * from public.order_items where order_id = ord.id loop
      if it.organizer_net_minor > 0 then
        insert into public.earnings_allocations (order_id, order_item_id, beneficiary_kind, organization_id, currency,
          base_minor, amount_minor, matures_at)
        values (ord.id, it.id, 'organization', ord.organization_id, ord.currency, it.line_net_minor,
          it.organizer_net_minor, ev.ends_at + make_interval(days => v_org_hold))
        on conflict (order_item_id, beneficiary_kind) do nothing;
      end if;
      if it.commission_minor > 0 and attr.order_id is not null then
        insert into public.earnings_allocations (order_id, order_item_id, beneficiary_kind, organization_id,
          promoter_user_id, enrollment_id, currency, base_minor, rate_bps, amount_minor, matures_at)
        values (ord.id, it.id, 'promoter', ord.organization_id, attr.promoter_user_id, attr.enrollment_id, ord.currency,
          it.line_net_minor, attr.rate_bps, it.commission_minor, ev.ends_at + make_interval(days => v_promoter_mat))
        on conflict (order_item_id, beneficiary_kind) do nothing;
      end if;
    end loop;
  elsif ord.payment_method in ('cash', 'pos_external') and ord.platform_fee_minor > 0 then
    -- Organizer holds the cash; the platform fee becomes an amount owed by the organizer,
    -- netted from its available balance. Never represented as provider revenue.
    perform private.post_ledger('door_fee:' || ord.id, 'door_sale_fee', ord.currency, jsonb_build_array(
      jsonb_build_object('code', 'org_available', 'owner', 'organization', 'org', ord.organization_id, 'debit', ord.platform_fee_minor),
      jsonb_build_object('code', 'platform_revenue', 'owner', 'platform', 'credit', ord.platform_fee_minor)), ord.id);
  end if;

  update public.orders set status = 'paid', paid_at = coalesce(paid_at, now()), fulfilled_at = now(),
    hold_expires_at = null where id = ord.id;
  insert into public.outbox_jobs (kind, payload, dedupe_key)
  values ('order.deliver', jsonb_build_object('order_id', ord.id), 'order.deliver:' || ord.id)
  on conflict (dedupe_key) do nothing;
  return 'fulfilled';
end $$;

-- ---------------------------------------------------------------------------
-- Public (service-role) checkout entry points
-- ---------------------------------------------------------------------------
create or replace function public.checkout_create_order(
  p_event uuid, p_items jsonb, p_buyer jsonb, p_idempotency_key text,
  p_promo_code text default null, p_referral jsonb default null, p_answers jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ord public.orders; v_result text;
begin
  perform private.require_service();
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then perform private.fail('invalid_idempotency_key'); end if;
  ord := private.build_order(p_event, p_items, p_buyer, p_promo_code, p_referral, p_idempotency_key,
                             p_answers, 'online', 'paystack', null);
  if ord.total_minor = 0 and ord.status = 'pending_payment' then
    v_result := private.fulfill_order(ord.id, 'free');
    select * into ord from public.orders where id = ord.id;
  end if;
  return jsonb_build_object('order_id', ord.id, 'public_ref', ord.public_ref, 'status', ord.status,
    'total_minor', ord.total_minor, 'currency', ord.currency, 'hold_expires_at', ord.hold_expires_at);
end $$;

-- Price quote without holding inventory (runs build_order in a subtransaction and rolls back).
create or replace function public.checkout_quote(
  p_event uuid, p_items jsonb, p_promo_code text default null, p_referral jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ord public.orders; v_items jsonb; v_result jsonb; v_detail text;
begin
  perform private.require_service();
  begin
    ord := private.build_order(p_event, p_items, jsonb_build_object('name', 'Quote', 'email', 'quote@invalid.local'),
      p_promo_code, p_referral, 'quote:' || gen_random_uuid(), '{}', 'online', 'paystack', null);
    select jsonb_agg(jsonb_build_object('ticket_type_id', ticket_type_id, 'name', ticket_type_name, 'quantity', quantity,
      'unit_price_minor', unit_price_minor, 'discount_minor', discount_minor, 'line_net_minor', line_net_minor))
      into v_items from public.order_items where order_id = ord.id;
    v_result := jsonb_build_object('ok', true, 'subtotal_minor', ord.subtotal_minor, 'discount_minor', ord.discount_minor,
      'buyer_fee_minor', ord.buyer_fee_minor, 'total_minor', ord.total_minor, 'currency', ord.currency,
      'admissions', ord.admissions, 'items', v_items);
    raise exception using message = 'quote_rollback', errcode = 'P0002';
  exception when sqlstate 'P0002' then
    return v_result;
  when sqlstate 'P0001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'detail', nullif(v_detail, ''));
  end;
end $$;

create or replace function public.checkout_cancel_order(p_order uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  return private.release_order_hold(p_order, 'cancelled');
end $$;

create or replace function public.payment_attempt_create(
  p_order uuid, p_provider text, p_environment text, p_reference text
) returns public.payment_attempts language plpgsql security definer set search_path = '' as $$
declare ord public.orders; pa public.payment_attempts;
begin
  perform private.require_service();
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.status <> 'pending_payment' or ord.total_minor = 0
     or ord.hold_expires_at < now() + interval '30 seconds' then
    perform private.fail('order_not_payable');
  end if;
  if (select count(*) from public.payment_attempts where order_id = ord.id) >= 5 then
    perform private.fail('too_many_payment_attempts');
  end if;
  insert into public.payment_attempts (order_id, provider, environment, reference, amount_minor, currency)
  values (ord.id, p_provider, p_environment, p_reference, ord.total_minor, ord.currency)
  returning * into pa;
  return pa;
end $$;

create or replace function public.payment_attempt_set_url(p_reference text, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  update public.payment_attempts set authorization_url = p_url where reference = p_reference and status = 'initialized';
end $$;

-- Converge provider-verified results (webhook OR server-side verify call) on one path.
-- The caller must pass values obtained from the provider's verify API / authenticated
-- webhook, never from the browser.
create or replace function public.payment_confirm(
  p_reference text, p_status text, p_amount_minor bigint, p_currency text, p_provider_tx_id text,
  p_fees_minor bigint, p_environment text, p_channel text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare pa public.payment_attempts; ord public.orders; v_result text; v_refund uuid;
begin
  perform private.require_service();
  perform private.begin_internal();
  select * into pa from public.payment_attempts where reference = p_reference for update;
  if not found then return jsonb_build_object('outcome', 'unknown_reference'); end if;
  select * into ord from public.orders where id = pa.order_id for update;

  if pa.status in ('success', 'mismatch') then
    return jsonb_build_object('outcome', 'already_processed', 'order_id', ord.id, 'order_status', ord.status);
  end if;

  if p_status <> 'success' then
    if pa.status = 'initialized' then
      update public.payment_attempts set status = case when p_status = 'abandoned' then 'abandoned' else 'failed' end,
        failure_reason = p_status, verified_at = now() where id = pa.id;
    end if;
    return jsonb_build_object('outcome', 'not_successful', 'order_id', ord.id);
  end if;

  if p_environment <> pa.environment or p_amount_minor <> pa.amount_minor or upper(p_currency) <> pa.currency then
    update public.payment_attempts set status = 'mismatch', provider_transaction_id = p_provider_tx_id,
      failure_reason = format('expected %s %s (%s), got %s %s (%s)', pa.amount_minor, pa.currency, pa.environment,
        p_amount_minor, upper(p_currency), p_environment), verified_at = now()
    where id = pa.id;
    if p_environment = pa.environment and p_amount_minor > 0 then
      perform private.post_ledger('mismatch:' || pa.id, 'payment_mismatch', upper(p_currency)::char(3), jsonb_build_array(
        jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'debit', p_amount_minor),
        jsonb_build_object('code', 'unallocated_receipts', 'owner', 'platform', 'credit', p_amount_minor)), ord.id);
      insert into public.refund_requests (order_id, organization_id, requester_kind, reason, status, amount_minor, kind, payment_attempt_id)
      values (ord.id, ord.organization_id, 'system', 'Payment amount/currency mismatch', 'processing', p_amount_minor, 'exception', pa.id)
      returning id into v_refund;
      insert into public.outbox_jobs (kind, payload, dedupe_key)
      values ('refund.process', jsonb_build_object('refund_id', v_refund), 'refund.process:' || v_refund);
    end if;
    perform private.audit('payment.mismatch', 'payment_attempt', pa.id::text, ord.organization_id, null,
      jsonb_build_object('reference', p_reference));
    return jsonb_build_object('outcome', 'mismatch', 'order_id', ord.id);
  end if;

  -- Second successful payment for an already-paid order: refund it, never double-issue.
  if exists (select 1 from public.payment_attempts where order_id = ord.id and status = 'success') then
    update public.payment_attempts set status = 'mismatch', failure_reason = 'duplicate_payment',
      provider_transaction_id = p_provider_tx_id, verified_at = now() where id = pa.id;
    perform private.post_ledger('duplicate:' || pa.id, 'duplicate_payment', pa.currency, jsonb_build_array(
      jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'debit', p_amount_minor),
      jsonb_build_object('code', 'unallocated_receipts', 'owner', 'platform', 'credit', p_amount_minor)), ord.id);
    insert into public.refund_requests (order_id, organization_id, requester_kind, reason, status, amount_minor, kind, payment_attempt_id)
    values (ord.id, ord.organization_id, 'system', 'Duplicate payment for the same order', 'processing', p_amount_minor, 'exception', pa.id)
    returning id into v_refund;
    insert into public.outbox_jobs (kind, payload, dedupe_key)
    values ('refund.process', jsonb_build_object('refund_id', v_refund), 'refund.process:' || v_refund);
    return jsonb_build_object('outcome', 'duplicate_payment', 'order_id', ord.id);
  end if;

  update public.payment_attempts set status = 'success', provider_transaction_id = p_provider_tx_id,
    provider_fees_minor = p_fees_minor, channel = p_channel, verified_at = now() where id = pa.id;
  if coalesce(p_fees_minor, 0) > 0 then
    perform private.post_ledger('processor_fee:' || pa.id, 'processor_fee', pa.currency, jsonb_build_array(
      jsonb_build_object('code', 'processor_fees', 'owner', 'platform', 'debit', p_fees_minor),
      jsonb_build_object('code', 'provider_clearing', 'owner', 'platform', 'credit', p_fees_minor)), ord.id);
  end if;
  v_result := private.fulfill_order(ord.id, 'paystack');
  select * into ord from public.orders where id = ord.id;
  return jsonb_build_object('outcome', v_result, 'order_id', ord.id, 'order_status', ord.status);
end $$;

create or replace function public.provider_event_record(
  p_provider text, p_dedupe_key text, p_event_type text, p_signature_valid boolean, p_payload jsonb, p_reference text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_service();
  insert into public.provider_events (provider, dedupe_key, event_type, reference, signature_valid, payload)
  values (p_provider, p_dedupe_key, p_event_type, p_reference, p_signature_valid, p_payload)
  on conflict (dedupe_key) do nothing returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', v_id is null);
end $$;

create or replace function public.provider_event_mark(p_id uuid, p_outcome text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  update public.provider_events set processed_at = now(), outcome = p_outcome, error = p_error where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Ticket credentials: the app computes HMAC tokens and stores only SHA-256 hashes.
-- ---------------------------------------------------------------------------
create or replace function public.tickets_set_qr_hashes(p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare c int;
begin
  perform private.require_service();
  perform private.begin_internal();
  update public.tickets t set qr_hash = x.hash
  from jsonb_to_recordset(p_items) as x(id uuid, version int, hash text)
  where t.id = x.id and t.token_version = x.version and t.qr_hash is distinct from x.hash;
  get diagnostics c = row_count;
  return c;
end $$;

create or replace function public.ticket_reissue(p_ticket uuid, p_reason text) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; v_org uuid;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if not found then perform private.fail('not_found'); end if;
  v_org := private.event_org(t.event_id);
  if not (private.has_org_role(v_org, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin()
          or coalesce(auth.role(), '') = 'service_role') then
    perform private.fail('forbidden');
  end if;
  if t.status <> 'valid' then perform private.fail('ticket_not_valid'); end if;
  if length(coalesce(p_reason, '')) < 3 then perform private.fail('reason_required'); end if;
  perform private.begin_internal();
  update public.tickets set token_version = token_version + 1, qr_hash = null where id = t.id returning * into t;
  insert into public.outbox_jobs (kind, payload, dedupe_key)
  values ('ticket.reissued', jsonb_build_object('ticket_id', t.id), 'ticket.reissued:' || t.id || ':' || t.token_version);
  perform private.audit('ticket.reissue', 'ticket', t.id::text, v_org, p_reason);
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- Gate admission. Online-only; first admission is serialized by a row lock.
-- ---------------------------------------------------------------------------
create or replace function private.gate_admit(p_event uuid, t public.tickets, p_device text, p_reentry_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_result text; tt public.ticket_types; v_count int;
begin
  select * into ev from public.events where id = p_event;
  if t.id is null then v_result := 'invalid';
  elsif t.event_id <> p_event then v_result := 'wrong_event';
  elsif t.status = 'refunded' then v_result := 'refunded';
  elsif t.status = 'void' then v_result := 'void';
  elsif ev.status not in ('published', 'paused', 'completed') then v_result := 'event_not_active';
  elsif t.first_checked_in_at is not null and p_reentry_reason is null then v_result := 'already_checked_in';
  elsif t.first_checked_in_at is not null then v_result := 'reentry';
  else v_result := 'admitted';
  end if;

  if v_result in ('admitted', 'reentry') then
    perform private.begin_internal();
    update public.tickets set first_checked_in_at = coalesce(first_checked_in_at, now()),
      check_in_count = check_in_count + 1 where id = t.id returning * into t;
  end if;
  insert into public.check_ins (ticket_id, event_id, staff_user_id, device_id, result, reason)
  values (case when v_result in ('invalid', 'wrong_event') then null else t.id end, p_event, auth.uid(),
          left(p_device, 64), v_result, p_reentry_reason);
  if v_result = 'reentry' then
    perform private.audit('ticket.reentry_override', 'ticket', t.id::text, ev.organization_id, p_reentry_reason);
  end if;

  if v_result in ('invalid', 'wrong_event') then
    return jsonb_build_object('result', v_result); -- reveal nothing about other events' tickets
  end if;
  select * into tt from public.ticket_types where id = t.ticket_type_id;
  select count(*) into v_count from public.tickets where order_item_id = t.order_item_id and unit_number = t.unit_number;
  return jsonb_build_object('result', v_result, 'ticket_id', t.id, 'ticket_ref', t.public_ref,
    'ticket_type', tt.name, 'attendee_name', t.attendee_name, 'admission', t.admission_number,
    'admissions_in_unit', v_count, 'first_checked_in_at', t.first_checked_in_at, 'check_in_count', t.check_in_count);
end $$;

create or replace function public.gate_check_in(p_event uuid, p_qr_hash text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  if auth.uid() is null or not private.is_event_staff(p_event) then perform private.fail('forbidden'); end if;
  select * into t from public.tickets where qr_hash = p_qr_hash for update;
  return private.gate_admit(p_event, t, p_device, null);
end $$;

create or replace function public.gate_check_in_ticket(p_event uuid, p_ticket uuid, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  if auth.uid() is null or not private.is_event_staff(p_event) then perform private.fail('forbidden'); end if;
  select * into t from public.tickets where id = p_ticket and event_id = p_event for update;
  return private.gate_admit(p_event, t, p_device, null);
end $$;

create or replace function public.gate_reentry(p_event uuid, p_ticket uuid, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  if auth.uid() is null or not (
       exists (select 1 from public.event_staff where event_id = p_event and user_id = auth.uid() and can_override_reentry)
       or private.has_org_role(private.event_org(p_event), array['owner', 'manager']::public.org_role[])) then
    perform private.fail('forbidden');
  end if;
  if length(coalesce(trim(p_reason), '')) < 5 then perform private.fail('reason_required'); end if;
  select * into t from public.tickets where id = p_ticket and event_id = p_event for update;
  if t.first_checked_in_at is null then perform private.fail('not_checked_in'); end if;
  return private.gate_admit(p_event, t, p_device, trim(p_reason));
end $$;

-- Limited manual lookup: exact ticket/order reference, or buyer name/email prefix (>= 3 chars).
create or replace function public.gate_lookup(p_event uuid, p_query text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q text := lower(trim(p_query)); v jsonb;
begin
  if auth.uid() is null or not private.is_event_staff(p_event) then perform private.fail('forbidden'); end if;
  if length(q) < 3 then return '[]'; end if;
  select coalesce(jsonb_agg(r), '[]') into v from (
    select t.id ticket_id, t.public_ref ticket_ref, tt.name ticket_type, t.status,
           coalesce(t.attendee_name, o.buyer_name) holder_name, t.first_checked_in_at, t.admission_number
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join public.ticket_types tt on tt.id = t.ticket_type_id
    where t.event_id = p_event and (
      lower(t.public_ref) = q or lower(o.public_ref) = q
      or lower(o.buyer_name) like q || '%' or o.buyer_email like q || '%'
      or lower(coalesce(t.attendee_name, '')) like q || '%')
    order by o.buyer_name, t.unit_number, t.admission_number
    limit 12) r;
  return v;
end $$;

create or replace function public.gate_event_stats(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if auth.uid() is null or not private.is_event_staff(p_event) then perform private.fail('forbidden'); end if;
  select jsonb_build_object(
    'valid', count(*) filter (where status = 'valid'),
    'checked_in', count(*) filter (where status = 'valid' and first_checked_in_at is not null)) into v
  from public.tickets where event_id = p_event;
  return v;
end $$;

create or replace function public.my_gate_events() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'timezone', e.timezone, 'status', e.status, 'venue_name', e.venue_name,
    'can_door_sell', coalesce(s.can_door_sell, false) or private.has_org_role(e.organization_id, array['owner','manager']::public.org_role[]),
    'can_issue_comps', coalesce(s.can_issue_comps, false) or private.has_org_role(e.organization_id, array['owner','manager']::public.org_role[]),
    'can_override_reentry', coalesce(s.can_override_reentry, false) or private.has_org_role(e.organization_id, array['owner','manager']::public.org_role[]))
  from public.events e
  left join public.event_staff s on s.event_id = e.id and s.user_id = auth.uid()
  where e.status in ('published', 'paused', 'completed') and e.ends_at > now() - interval '1 day'
    and (s.user_id is not null or private.has_org_role(e.organization_id, array['owner','manager']::public.org_role[]))
  order by e.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- Door sales & complimentary issue (same inventory engine)
-- ---------------------------------------------------------------------------
create or replace function public.door_sale(
  p_event uuid, p_items jsonb, p_buyer jsonb, p_method text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ord public.orders; v text;
begin
  if auth.uid() is null or not (
       exists (select 1 from public.event_staff where event_id = p_event and user_id = auth.uid() and can_door_sell)
       or private.has_org_role(private.event_org(p_event), array['owner', 'manager']::public.org_role[])) then
    perform private.fail('forbidden');
  end if;
  if p_method not in ('cash', 'pos_external') then perform private.fail('invalid_payment_method'); end if;
  ord := private.build_order(p_event, p_items, p_buyer, null, null, 'door:' || p_idempotency_key, '{}',
                             'door', p_method::public.payment_method, auth.uid());
  v := private.fulfill_order(ord.id, 'door');
  select * into ord from public.orders where id = ord.id;
  perform private.audit('order.door_sale', 'order', ord.id::text, ord.organization_id, null,
    jsonb_build_object('method', p_method, 'total_minor', ord.total_minor));
  return jsonb_build_object('order_id', ord.id, 'public_ref', ord.public_ref, 'status', ord.status, 'total_minor', ord.total_minor);
end $$;

create or replace function public.issue_complimentary(
  p_event uuid, p_ticket_type uuid, p_quantity int, p_recipient jsonb, p_reason text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ord public.orders; v text;
begin
  if auth.uid() is null or not (
       exists (select 1 from public.event_staff where event_id = p_event and user_id = auth.uid() and can_issue_comps)
       or private.has_org_role(private.event_org(p_event), array['owner', 'manager']::public.org_role[])) then
    perform private.fail('forbidden');
  end if;
  if length(coalesce(trim(p_reason), '')) < 3 then perform private.fail('reason_required'); end if;
  ord := private.build_order(p_event, jsonb_build_array(jsonb_build_object('ticket_type_id', p_ticket_type, 'quantity', p_quantity)),
    p_recipient, null, null, 'comp:' || p_idempotency_key, jsonb_build_object('comp_reason', p_reason),
    'comp', 'complimentary', auth.uid());
  v := private.fulfill_order(ord.id, 'complimentary');
  select * into ord from public.orders where id = ord.id;
  perform private.audit('order.complimentary', 'order', ord.id::text, ord.organization_id, p_reason,
    jsonb_build_object('quantity', p_quantity));
  return jsonb_build_object('order_id', ord.id, 'public_ref', ord.public_ref, 'status', ord.status);
end $$;

-- ---------------------------------------------------------------------------
-- Durable jobs (outbox)
-- ---------------------------------------------------------------------------
create or replace function public.jobs_claim(p_worker text, p_limit int default 10)
returns setof public.outbox_jobs language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  return query
  update public.outbox_jobs j set status = 'running', attempts = j.attempts + 1, locked_at = now(), locked_by = p_worker
  where j.id in (
    select id from public.outbox_jobs
    where (status = 'pending' and run_after <= now())
       or (status = 'running' and locked_at < now() - interval '5 minutes') -- crashed worker recovery
    order by run_after, id limit p_limit for update skip locked)
  returning j.*;
end $$;

create or replace function public.jobs_complete(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  update public.outbox_jobs set status = 'succeeded', completed_at = now(), locked_at = null, last_error = null where id = p_id;
end $$;

create or replace function public.jobs_fail(p_id bigint, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  update public.outbox_jobs set
    status = case when attempts >= max_attempts then 'dead' else 'pending' end,
    run_after = now() + least(interval '6 hours', make_interval(secs => 30 * power(2, attempts)::int)),
    locked_at = null, last_error = left(p_error, 2000)
  where id = p_id;
end $$;

create or replace function public.jobs_enqueue(p_kind text, p_payload jsonb, p_dedupe_key text, p_run_after timestamptz default now())
returns boolean language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  perform private.require_service();
  insert into public.outbox_jobs (kind, payload, dedupe_key, run_after) values (p_kind, p_payload, p_dedupe_key, p_run_after)
  on conflict (dedupe_key) do nothing returning id into v;
  return v is not null;
end $$;

-- Email delivery intents are deduplicated; returns false if this message was already sent.
create or replace function public.email_intent(
  p_dedupe_key text, p_template text, p_to text, p_subject text, p_order uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.email_messages;
begin
  perform private.require_service();
  insert into public.email_messages (dedupe_key, template, to_email, subject, order_id)
  values (p_dedupe_key, p_template, lower(p_to), p_subject, p_order)
  on conflict (dedupe_key) do update set attempts = public.email_messages.attempts
  returning * into m;
  return jsonb_build_object('id', m.id, 'should_send', m.status <> 'sent');
end $$;

create or replace function public.email_mark(p_id uuid, p_status text, p_provider text, p_message_id text default null, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  update public.email_messages set status = p_status, provider = p_provider, provider_message_id = p_message_id,
    attempts = attempts + 1, last_error = left(p_error, 1000), sent_at = case when p_status = 'sent' then now() end
  where id = p_id;
end $$;

-- Fixed-window rate limiter.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); h int;
begin
  perform private.require_service();
  insert into private.rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1 returning hits into h;
  return h <= p_limit;
end $$;

create or replace function public.access_token_create(p_hash text, p_purpose text, p_email text, p_minutes int, p_order uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  insert into public.order_access_tokens (token_hash, purpose, order_id, email, expires_at)
  values (p_hash, p_purpose, p_order, lower(p_email), now() + make_interval(mins => p_minutes));
end $$;

create or replace function public.access_token_resolve(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.order_access_tokens;
begin
  perform private.require_service();
  select * into t from public.order_access_tokens where token_hash = p_hash and expires_at > now();
  if not found then return null; end if;
  update public.order_access_tokens set used_at = coalesce(used_at, now()) where id = t.id;
  return jsonb_build_object('email', t.email, 'order_id', t.order_id, 'purpose', t.purpose, 'expires_at', t.expires_at);
end $$;

create or replace function public.record_event_view(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_view_counts (event_id, day, views)
  select id, (now() at time zone 'Africa/Lagos')::date, 1 from public.events
  where id = p_event and status = 'published'
  on conflict (event_id, day) do update set views = public.event_view_counts.views + 1;
end $$;
