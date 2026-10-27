-- Project23 foundation: geography, identity, tenancy, platform roles, audit, settings.
-- Conventions:
--   * money = bigint minor units (kobo for NGN); rates = integer basis points (1% = 100 bps)
--   * timestamps = timestamptz (UTC); events carry an explicit IANA timezone
--   * internal helpers live in schema "private" which is NOT exposed through the Data API

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- ---------------------------------------------------------------------------
-- Internal-write guard. Security-definer RPCs call private.begin_internal() so
-- that guard triggers allow changes to platform-controlled columns (counters,
-- statuses, verification flags). Direct client updates never set this flag.
-- ---------------------------------------------------------------------------
create or replace function private.begin_internal() returns void
language sql volatile set search_path = '' as $$
  select set_config('project23.internal', 'on', true);
$$;

create or replace function private.is_internal() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('project23.internal', true), '') = 'on'
      or coalesce(auth.role(), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin');
$$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function private.random_ref(prefix text, len int default 8) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(len);
  out text := '';
begin
  for i in 0 .. len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return prefix || out;
end $$;

-- ---------------------------------------------------------------------------
-- Geography & currency (modelled for expansion; checkout launches NGN only)
-- ---------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key,
  name text not null,
  symbol text not null,
  minor_unit smallint not null check (minor_unit between 0 and 4),
  checkout_enabled boolean not null default false
);

create table public.countries (
  code char(2) primary key,
  name text not null,
  default_currency char(3) not null references public.currencies(code),
  default_timezone text not null,
  phone_prefix text not null,
  checkout_enabled boolean not null default false
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries(code),
  code text not null,
  name text not null,
  is_launch_region boolean not null default false,
  unique (country_code, code)
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id),
  slug text not null unique,
  name text not null,
  timezone text not null,
  sort_order int not null default 100
);
create index cities_region_idx on public.cities(region_id);

-- ---------------------------------------------------------------------------
-- Profiles. Authorization NEVER reads user_metadata; profiles hold display data only.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  avatar_path text,
  marketing_opt_in boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only a display name is copied from signup metadata. Nothing here grants privileges.
  insert into public.profiles (id, full_name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Platform roles: provisioned out-of-band (scripts/create-super-admin.ts or SQL by
-- an operator). No API path inserts into this table.
-- ---------------------------------------------------------------------------
create type public.platform_role as enum ('super_admin', 'support', 'finance_admin');

create table public.platform_role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role)
);

-- True only for an active assignment AND an MFA-verified (aal2) session.
create or replace function private.has_platform_role(roles public.platform_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_role_assignments a
    where a.user_id = auth.uid()
      and a.revoked_at is null
      and (roles is null or a.role = any(roles) or a.role = 'super_admin')
  ) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_platform_role(null);
$$;

-- Assignment exists, regardless of MFA level (used to route users to MFA enrolment).
create or replace function public.my_platform_roles() returns public.platform_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(role), '{}') from public.platform_role_assignments
  where user_id = auth.uid() and revoked_at is null;
$$;

-- Recent authentication: any amr entry within N seconds (password re-entry or MFA).
create or replace function private.has_recent_auth(max_age_seconds int default 900) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
    where (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - max_age_seconds
  );
$$;

-- ---------------------------------------------------------------------------
-- Organizations & memberships
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'manager', 'finance', 'scanner');
create type public.org_approval_status as enum ('pending', 'approved', 'rejected');
create type public.org_verification_status as enum ('unverified', 'verified');
create type public.org_payout_status as enum ('not_ready', 'pending_review', 'eligible', 'suspended');
create type public.org_status as enum ('active', 'suspended');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  name text not null check (char_length(name) between 2 and 120),
  description text check (char_length(description) <= 4000),
  logo_path text,
  contact_email text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  website text check (website ~* '^https://'),
  country_code char(2) not null default 'NG' references public.countries(code),
  region_id uuid references public.regions(id),
  city_id uuid references public.cities(id),
  -- platform-controlled fields (guarded by trigger)
  is_first_party boolean not null default false,
  approval_status public.org_approval_status not null default 'pending',
  verification_status public.org_verification_status not null default 'unverified',
  payout_status public.org_payout_status not null default 'not_ready',
  status public.org_status not null default 'active',
  status_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organizations_single_first_party on public.organizations (is_first_party) where is_first_party;
create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();

create or replace function private.guard_org_platform_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_internal() then return new; end if;
  if tg_op = 'INSERT' then
    if new.is_first_party or new.approval_status <> 'pending' or new.verification_status <> 'unverified'
       or new.payout_status <> 'not_ready' or new.status <> 'active' then
      raise exception 'platform-controlled organization fields cannot be set' using errcode = '42501';
    end if;
  elsif new.is_first_party is distinct from old.is_first_party
     or new.approval_status is distinct from old.approval_status
     or new.verification_status is distinct from old.verification_status
     or new.payout_status is distinct from old.payout_status
     or new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.slug is distinct from old.slug
     or new.created_by is distinct from old.created_by then
    raise exception 'platform-controlled organization fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organizations_guard before insert or update on public.organizations
  for each row execute function private.guard_org_platform_fields();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.org_role not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations(organization_id);

-- Membership helpers (security definer to avoid RLS recursion).
create or replace function private.org_role_of(org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = org and m.user_id = auth.uid();
$$;

create or replace function private.has_org_role(org uuid, roles public.org_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.org_role_of(org) = any(roles), false);
$$;

create or replace function private.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.org_role_of(org) is not null;
$$;

-- Active (not suspended) organization check for new activity.
create or replace function private.org_is_active(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations where id = org and status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- Audit log: append-only
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'system', 'provider')),
  action text not null,
  organization_id uuid references public.organizations(id),
  entity_type text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create or replace function private.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.forbid_mutation();

create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_org uuid default null, p_reason text default null, p_meta jsonb default '{}'
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, actor_kind, action, organization_id, entity_type, entity_id, reason, metadata)
  values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end,
          p_action, p_org, p_entity_type, p_entity_id, p_reason, coalesce(p_meta, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- Platform settings (key/value, admin-managed, audited)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function private.setting_int(p_key text, p_default bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::bigint from public.platform_settings where key = p_key), p_default);
$$;

create or replace function private.setting_text(p_key text, p_default text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.platform_settings where key = p_key), p_default);
$$;

insert into public.platform_settings (key, value, description) values
  ('checkout_hold_minutes', '10', 'Minutes an unpaid order holds inventory'),
  ('organizer_hold_days', '3', 'Days after event end before organizer proceeds become available'),
  ('promoter_maturity_days', '7', 'Minimum days after event end before promoter commissions become available'),
  ('min_payout_minor', '500000', 'Minimum withdrawal amount in minor units (NGN 5,000)'),
  ('promoter_min_withdrawal_minor', '200000', 'Minimum promoter withdrawal (NGN 2,000)'),
  ('max_promoter_rate_bps', '3000', 'Highest promoter commission rate an organizer may configure'),
  ('processor_fee_bearer', '"platform"', 'Who bears provider processing fees: platform | organizer'),
  ('door_sales_platform_fee', 'true', 'Whether platform commission applies to cash door sales'),
  ('order_retrieval_link_minutes', '30', 'Validity of emailed order-retrieval links'),
  ('support_email', '"support@project23.example"', 'Support contact shown publicly (placeholder)');
