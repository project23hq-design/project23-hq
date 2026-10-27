-- Events, ticket inventory, promotions, staff assignments, discovery helpers.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text,
  sort_order int not null default 100
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) <= 160),
  address_line text check (char_length(address_line) <= 300),
  city_id uuid references public.cities(id),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create type public.event_status as enum
  ('draft', 'pending_review', 'published', 'paused', 'cancelled', 'completed', 'archived');
create type public.moderation_status as enum
  ('not_submitted', 'pending', 'approved', 'changes_requested', 'rejected');
create type public.event_visibility as enum ('public', 'unlisted', 'private');
create type public.event_format as enum ('in_person', 'online', 'hybrid');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$'),
  title text not null check (char_length(title) between 3 and 140),
  summary text check (char_length(summary) <= 280),
  description_html text check (char_length(description_html) <= 20000), -- sanitized server-side
  category_id uuid references public.categories(id),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  format public.event_format not null default 'in_person',
  venue_id uuid,
  venue_name text check (char_length(venue_name) <= 160),
  address_line text check (char_length(address_line) <= 300),
  country_code char(2) not null default 'NG' references public.countries(code),
  region_id uuid references public.regions(id),
  city_id uuid references public.cities(id),
  timezone text not null default 'Africa/Lagos',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cover_path text,
  cover_alt text,
  age_restriction smallint check (age_restriction between 0 and 25),
  accessibility_info text check (char_length(accessibility_info) <= 2000),
  entry_rules text check (char_length(entry_rules) <= 2000),
  refund_policy text not null default 'no_refunds'
    check (refund_policy in ('no_refunds', 'until_24h', 'until_7d', 'custom')),
  refund_policy_text text check (char_length(refund_policy_text) <= 2000),
  attendee_questions jsonb not null default '[]' check (jsonb_typeof(attendee_questions) = 'array'),
  collect_attendee_names boolean not null default false,
  visibility public.event_visibility not null default 'public',
  capacity int not null check (capacity between 1 and 1000000),
  currency char(3) not null default 'NGN' references public.currencies(code),
  -- platform/engine-controlled fields
  status public.event_status not null default 'draft',
  moderation_status public.moderation_status not null default 'not_submitted',
  moderation_notes text,
  admissions_sold int not null default 0 check (admissions_sold >= 0),
  admissions_held int not null default 0 check (admissions_held >= 0),
  is_featured boolean not null default false,
  featured_rank int,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_capacity_invariant check (admissions_sold + admissions_held <= capacity),
  constraint events_venue_same_org foreign key (venue_id, organization_id)
    references public.venues(id, organization_id),
  unique (id, organization_id)
);
create index events_discovery_idx on public.events(status, visibility, starts_at);
create index events_org_idx on public.events(organization_id, starts_at desc);
create index events_city_idx on public.events(city_id);
create index events_category_idx on public.events(category_id);
create index events_search_idx on public.events using gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(venue_name, ''))
);
create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();

-- Private, member-only event data (never in the public projection).
create table public.event_private (
  event_id uuid primary key references public.events(id) on delete cascade,
  online_access_instructions text check (char_length(online_access_instructions) <= 4000),
  internal_notes text check (char_length(internal_notes) <= 4000)
);

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  path text not null,
  alt text,
  sort_order int not null default 0
);
create index event_media_event_idx on public.event_media(event_id);

-- Allowed transitions. Engine/admin-only transitions are enforced in RPCs.
create or replace function private.event_transition_allowed(f public.event_status, t public.event_status)
returns boolean language sql immutable set search_path = '' as $$
  select (f, t) in (
    ('draft', 'pending_review'), ('draft', 'archived'),
    ('pending_review', 'draft'), ('pending_review', 'published'),
    ('published', 'paused'), ('published', 'cancelled'), ('published', 'completed'),
    ('paused', 'published'), ('paused', 'cancelled'), ('paused', 'completed'),
    ('cancelled', 'archived'), ('completed', 'archived')
  );
$$;

create or replace function private.guard_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_internal() and (
      new.status <> 'draft' or new.moderation_status <> 'not_submitted' or new.admissions_sold <> 0
      or new.admissions_held <> 0 or new.is_featured or new.published_at is not null) then
      raise exception 'engine-controlled event fields cannot be set' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not private.event_transition_allowed(old.status, new.status) then
    raise exception 'invalid event transition % -> %', old.status, new.status using errcode = '22023';
  end if;

  if private.is_internal() then return new; end if;

  if new.status is distinct from old.status
     or new.moderation_status is distinct from old.moderation_status
     or new.moderation_notes is distinct from old.moderation_notes
     or new.admissions_sold is distinct from old.admissions_sold
     or new.admissions_held is distinct from old.admissions_held
     or new.is_featured is distinct from old.is_featured
     or new.featured_rank is distinct from old.featured_rank
     or new.published_at is distinct from old.published_at
     or new.cancelled_at is distinct from old.cancelled_at
     or new.organization_id is distinct from old.organization_id
     or new.currency is distinct from old.currency
     or new.created_by is distinct from old.created_by then
    raise exception 'engine-controlled event fields cannot be changed directly' using errcode = '42501';
  end if;

  if old.status in ('cancelled', 'completed', 'archived') then
    raise exception 'event is % and can no longer be edited', old.status using errcode = '42501';
  end if;

  -- Once tickets have been sold, schedule/location changes are material: audit + notify buyers.
  if old.admissions_sold > 0 then
    if new.slug is distinct from old.slug then
      raise exception 'slug cannot change after tickets are sold' using errcode = '42501';
    end if;
    if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
       or new.venue_name is distinct from old.venue_name or new.address_line is distinct from old.address_line
       or new.city_id is distinct from old.city_id or new.format is distinct from old.format then
      perform private.audit('event.material_change', 'event', new.id::text, new.organization_id, null,
        jsonb_build_object(
          'old', jsonb_build_object('starts_at', old.starts_at, 'ends_at', old.ends_at,
                                    'venue_name', old.venue_name, 'address_line', old.address_line),
          'new', jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at,
                                    'venue_name', new.venue_name, 'address_line', new.address_line)));
      insert into public.outbox_jobs (kind, payload, dedupe_key)
      values ('event.material_change', jsonb_build_object('event_id', new.id),
              'event.material_change:' || new.id || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  -- Content edits on a published, approved event drop back to review only for
  -- unapproved organizations; approved organizations may edit in place (audited above).
  return new;
end $$;
create trigger events_guard before insert or update on public.events
  for each row execute function private.guard_event();

-- ---------------------------------------------------------------------------
-- Ticket types
-- ---------------------------------------------------------------------------
create type public.ticket_kind as enum
  ('general', 'early_bird', 'regular', 'vip', 'vvip', 'student', 'group', 'free', 'complimentary');
create type public.ticket_visibility as enum ('public', 'hidden', 'access_code');

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  organization_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  kind public.ticket_kind not null default 'general',
  description text check (char_length(description) <= 500),
  price_minor bigint not null check (price_minor >= 0 and price_minor <= 100000000000),
  currency char(3) not null default 'NGN' references public.currencies(code),
  quantity_total int not null check (quantity_total between 0 and 1000000),
  units_sold int not null default 0 check (units_sold >= 0),
  units_held int not null default 0 check (units_held >= 0),
  admissions_per_unit int not null default 1 check (admissions_per_unit between 1 and 50),
  min_per_order int not null default 1 check (min_per_order >= 1),
  max_per_order int not null default 10 check (max_per_order between 1 and 100),
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  opens_after_ticket_type_id uuid references public.ticket_types(id),
  visibility public.ticket_visibility not null default 'public',
  access_code_hash text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_types_event_org foreign key (event_id, organization_id)
    references public.events(id, organization_id) on delete cascade,
  constraint ticket_types_inventory check (units_sold + units_held <= quantity_total),
  constraint ticket_types_minmax check (min_per_order <= max_per_order),
  constraint ticket_types_window check (sales_end_at is null or sales_start_at is null or sales_end_at > sales_start_at),
  constraint ticket_types_access_code check ((visibility = 'access_code') = (access_code_hash is not null)),
  constraint ticket_types_comp_free check (kind not in ('free', 'complimentary') or price_minor = 0),
  constraint ticket_types_no_self_dependency check (opens_after_ticket_type_id is distinct from id)
);
create index ticket_types_event_idx on public.ticket_types(event_id, sort_order);
create trigger ticket_types_touch before update on public.ticket_types
  for each row execute function private.touch_updated_at();

create or replace function private.guard_ticket_type() returns trigger
language plpgsql set search_path = '' as $$
declare dep_event uuid;
begin
  if tg_op = 'DELETE' then
    if old.units_sold > 0 or old.units_held > 0 then
      raise exception 'ticket types with sales or holds cannot be deleted; deactivate instead' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.opens_after_ticket_type_id is not null then
    select event_id into dep_event from public.ticket_types where id = new.opens_after_ticket_type_id;
    if dep_event is distinct from new.event_id then
      raise exception 'dependency must be a ticket type of the same event' using errcode = '22023';
    end if;
  end if;
  if new.currency <> 'NGN' then
    raise exception 'only NGN checkout is enabled at launch' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if not private.is_internal() and (new.units_sold <> 0 or new.units_held <> 0) then
      raise exception 'inventory counters are engine-controlled' using errcode = '42501';
    end if;
    return new;
  end if;
  if private.is_internal() then return new; end if;
  if new.units_sold is distinct from old.units_sold or new.units_held is distinct from old.units_held
     or new.event_id is distinct from old.event_id or new.organization_id is distinct from old.organization_id then
    raise exception 'inventory counters are engine-controlled' using errcode = '42501';
  end if;
  if old.units_sold > 0 and (new.admissions_per_unit is distinct from old.admissions_per_unit
                             or new.currency is distinct from old.currency) then
    raise exception 'admissions per unit and currency are fixed once sold' using errcode = '42501';
  end if;
  -- quantity_total below sold+held is rejected by ticket_types_inventory.
  return new;
end $$;
create trigger ticket_types_guard before insert or update or delete on public.ticket_types
  for each row execute function private.guard_ticket_type();

-- ---------------------------------------------------------------------------
-- Promotions (promo codes). Caps count reserved (active holds) + completed.
-- ---------------------------------------------------------------------------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  percent_bps int check (percent_bps between 1 and 10000),
  amount_minor bigint check (amount_minor > 0),
  ticket_type_ids uuid[], -- null = all ticket types of the event
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions int check (max_redemptions > 0),
  redemptions_reserved int not null default 0 check (redemptions_reserved >= 0),
  redemptions_completed int not null default 0 check (redemptions_completed >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_event_org foreign key (event_id, organization_id)
    references public.events(id, organization_id) on delete cascade,
  constraint promotions_shape check (
    (discount_type = 'percent' and percent_bps is not null and amount_minor is null) or
    (discount_type = 'fixed' and amount_minor is not null and percent_bps is null)),
  constraint promotions_cap check (max_redemptions is null or redemptions_reserved + redemptions_completed <= max_redemptions),
  unique (event_id, code)
);

create or replace function private.guard_promotion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_internal() then return new; end if;
  if tg_op = 'INSERT' and (new.redemptions_reserved <> 0 or new.redemptions_completed <> 0) then
    raise exception 'redemption counters are engine-controlled' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.redemptions_reserved is distinct from old.redemptions_reserved
     or new.redemptions_completed is distinct from old.redemptions_completed
     or new.event_id is distinct from old.event_id or new.organization_id is distinct from old.organization_id) then
    raise exception 'redemption counters are engine-controlled' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger promotions_guard before insert or update on public.promotions
  for each row execute function private.guard_promotion();

-- ---------------------------------------------------------------------------
-- Event staff (gate) assignments: must be members of the owning organization.
-- ---------------------------------------------------------------------------
create table public.event_staff (
  event_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_door_sell boolean not null default false,
  can_issue_comps boolean not null default false,
  can_override_reentry boolean not null default false,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_staff_event_org foreign key (event_id, organization_id)
    references public.events(id, organization_id) on delete cascade,
  constraint event_staff_member foreign key (organization_id, user_id)
    references public.memberships(organization_id, user_id) on delete cascade
);
create index event_staff_user_idx on public.event_staff(user_id);

create or replace function private.is_event_staff(ev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_staff s where s.event_id = ev and s.user_id = auth.uid())
      or exists (select 1 from public.events e where e.id = ev
                 and private.has_org_role(e.organization_id, array['owner', 'manager']::public.org_role[]));
$$;

create or replace function private.event_org(ev uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.events where id = ev;
$$;

-- ---------------------------------------------------------------------------
-- Customer engagement & moderation
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('fraud', 'inappropriate', 'misleading', 'safety', 'ip', 'other')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution text,
  handled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Aggregated daily view counts (no per-visitor tracking).
create table public.event_view_counts (
  event_id uuid not null references public.events(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (event_id, day)
);
