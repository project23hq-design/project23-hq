-- Admin console, phase 1: user directory, user support actions, platform staff management,
-- platform analytics and a cross-entity search for /super-admin.
--
-- Access model (super_admin implicitly holds every role, see private.has_platform_role):
--   * read-only directory, analytics and search: any platform role
--   * account support actions (sign out, reset password, resend verification, ban): support
--   * granting / revoking platform roles: super_admin only
-- Every write here is audited. Account changes the database cannot make itself (ban,
-- confirm email, send auth emails) are authorized and audited here first; the server then
-- performs them with the Supabase Auth admin API.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.like_escape(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

create or replace function private.has_verified_mfa(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified');
$$;
revoke all on function private.has_verified_mfa(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- User directory
-- ---------------------------------------------------------------------------
create or replace function public.admin_users(
  p_q text default null, p_filter text default 'all', p_limit int default 25, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_like text := '%' || private.like_escape(lower(trim(coalesce(p_q, '')))) || '%';
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  if coalesce(p_filter, 'all') not in ('all', 'staff', 'organizers', 'promoters', 'banned', 'unverified') then
    perform private.fail('invalid_value');
  end if;

  with base as (
    select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
           p.full_name, p.phone
    from auth.users u left join public.profiles p on p.id = u.id
    where (v_q is null or lower(u.email) like v_like escape '\' or lower(coalesce(p.full_name, '')) like v_like escape '\'
           or u.id::text = v_q)
      and case coalesce(p_filter, 'all')
        when 'staff' then exists (select 1 from public.platform_role_assignments a where a.user_id = u.id and a.revoked_at is null)
        when 'organizers' then exists (select 1 from public.memberships m where m.user_id = u.id)
        when 'promoters' then exists (select 1 from public.promoter_enrollments e where e.user_id = u.id)
        when 'banned' then u.banned_until is not null and u.banned_until > now()
        when 'unverified' then u.email_confirmed_at is null
        else true end
  )
  select count(*) into v_total from base;

  with base as (
    select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
           p.full_name, p.phone
    from auth.users u left join public.profiles p on p.id = u.id
    where (v_q is null or lower(u.email) like v_like escape '\' or lower(coalesce(p.full_name, '')) like v_like escape '\'
           or u.id::text = v_q)
      and case coalesce(p_filter, 'all')
        when 'staff' then exists (select 1 from public.platform_role_assignments a where a.user_id = u.id and a.revoked_at is null)
        when 'organizers' then exists (select 1 from public.memberships m where m.user_id = u.id)
        when 'promoters' then exists (select 1 from public.promoter_enrollments e where e.user_id = u.id)
        when 'banned' then u.banned_until is not null and u.banned_until > now()
        when 'unverified' then u.email_confirmed_at is null
        else true end
    order by u.created_at desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'email', b.email, 'full_name', b.full_name, 'phone', b.phone,
      'created_at', b.created_at, 'last_sign_in_at', b.last_sign_in_at,
      'email_confirmed', b.email_confirmed_at is not null,
      'banned', b.banned_until is not null and b.banned_until > now(),
      'roles', (select coalesce(jsonb_agg(a.role order by a.role), '[]') from public.platform_role_assignments a
                where a.user_id = b.id and a.revoked_at is null),
      'org_count', (select count(*) from public.memberships m where m.user_id = b.id),
      'order_count', (select count(*) from public.orders o where o.buyer_user_id = b.id
                      and o.status in ('paid', 'partially_refunded', 'refunded'))
    ) order by b.created_at desc), '[]')
  into v_rows from base b;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u auth.users; v jsonb;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  select * into u from auth.users where id = p_user;
  if u.id is null then perform private.fail('not_found'); end if;

  select jsonb_build_object(
    'id', u.id, 'email', u.email::text, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until,
    'banned', u.banned_until is not null and u.banned_until > now(),
    'mfa_enrolled', private.has_verified_mfa(u.id),
    'active_sessions', (select count(*) from auth.sessions s where s.user_id = u.id),
    'profile', (select jsonb_build_object('full_name', p.full_name, 'phone', p.phone,
                  'marketing_opt_in', p.marketing_opt_in, 'deleted_at', p.deleted_at)
                from public.profiles p where p.id = u.id),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'granted_at', a.granted_at,
                  'revoked_at', a.revoked_at) order by a.granted_at), '[]')
              from public.platform_role_assignments a where a.user_id = u.id),
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object('organization_id', o.id, 'name', o.name, 'slug', o.slug,
                      'role', m.role, 'status', o.status, 'joined_at', m.created_at) order by o.name), '[]')
                    from public.memberships m join public.organizations o on o.id = m.organization_id
                    where m.user_id = u.id),
    'enrollments', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'status', e.status,
                      'event_id', ev.id, 'event_title', ev.title, 'created_at', e.created_at) order by e.created_at desc), '[]')
                    from public.promoter_enrollments e join public.referral_programs rp on rp.id = e.program_id
                    join public.events ev on ev.id = rp.event_id where e.user_id = u.id),
    'stats', (select jsonb_build_object(
                'orders_paid', count(*) filter (where o.status in ('paid', 'partially_refunded', 'refunded')),
                'spent_minor', coalesce(sum(o.total_minor) filter (where o.status in ('paid', 'partially_refunded', 'refunded')), 0),
                'tickets', (select count(*) from public.tickets t join public.orders o2 on o2.id = t.order_id
                            where o2.buyer_user_id = u.id and t.status = 'valid'))
              from public.orders o where o.buyer_user_id = u.id),
    'orders', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
                 select jsonb_build_object('id', o.id, 'public_ref', o.public_ref, 'status', o.status,
                   'total_minor', o.total_minor, 'admissions', o.admissions, 'created_at', o.created_at,
                   'event_id', ev.id, 'event_title', ev.title) as x
                 from public.orders o join public.events ev on ev.id = o.event_id
                 where o.buyer_user_id = u.id or (o.buyer_user_id is null and o.buyer_email = lower(u.email))
                 order by o.created_at desc limit 25) q),
    'audit', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
                select jsonb_build_object('id', l.id, 'action', l.action, 'reason', l.reason,
                  'actor_id', l.actor_id, 'created_at', l.created_at) as x
                from public.audit_logs l
                where (l.entity_type = 'user' and l.entity_id = u.id::text) or l.actor_id = u.id
                order by l.id desc limit 25) q)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Account support actions
-- ---------------------------------------------------------------------------
-- Authorizes and audits an action on a user account. 'sign_out' and 'ban' end every session
-- here (refresh tokens cascade); the server then applies ban/unban/confirm_email or sends
-- the auth email through the Auth admin API. Returns the target's email for that step.
create or replace function public.admin_user_action(p_user uuid, p_action text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u auth.users; v_sessions int := 0; v_is_staff boolean;
begin
  if not private.has_platform_role(array['support']::public.platform_role[]) then perform private.fail('forbidden'); end if;
  if p_action not in ('sign_out', 'ban', 'unban', 'password_reset', 'resend_verification', 'confirm_email') then
    perform private.fail('invalid_value');
  end if;
  if length(coalesce(trim(p_reason), '')) < 3 then perform private.fail('reason_required'); end if;
  select * into u from auth.users where id = p_user;
  if u.id is null then perform private.fail('not_found'); end if;
  if u.id = auth.uid() and p_action in ('ban', 'sign_out') then perform private.fail('cannot_target_self'); end if;

  v_is_staff := exists (select 1 from public.platform_role_assignments a where a.user_id = u.id and a.revoked_at is null);
  if v_is_staff and p_action in ('ban', 'unban', 'sign_out')
     and not private.has_platform_role(array['super_admin']::public.platform_role[]) then
    perform private.fail('staff_target_requires_super_admin');
  end if;
  if p_action = 'resend_verification' and u.email_confirmed_at is not null then perform private.fail('already_verified'); end if;
  if p_action = 'confirm_email' and u.email_confirmed_at is not null then perform private.fail('already_verified'); end if;

  if p_action in ('sign_out', 'ban') then
    delete from auth.sessions where user_id = u.id;
    get diagnostics v_sessions = row_count;
  end if;

  perform private.audit('user.' || p_action, 'user', u.id::text, null, trim(p_reason),
    jsonb_build_object('email', u.email::text, 'sessions_ended', v_sessions));
  return jsonb_build_object('email', u.email::text, 'sessions_ended', v_sessions);
end $$;

-- ---------------------------------------------------------------------------
-- Platform staff
-- ---------------------------------------------------------------------------
create or replace function public.admin_staff() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'email', u.email::text, 'full_name', p.full_name, 'role', a.role,
      'granted_at', a.granted_at, 'granted_by_email', g.email::text, 'revoked_at', a.revoked_at,
      'mfa_enrolled', private.has_verified_mfa(a.user_id), 'last_sign_in_at', u.last_sign_in_at
    ) order by a.revoked_at nulls first, u.email, a.role), '[]')
    from public.platform_role_assignments a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.id = a.user_id
    left join auth.users g on g.id = a.granted_by);
end $$;

create or replace function public.admin_set_staff_role(
  p_email text, p_role public.platform_role, p_grant boolean, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_existing public.platform_role_assignments;
begin
  if not private.has_platform_role(array['super_admin']::public.platform_role[]) then perform private.fail('forbidden'); end if;
  if length(coalesce(trim(p_reason), '')) < 3 then perform private.fail('reason_required'); end if;
  select id into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_user is null then perform private.fail('user_not_found'); end if;

  -- Serialize role changes so two admins can't revoke the last super admin concurrently.
  perform pg_advisory_xact_lock(hashtext('platform_role_assignments'));
  select * into v_existing from public.platform_role_assignments where user_id = v_user and role = p_role for update;

  if p_grant then
    if v_existing.user_id is not null and v_existing.revoked_at is null then perform private.fail('role_already_active'); end if;
    insert into public.platform_role_assignments (user_id, role, granted_by, granted_at, revoked_at)
    values (v_user, p_role, auth.uid(), now(), null)
    on conflict (user_id, role) do update
      set granted_by = excluded.granted_by, granted_at = excluded.granted_at, revoked_at = null;
  else
    if v_existing.user_id is null or v_existing.revoked_at is not null then perform private.fail('role_not_active'); end if;
    if p_role = 'super_admin' and (select count(*) from public.platform_role_assignments
        where role = 'super_admin' and revoked_at is null) <= 1 then
      perform private.fail('last_super_admin');
    end if;
    update public.platform_role_assignments set revoked_at = now() where user_id = v_user and role = p_role;
  end if;

  perform private.audit(case when p_grant then 'staff.grant' else 'staff.revoke' end, 'user', v_user::text,
    null, trim(p_reason), jsonb_build_object('role', p_role, 'email', lower(trim(p_email))));
end $$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------
-- Daily series and leaderboards for [p_from, p_to), bucketed by Lagos calendar day.
-- "Gross" is what buyers paid online through Paystack; door and comp sales are counted in
-- admissions but not gross. Platform revenue = platform fee + buyer booking fee.
create or replace function public.admin_analytics(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_len interval := p_to - p_from;
  v_prev_from timestamptz := p_from - (p_to - p_from);
  v jsonb;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then perform private.fail('invalid_value'); end if;

  with paid as (
    select o.*, (o.paid_at at time zone 'Africa/Lagos')::date as d
    from public.orders o
    where o.paid_at >= v_prev_from and o.paid_at < p_to
      and o.status in ('paid', 'partially_refunded', 'refunded')
  ),
  cur as (select * from paid where paid_at >= p_from),
  prev as (select * from paid where paid_at < p_from),
  days as (
    select g::date as d from generate_series(
      (p_from at time zone 'Africa/Lagos')::date, ((p_to - interval '1 microsecond') at time zone 'Africa/Lagos')::date,
      interval '1 day') g
  ),
  users_new as (
    select (created_at at time zone 'Africa/Lagos')::date as d, count(*) as n
    from auth.users where created_at >= p_from and created_at < p_to group by 1
  ),
  orgs_new as (
    select (created_at at time zone 'Africa/Lagos')::date as d, count(*) as n
    from public.organizations where created_at >= p_from and created_at < p_to group by 1
  ),
  daily as (
    select d,
      coalesce(sum(total_minor) filter (where payment_method = 'paystack'), 0) as gross,
      coalesce(sum(platform_fee_minor + buyer_fee_minor), 0) as revenue,
      count(*) as orders,
      coalesce(sum(admissions), 0) as admissions
    from cur group by d
  ),
  totals as (
    select
      (select coalesce(sum(total_minor) filter (where payment_method = 'paystack'), 0) from cur) as gross,
      (select coalesce(sum(total_minor) filter (where payment_method = 'paystack'), 0) from prev) as gross_prev,
      (select coalesce(sum(platform_fee_minor + buyer_fee_minor), 0) from cur) as revenue,
      (select coalesce(sum(platform_fee_minor + buyer_fee_minor), 0) from prev) as revenue_prev,
      (select count(*) from cur) as orders,
      (select count(*) from prev) as orders_prev,
      (select coalesce(sum(admissions), 0) from cur) as admissions,
      (select coalesce(sum(admissions), 0) from prev) as admissions_prev,
      (select count(*) from auth.users where created_at >= p_from and created_at < p_to) as new_users,
      (select count(*) from auth.users where created_at >= v_prev_from and created_at < p_from) as new_users_prev,
      (select count(*) from public.organizations where created_at >= p_from and created_at < p_to) as new_orgs,
      (select count(*) from public.organizations where created_at >= v_prev_from and created_at < p_from) as new_orgs_prev,
      (select count(*) from public.events where published_at >= p_from and published_at < p_to) as events_published,
      (select count(*) from public.events where published_at >= v_prev_from and published_at < p_from) as events_published_prev,
      (select coalesce(sum(amount_minor), 0) from public.refund_requests
        where created_at >= p_from and created_at < p_to and status in ('processing', 'completed')) as refunds
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'currency', 'NGN',
    'totals', (select to_jsonb(t) from totals t),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', days.d, 'gross_minor', coalesce(dl.gross, 0), 'revenue_minor', coalesce(dl.revenue, 0),
        'orders', coalesce(dl.orders, 0), 'admissions', coalesce(dl.admissions, 0),
        'new_users', coalesce(un.n, 0), 'new_orgs', coalesce(onw.n, 0)) order by days.d), '[]')
      from days left join daily dl on dl.d = days.d left join users_new un on un.d = days.d
      left join orgs_new onw on onw.d = days.d),
    'channels', (select coalesce(jsonb_object_agg(channel, admissions), '{}') from (
        select channel, sum(admissions) as admissions from cur group by channel) c),
    'top_events', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', e.id, 'title', e.title, 'organization', o.name, 'status', e.status,
          'gross_minor', coalesce(sum(c.total_minor) filter (where c.payment_method = 'paystack'), 0),
          'admissions', sum(c.admissions)) as x
        from cur c join public.events e on e.id = c.event_id join public.organizations o on o.id = e.organization_id
        group by e.id, e.title, o.name, e.status
        order by coalesce(sum(c.total_minor) filter (where c.payment_method = 'paystack'), 0) desc, sum(c.admissions) desc
        limit 8) q),
    'top_organizations', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug,
          'gross_minor', coalesce(sum(c.total_minor) filter (where c.payment_method = 'paystack'), 0),
          'revenue_minor', sum(c.platform_fee_minor + c.buyer_fee_minor), 'orders', count(*)) as x
        from cur c join public.organizations o on o.id = c.organization_id
        group by o.id, o.name, o.slug
        order by coalesce(sum(c.total_minor) filter (where c.payment_method = 'paystack'), 0) desc, count(*) desc
        limit 8) q),
    'top_cities', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('name', coalesce(ci.name, 'Online / unknown'),
          'gross_minor', coalesce(sum(c.total_minor) filter (where c.payment_method = 'paystack'), 0),
          'admissions', sum(c.admissions)) as x
        from cur c join public.events e on e.id = c.event_id left join public.cities ci on ci.id = e.city_id
        group by ci.name
        order by sum(c.admissions) desc limit 8) q),
    'top_categories', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('name', coalesce(ca.name, 'Uncategorised'),
          'gross_minor', coalesce(sum(c.total_minor) filter (where c.payment_method = 'paystack'), 0),
          'admissions', sum(c.admissions)) as x
        from cur c join public.events e on e.id = c.event_id left join public.categories ca on ca.id = e.category_id
        group by ca.name
        order by sum(c.admissions) desc limit 8) q)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Global search (command palette)
-- ---------------------------------------------------------------------------
create or replace function public.admin_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := trim(coalesce(p_q, ''));
  v_like text := '%' || private.like_escape(lower(trim(coalesce(p_q, '')))) || '%';
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  if char_length(v_q) < 2 then
    return jsonb_build_object('users', '[]'::jsonb, 'orders', '[]'::jsonb, 'events', '[]'::jsonb, 'organizations', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'users', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', u.id, 'email', u.email::text, 'full_name', p.full_name) as x
        from auth.users u left join public.profiles p on p.id = u.id
        where lower(u.email) like v_like escape '\' or lower(coalesce(p.full_name, '')) like v_like escape '\'
        order by u.created_at desc limit 5) q),
    'orders', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', o.id, 'public_ref', o.public_ref, 'buyer_email', o.buyer_email,
          'status', o.status, 'total_minor', o.total_minor) as x
        from public.orders o
        where lower(o.public_ref) like v_like escape '\' or o.buyer_email like v_like escape '\'
        order by o.created_at desc limit 5) q),
    'events', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', e.id, 'title', e.title, 'slug', e.slug, 'status', e.status,
          'starts_at', e.starts_at) as x
        from public.events e
        where lower(e.title) like v_like escape '\' or e.slug like v_like escape '\'
        order by e.starts_at desc limit 5) q),
    'organizations', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'status', o.status) as x
        from public.organizations o
        where lower(o.name) like v_like escape '\' or o.slug like v_like escape '\'
        order by o.name limit 5) q)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Grants: callable only by signed-in users; each function checks the platform role itself.
-- ---------------------------------------------------------------------------
revoke all on function
  public.admin_users(text, text, int, int),
  public.admin_user_detail(uuid),
  public.admin_user_action(uuid, text, text),
  public.admin_staff(),
  public.admin_set_staff_role(text, public.platform_role, boolean, text),
  public.admin_analytics(timestamptz, timestamptz),
  public.admin_search(text)
from public, anon;
grant execute on function
  public.admin_users(text, text, int, int),
  public.admin_user_detail(uuid),
  public.admin_user_action(uuid, text, text),
  public.admin_staff(),
  public.admin_set_staff_role(text, public.platform_role, boolean, text),
  public.admin_analytics(timestamptz, timestamptz),
  public.admin_search(text)
to authenticated;

create index if not exists orders_paid_at_idx on public.orders(paid_at) where paid_at is not null;
create index if not exists orders_buyer_user_idx on public.orders(buyer_user_id) where buyer_user_id is not null;
