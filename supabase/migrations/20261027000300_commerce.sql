-- Fee policies, orders (immutable economic snapshots), payments, tickets, admission.

-- ---------------------------------------------------------------------------
-- Fee policies: versioned, insert-only. Precedence: event > organization > platform.
-- The policy in effect at order creation is snapshotted into the order.
-- ---------------------------------------------------------------------------
create table public.fee_policies (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'organization', 'event')),
  organization_id uuid references public.organizations(id),
  event_id uuid references public.events(id),
  currency char(3) not null default 'NGN' references public.currencies(code),
  platform_fee_bps int not null check (platform_fee_bps between 0 and 5000),
  platform_fixed_minor bigint not null default 0 check (platform_fixed_minor >= 0), -- per paid admission unit
  buyer_fee_bps int not null default 0 check (buyer_fee_bps between 0 and 2000),
  buyer_fixed_minor bigint not null default 0 check (buyer_fixed_minor >= 0),     -- per paid order
  platform_fee_refundable boolean not null default true,
  effective_from timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint fee_policies_scope_shape check (
    (scope = 'platform' and organization_id is null and event_id is null) or
    (scope = 'organization' and organization_id is not null and event_id is null) or
    (scope = 'event' and event_id is not null))
);
create index fee_policies_lookup on public.fee_policies(scope, organization_id, event_id, effective_from desc);
create trigger fee_policies_append_only before update or delete on public.fee_policies
  for each row execute function private.forbid_mutation();

create or replace function private.resolve_fee_policy(p_event uuid, p_at timestamptz default now())
returns public.fee_policies language sql stable security definer set search_path = '' as $$
  select fp.* from public.fee_policies fp
  join public.events e on e.id = p_event
  where fp.currency = e.currency and fp.effective_from <= p_at and (
        (fp.scope = 'event' and fp.event_id = e.id) or
        (fp.scope = 'organization' and fp.organization_id = e.organization_id) or
        fp.scope = 'platform')
  order by case fp.scope when 'event' then 0 when 'organization' then 1 else 2 end, fp.effective_from desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create type public.order_status as enum (
  'pending_payment',       -- inventory held until hold_expires_at
  'expired',               -- hold released, unpaid
  'paid',                  -- fulfilled; tickets issued
  'fulfillment_exception', -- money captured but could not be fulfilled; refund workflow queued
  'cancelled',             -- abandoned by buyer before payment
  'partially_refunded',
  'refunded'
);
create type public.payment_method as enum ('paystack', 'free', 'cash', 'pos_external', 'complimentary');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique default private.random_ref('P23-', 8),
  event_id uuid not null,
  organization_id uuid not null,
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_name text not null check (char_length(buyer_name) between 2 and 120),
  buyer_email text not null check (buyer_email = lower(buyer_email) and buyer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  buyer_phone text check (buyer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  channel text not null default 'online' check (channel in ('online', 'door', 'comp')),
  payment_method public.payment_method not null,
  status public.order_status not null default 'pending_payment',
  currency char(3) not null references public.currencies(code),
  -- economic snapshot (immutable once created; see guard)
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  buyer_fee_minor bigint not null default 0 check (buyer_fee_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  promoter_commission_minor bigint not null default 0 check (promoter_commission_minor >= 0),
  organizer_net_minor bigint not null default 0,
  fee_policy_id uuid references public.fee_policies(id),
  fee_snapshot jsonb not null default '{}',
  promotion_id uuid references public.promotions(id),
  promo_code text,
  admissions int not null check (admissions > 0),
  answers jsonb not null default '{}',
  idempotency_key text not null unique,
  hold_expires_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  expired_at timestamptz,
  exception_reason text,
  door_staff_id uuid references auth.users(id),
  cash_collected_by text check (cash_collected_by in ('organizer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_event_org foreign key (event_id, organization_id)
    references public.events(id, organization_id),
  constraint orders_total check (total_minor = subtotal_minor - discount_minor + buyer_fee_minor),
  constraint orders_discount_bound check (discount_minor <= subtotal_minor),
  constraint orders_hold check (status <> 'pending_payment' or hold_expires_at is not null)
);
create index orders_event_idx on public.orders(event_id, status);
create index orders_org_idx on public.orders(organization_id, created_at desc);
create index orders_buyer_user_idx on public.orders(buyer_user_id);
create index orders_buyer_email_idx on public.orders(buyer_email);
create index orders_hold_idx on public.orders(hold_expires_at) where status = 'pending_payment';
create trigger orders_touch before update on public.orders
  for each row execute function private.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id),
  ticket_type_name text not null,
  ticket_kind public.ticket_kind not null,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity int not null check (quantity > 0),
  admissions_per_unit int not null check (admissions_per_unit > 0),
  line_subtotal_minor bigint not null,
  discount_minor bigint not null default 0,
  line_net_minor bigint not null,              -- subtotal - discount: base for fees & commission
  platform_fee_minor bigint not null default 0,
  commission_minor bigint not null default 0,  -- set at fulfillment when attributed
  organizer_net_minor bigint not null default 0,
  refunded_units int not null default 0 check (refunded_units >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_math check (line_subtotal_minor = unit_price_minor * quantity
    and line_net_minor = line_subtotal_minor - discount_minor and discount_minor >= 0 and line_net_minor >= 0),
  constraint order_items_refund_bound check (refunded_units <= quantity)
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_ticket_type_idx on public.order_items(ticket_type_id);

-- Order and item economics are immutable outside engine RPCs, and even the engine may
-- only change lifecycle columns once the order has been paid.
create or replace function private.guard_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'orders are never deleted' using errcode = '42501';
  end if;
  if not private.is_internal() then
    raise exception 'orders are modified only by the checkout engine' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.paid_at is not null and (
       new.subtotal_minor <> old.subtotal_minor or new.discount_minor <> old.discount_minor
    or new.total_minor <> old.total_minor or new.buyer_fee_minor <> old.buyer_fee_minor
    or new.platform_fee_minor <> old.platform_fee_minor or new.currency <> old.currency
    or new.fee_snapshot <> old.fee_snapshot or new.event_id <> old.event_id) then
    raise exception 'paid order economics are immutable' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger orders_guard before insert or update or delete on public.orders
  for each row execute function private.guard_order();

create or replace function private.guard_order_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or not private.is_internal() then
    raise exception 'order items are modified only by the checkout engine' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.unit_price_minor <> old.unit_price_minor or new.quantity <> old.quantity
      or new.line_net_minor <> old.line_net_minor or new.ticket_type_id <> old.ticket_type_id
      or new.ticket_type_name <> old.ticket_type_name or new.platform_fee_minor <> old.platform_fee_minor) then
    raise exception 'order item snapshots are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger order_items_guard before insert or update or delete on public.order_items
  for each row execute function private.guard_order_item();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null check (provider in ('paystack', 'test')),
  environment text not null check (environment in ('test', 'live')),
  reference text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status text not null default 'initialized'
    check (status in ('initialized', 'success', 'failed', 'abandoned', 'mismatch')),
  provider_transaction_id text unique,
  authorization_url text,
  provider_fees_minor bigint check (provider_fees_minor >= 0),
  channel text,
  failure_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_attempts_order_idx on public.payment_attempts(order_id);
-- At most one successful payment per order; extra captures become exceptions/refunds.
create unique index payment_attempts_one_success on public.payment_attempts(order_id) where status = 'success';

create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  dedupe_key text not null unique,        -- sha256 of raw body (Paystack has no event id)
  event_type text,
  reference text,
  signature_valid boolean not null,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  error text
);
create index provider_events_reference_idx on public.provider_events(reference);

-- ---------------------------------------------------------------------------
-- Tickets (one per admission) & check-ins
-- QR credential = HMAC(server secret, ticket id + token_version); only its SHA-256
-- (qr_hash) is stored. Rotation bumps token_version and clears qr_hash.
-- ---------------------------------------------------------------------------
create type public.ticket_status as enum ('valid', 'void', 'refunded');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique default private.random_ref('T-', 10),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  event_id uuid not null references public.events(id),
  ticket_type_id uuid not null references public.ticket_types(id),
  unit_number int not null check (unit_number > 0),        -- which purchased unit (table #2)
  admission_number int not null check (admission_number > 0), -- seat within that unit
  status public.ticket_status not null default 'valid',
  token_version int not null default 1,
  qr_hash text unique,
  attendee_name text,
  attendee_email text,
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  first_checked_in_at timestamptz,
  check_in_count int not null default 0,
  unique (order_item_id, unit_number, admission_number)
);
create index tickets_order_idx on public.tickets(order_id);
create index tickets_event_idx on public.tickets(event_id, status);

create or replace function private.guard_ticket() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or not private.is_internal() then
    raise exception 'tickets are modified only by the ticketing engine' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status in ('void', 'refunded') and new.status = 'valid' then
    raise exception 'void/refunded tickets cannot be revalidated; reissue instead' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger tickets_guard before insert or update or delete on public.tickets
  for each row execute function private.guard_ticket();

create table public.check_ins (
  id bigint generated always as identity primary key,
  ticket_id uuid references public.tickets(id),
  event_id uuid not null references public.events(id),
  staff_user_id uuid not null references auth.users(id),
  device_id text check (char_length(device_id) <= 64),
  result text not null check (result in ('admitted', 'reentry', 'already_checked_in', 'invalid',
                                         'wrong_event', 'void', 'refunded', 'event_not_active')),
  reason text,
  created_at timestamptz not null default now()
);
create index check_ins_event_idx on public.check_ins(event_id, created_at desc);
create trigger check_ins_append_only before update or delete on public.check_ins
  for each row execute function private.forbid_mutation();
