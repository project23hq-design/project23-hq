-- Double-entry ledger, earnings allocations, refunds, disputes, payouts,
-- referral programs, and the durable job outbox.

-- ---------------------------------------------------------------------------
-- Ledger. Chart of accounts (see docs/payments-and-settlement.md):
--   platform:     provider_clearing (A), bank (A), platform_revenue (R), buyer_fee_revenue (R),
--                 processor_fees (E), refunds_payable (L), unallocated_receipts (L),
--                 promoter_recovery (A), door_cash_memo (A, organizer-held cash)
--   organization: org_pending (L), org_available (L), org_payout_locked (L)
--   promoter:     promoter_pending (L), promoter_available (L), promoter_locked (L)
-- Balances are derived from entries only; there is no mutable balance column.
-- ---------------------------------------------------------------------------
create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in (
    'provider_clearing', 'bank', 'platform_revenue', 'buyer_fee_revenue', 'processor_fees',
    'refunds_payable', 'unallocated_receipts', 'promoter_recovery', 'door_cash_memo',
    'org_pending', 'org_available', 'org_payout_locked',
    'promoter_pending', 'promoter_available', 'promoter_locked')),
  owner_kind text not null check (owner_kind in ('platform', 'organization', 'promoter')),
  organization_id uuid references public.organizations(id),
  user_id uuid references auth.users(id),
  currency char(3) not null references public.currencies(code),
  normal_side text not null check (normal_side in ('debit', 'credit')),
  created_at timestamptz not null default now(),
  constraint ledger_accounts_owner check (
    (owner_kind = 'platform' and organization_id is null and user_id is null) or
    (owner_kind = 'organization' and organization_id is not null and user_id is null) or
    (owner_kind = 'promoter' and user_id is not null and organization_id is null))
);
create unique index ledger_accounts_unique on public.ledger_accounts
  (code, owner_kind, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'),
   coalesce(user_id, '00000000-0000-0000-0000-000000000000'), currency);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  idempotency_key text not null unique,
  order_id uuid references public.orders(id),
  refund_id uuid,
  payout_id uuid,
  description text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index ledger_transactions_order_idx on public.ledger_transactions(order_id);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions(id),
  account_id uuid not null references public.ledger_accounts(id),
  currency char(3) not null,
  debit_minor bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  created_at timestamptz not null default now(),
  constraint ledger_entries_one_side check ((debit_minor = 0) <> (credit_minor = 0))
);
create index ledger_entries_account_idx on public.ledger_entries(account_id);
create index ledger_entries_tx_idx on public.ledger_entries(transaction_id);
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function private.forbid_mutation();
create trigger ledger_transactions_append_only before update or delete on public.ledger_transactions
  for each row execute function private.forbid_mutation();

-- Every transaction must balance per currency at commit.
create or replace function private.check_ledger_balanced() returns trigger
language plpgsql set search_path = '' as $$
declare bad record;
begin
  select currency, sum(debit_minor) d, sum(credit_minor) c into bad
  from public.ledger_entries where transaction_id = new.transaction_id
  group by currency having sum(debit_minor) <> sum(credit_minor) limit 1;
  if found then
    raise exception 'unbalanced ledger transaction % (% debit % credit %)',
      new.transaction_id, bad.currency, bad.d, bad.c using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred for each row execute function private.check_ledger_balanced();

create or replace function private.ledger_account(
  p_code text, p_owner text, p_org uuid, p_user uuid, p_currency char(3)
) returns uuid language plpgsql security definer set search_path = '' as $$
declare acc uuid; side text;
begin
  select id into acc from public.ledger_accounts
  where code = p_code and owner_kind = p_owner
    and organization_id is not distinct from p_org and user_id is not distinct from p_user
    and currency = p_currency;
  if acc is not null then return acc; end if;
  side := case when p_code in ('provider_clearing', 'bank', 'processor_fees', 'promoter_recovery', 'door_cash_memo')
               then 'debit' else 'credit' end;
  insert into public.ledger_accounts (code, owner_kind, organization_id, user_id, currency, normal_side)
  values (p_code, p_owner, p_org, p_user, p_currency, side)
  on conflict do nothing returning id into acc;
  if acc is null then
    select id into acc from public.ledger_accounts
    where code = p_code and owner_kind = p_owner
      and organization_id is not distinct from p_org and user_id is not distinct from p_user
      and currency = p_currency;
  end if;
  return acc;
end $$;

-- Balance in the account's normal direction.
create or replace function private.account_balance(p_account uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when a.normal_side = 'debit' then e.debit_minor - e.credit_minor
                           else e.credit_minor - e.debit_minor end), 0)::bigint
  from public.ledger_accounts a left join public.ledger_entries e on e.account_id = a.id
  where a.id = p_account;
$$;

create or replace view private.ledger_balances as
  select a.id account_id, a.code, a.owner_kind, a.organization_id, a.user_id, a.currency,
         coalesce(sum(case when a.normal_side = 'debit' then e.debit_minor - e.credit_minor
                           else e.credit_minor - e.debit_minor end), 0)::bigint balance_minor
  from public.ledger_accounts a left join public.ledger_entries e on e.account_id = a.id
  group by a.id;

-- Post a ledger transaction from a JSON array of lines:
-- [{"code":..,"owner":..,"org":..,"user":..,"debit":n} | {...,"credit":n}]
-- Returns null (no-op) if the idempotency key was already used.
create or replace function private.post_ledger(
  p_key text, p_kind text, p_currency char(3), p_lines jsonb,
  p_order uuid default null, p_refund uuid default null, p_payout uuid default null, p_desc text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare tx uuid; l jsonb;
begin
  insert into public.ledger_transactions (kind, idempotency_key, order_id, refund_id, payout_id, description, created_by)
  values (p_kind, p_key, p_order, p_refund, p_payout, p_desc, auth.uid())
  on conflict (idempotency_key) do nothing returning id into tx;
  if tx is null then return null; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l ->> 'debit')::bigint, 0) = 0 and coalesce((l ->> 'credit')::bigint, 0) = 0 then
      continue; -- zero lines are skipped
    end if;
    insert into public.ledger_entries (transaction_id, account_id, currency, debit_minor, credit_minor)
    values (tx,
      private.ledger_account(l ->> 'code', l ->> 'owner', (l ->> 'org')::uuid, (l ->> 'user')::uuid, p_currency),
      p_currency, coalesce((l ->> 'debit')::bigint, 0), coalesce((l ->> 'credit')::bigint, 0));
  end loop;
  return tx;
end $$;

-- ---------------------------------------------------------------------------
-- Referral programs (tables needed by allocations)
-- ---------------------------------------------------------------------------
create table public.organization_referral_defaults (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  rate_bps int not null check (rate_bps between 1 and 5000),
  attribution_window_days int not null default 7 check (attribution_window_days between 1 and 60),
  terms_text text not null check (char_length(terms_text) between 20 and 8000),
  enrollment_mode text not null default 'approval' check (enrollment_mode in ('approval', 'open')),
  updated_at timestamptz not null default now()
);

create table public.referral_programs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  organization_id uuid not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  enrollment_mode text not null default 'approval' check (enrollment_mode in ('approval', 'open')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  constraint referral_programs_event_org foreign key (event_id, organization_id)
    references public.events(id, organization_id)
);

create table public.referral_program_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.referral_programs(id),
  version int not null,
  rate_bps int not null check (rate_bps between 1 and 5000),
  eligible_ticket_type_ids uuid[], -- null = all paid ticket types
  attribution_window_days int not null check (attribution_window_days between 1 and 60),
  maturity_days_after_event int not null check (maturity_days_after_event >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  terms_text text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (program_id, version)
);
alter table public.referral_programs add constraint referral_programs_current_version
  foreign key (current_version_id) references public.referral_program_versions(id);
create trigger referral_program_versions_append_only before update or delete on public.referral_program_versions
  for each row execute function private.forbid_mutation();

create table public.promoter_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.referral_programs(id),
  user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended', 'revoked')),
  accepted_version_id uuid not null references public.referral_program_versions(id),
  accepted_terms_at timestamptz not null default now(),
  rate_override_bps int check (rate_override_bps between 1 and 5000),
  application_note text check (char_length(application_note) <= 1000),
  decided_by uuid references auth.users(id),
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (program_id, user_id)
);
create index promoter_enrollments_user_idx on public.promoter_enrollments(user_id);

create table public.referral_links (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.promoter_enrollments(id),
  event_id uuid not null references public.events(id),
  code text not null unique default lower(private.random_ref('', 10)),
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index referral_links_one_active on public.referral_links(enrollment_id) where disabled_at is null;

-- Visits are aggregated-safe: no IP, no user agent. session_hash is a salted hash of a
-- first-party random cookie id, used only to approximate unique visitors. Retained 90 days.
create table public.referral_visits (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.referral_links(id),
  session_hash text,
  visited_at timestamptz not null default now()
);
create index referral_visits_link_idx on public.referral_visits(link_id, visited_at);

-- Frozen per-order attribution snapshot.
create table public.order_attributions (
  order_id uuid primary key references public.orders(id),
  link_id uuid not null references public.referral_links(id),
  enrollment_id uuid not null references public.promoter_enrollments(id),
  promoter_user_id uuid not null references auth.users(id),
  program_version_id uuid not null references public.referral_program_versions(id),
  rate_bps int not null,
  eligible_ticket_type_ids uuid[],
  attribution_window_days int not null,
  maturity_days_after_event int not null,
  clicked_at timestamptz not null,
  attributed_at timestamptz not null default now()
);
create index order_attributions_promoter_idx on public.order_attributions(promoter_user_id);
create trigger order_attributions_append_only before update or delete on public.order_attributions
  for each row execute function private.forbid_mutation();

create table public.referral_flags (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  enrollment_id uuid references public.promoter_enrollments(id),
  kind text not null,
  details jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'cleared', 'actioned')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Earnings allocations: one row per order item per beneficiary. The maturity job
-- moves (amount - reversed) from *_pending to *_available exactly once.
-- ---------------------------------------------------------------------------
create table public.earnings_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null references public.order_items(id),
  beneficiary_kind text not null check (beneficiary_kind in ('organization', 'promoter')),
  organization_id uuid not null references public.organizations(id), -- event owner (both kinds)
  promoter_user_id uuid references auth.users(id),
  enrollment_id uuid references public.promoter_enrollments(id),
  currency char(3) not null,
  base_minor bigint not null,           -- commission base (promoter) or line net (organization)
  rate_bps int,
  amount_minor bigint not null check (amount_minor >= 0),
  reversed_minor bigint not null default 0 check (reversed_minor >= 0),
  status text not null default 'pending' check (status in ('pending', 'held', 'released', 'reversed')),
  matures_at timestamptz not null,
  released_at timestamptz,
  hold_reason text,
  created_at timestamptz not null default now(),
  constraint earnings_allocations_shape check (
    (beneficiary_kind = 'organization' and promoter_user_id is null) or
    (beneficiary_kind = 'promoter' and promoter_user_id is not null and enrollment_id is not null)),
  constraint earnings_allocations_reversal_bound check (reversed_minor <= amount_minor),
  unique (order_item_id, beneficiary_kind)
);
create index earnings_allocations_maturity_idx on public.earnings_allocations(matures_at) where status = 'pending';
create index earnings_allocations_promoter_idx on public.earnings_allocations(promoter_user_id);
create index earnings_allocations_org_idx on public.earnings_allocations(organization_id);

-- ---------------------------------------------------------------------------
-- Refunds & disputes
-- ---------------------------------------------------------------------------
create table public.refund_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  reason text not null,
  created_by uuid references auth.users(id),
  status text not null default 'running' check (status in ('running', 'completed')),
  created_at timestamptz not null default now()
);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  organization_id uuid not null references public.organizations(id),
  batch_id uuid references public.refund_batches(id),
  requested_by uuid references auth.users(id),
  requester_kind text not null check (requester_kind in ('buyer', 'organizer', 'platform', 'system')),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'processing', 'completed', 'failed', 'cancelled')),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  include_used_tickets boolean not null default false,
  reviewed_by uuid references auth.users(id),
  review_note text,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index refund_requests_order_idx on public.refund_requests(order_id);
create unique index refund_requests_one_open on public.refund_requests(order_id)
  where status in ('requested', 'approved', 'processing');

create table public.refund_items (
  refund_request_id uuid not null references public.refund_requests(id),
  order_item_id uuid not null references public.order_items(id),
  units int not null check (units > 0),
  amount_minor bigint not null check (amount_minor >= 0),
  platform_fee_reversed_minor bigint not null default 0,
  commission_reversed_minor bigint not null default 0,
  organizer_reversed_minor bigint not null default 0,
  ticket_ids uuid[] not null default '{}',
  primary key (refund_request_id, order_item_id)
);

create table public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.refund_requests(id),
  provider text not null,
  provider_refund_id text unique,
  status text not null check (status in ('pending', 'processing', 'processed', 'failed', 'manual')),
  amount_minor bigint not null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null,
  provider_dispute_id text not null unique,
  status text not null check (status in ('open', 'awaiting_response', 'won', 'lost', 'resolved')),
  amount_minor bigint not null,
  reason text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Payout recipients & payouts (organizations and promoters share one engine)
-- ---------------------------------------------------------------------------
create table public.payout_recipients (
  id uuid primary key default gen_random_uuid(),
  beneficiary_kind text not null check (beneficiary_kind in ('organization', 'promoter')),
  organization_id uuid references public.organizations(id),
  user_id uuid references auth.users(id),
  bank_code text not null check (bank_code ~ '^[0-9A-Za-z]{2,10}$'),
  bank_name text not null,
  account_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  provider_recipient_code text,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'verified', 'disabled')),
  verified_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint payout_recipients_owner check (
    (beneficiary_kind = 'organization' and organization_id is not null and user_id is null) or
    (beneficiary_kind = 'promoter' and user_id is not null and organization_id is null))
);
create unique index payout_recipients_one_active_org on public.payout_recipients(organization_id)
  where status <> 'disabled' and beneficiary_kind = 'organization';
create unique index payout_recipients_one_active_user on public.payout_recipients(user_id)
  where status <> 'disabled' and beneficiary_kind = 'promoter';

-- Full account numbers: no grants to anon/authenticated; service role only.
create table private.payout_recipient_secrets (
  recipient_id uuid primary key references public.payout_recipients(id) on delete cascade,
  account_number text not null check (account_number ~ '^[0-9]{10}$')
);

create type public.payout_status as enum
  ('pending', 'approved', 'processing', 'paid', 'failed', 'reversed', 'rejected', 'cancelled');

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default private.random_ref('PO-', 10),
  beneficiary_kind text not null check (beneficiary_kind in ('organization', 'promoter')),
  organization_id uuid references public.organizations(id),
  user_id uuid references auth.users(id),
  recipient_id uuid not null references public.payout_recipients(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status public.payout_status not null default 'pending',
  settlement_method text not null default 'manual_bank' check (settlement_method in ('paystack_transfer', 'manual_bank')),
  idempotency_key text not null unique,
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  review_note text,
  provider_transfer_code text,
  external_reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_requests_owner check (
    (beneficiary_kind = 'organization' and organization_id is not null and user_id is null) or
    (beneficiary_kind = 'promoter' and user_id is not null and organization_id is null))
);
create index payout_requests_status_idx on public.payout_requests(status, created_at);

create table public.payout_attempts (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payout_requests(id),
  provider text not null,
  status text not null,
  detail jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Outbox jobs, email delivery intents, access tokens, rate limits, notifications
-- ---------------------------------------------------------------------------
create table public.outbox_jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}',
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'dead')),
  attempts int not null default 0,
  max_attempts int not null default 8,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index outbox_jobs_ready_idx on public.outbox_jobs(run_after) where status in ('pending', 'running');

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  template text not null,
  to_email text not null,
  subject text not null,
  order_id uuid references public.orders(id),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider text,
  provider_message_id text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.order_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null check (purpose in ('order_link', 'retrieval')),
  order_id uuid references public.orders(id),
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
