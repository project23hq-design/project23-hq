-- Reference data that every environment needs, shipped as a migration so a fresh
-- production database works without hand-run SQL:
--   * Naira and Nigeria (the only currency/country checkout supports).
--   * Nigeria's 36 states + FCT (fixed; cities hang off a state).
-- Cities are NOT pre-loaded: organizers type their city and it is created on first use
-- (public.resolve_city). Categories and the platform fee are set by super-admins in the
-- admin area; until a platform fee exists, checkout refuses with fee_policy_missing.

insert into public.currencies (code, name, symbol, minor_unit, checkout_enabled)
values ('NGN', 'Nigerian Naira', '₦', 2, true)
on conflict (code) do update set checkout_enabled = true;

insert into public.countries (code, name, default_currency, default_timezone, phone_prefix, checkout_enabled)
values ('NG', 'Nigeria', 'NGN', 'Africa/Lagos', '+234', true)
on conflict (code) do update set checkout_enabled = true;

-- The five ids below match supabase/seed.sql so local demo data keeps working.
insert into public.regions (id, country_code, code, name, is_launch_region) values
  ('10000000-0000-4000-8000-000000000001', 'NG', 'OS', 'Osun', true),
  ('10000000-0000-4000-8000-000000000002', 'NG', 'LA', 'Lagos', false),
  ('10000000-0000-4000-8000-000000000003', 'NG', 'OY', 'Oyo', false),
  ('10000000-0000-4000-8000-000000000004', 'NG', 'FC', 'Federal Capital Territory', false),
  ('10000000-0000-4000-8000-000000000005', 'NG', 'EK', 'Ekiti', false)
on conflict (country_code, code) do nothing;

insert into public.regions (country_code, code, name) values
  ('NG', 'AB', 'Abia'), ('NG', 'AD', 'Adamawa'), ('NG', 'AK', 'Akwa Ibom'), ('NG', 'AN', 'Anambra'),
  ('NG', 'BA', 'Bauchi'), ('NG', 'BY', 'Bayelsa'), ('NG', 'BE', 'Benue'), ('NG', 'BO', 'Borno'),
  ('NG', 'CR', 'Cross River'), ('NG', 'DE', 'Delta'), ('NG', 'EB', 'Ebonyi'), ('NG', 'ED', 'Edo'),
  ('NG', 'EN', 'Enugu'), ('NG', 'GO', 'Gombe'), ('NG', 'IM', 'Imo'), ('NG', 'JI', 'Jigawa'),
  ('NG', 'KD', 'Kaduna'), ('NG', 'KN', 'Kano'), ('NG', 'KT', 'Katsina'), ('NG', 'KE', 'Kebbi'),
  ('NG', 'KO', 'Kogi'), ('NG', 'KW', 'Kwara'), ('NG', 'NA', 'Nasarawa'), ('NG', 'NI', 'Niger'),
  ('NG', 'OG', 'Ogun'), ('NG', 'ON', 'Ondo'), ('NG', 'PL', 'Plateau'), ('NG', 'RI', 'Rivers'),
  ('NG', 'SO', 'Sokoto'), ('NG', 'TA', 'Taraba'), ('NG', 'YO', 'Yobe'), ('NG', 'ZA', 'Zamfara')
on conflict (country_code, code) do nothing;

create or replace function private.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(p), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Cities: find the typed city (case-insensitive) or create it under the given state.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_city(p_name text, p_state text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_state text := upper(nullif(trim(coalesce(p_state, '')), ''));
  v_region public.regions;
  v_id uuid;
  v_slug text;
begin
  if auth.uid() is null then perform private.fail('forbidden'); end if;
  if v_name = '' then return null; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 or private.slugify(v_name) = '' then
    perform private.fail('invalid_city');
  end if;

  select c.id into v_id from public.cities c join public.regions r on r.id = c.region_id
  where lower(c.name) = lower(v_name) and (v_state is null or r.code = v_state)
  order by c.sort_order limit 1;
  if v_id is not null then return v_id; end if;

  if v_state is null then perform private.fail('city_state_required'); end if;
  select * into v_region from public.regions where country_code = 'NG' and code = v_state;
  if v_region.id is null then perform private.fail('invalid_state'); end if;

  v_slug := private.slugify(v_name);
  if exists (select 1 from public.cities where slug = v_slug) then
    v_slug := v_slug || '-' || lower(v_region.code);
  end if;
  if exists (select 1 from public.cities where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.cities (region_id, slug, name, timezone)
  values (v_region.id, v_slug, v_name, 'Africa/Lagos')
  returning id into v_id;
  perform private.audit('city.create', 'city', v_id::text, null, null,
    jsonb_build_object('name', v_name, 'state', v_region.code));
  return v_id;
end $$;
revoke all on function public.resolve_city(text, text) from public, anon;
grant execute on function public.resolve_city(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Categories: managed by platform admins (MFA-verified) in /super-admin/categories.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_category(p_id uuid, p_name text, p_sort_order int default 100)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_slug text := private.slugify(v_name);
  v_id uuid;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 or v_slug = '' then perform private.fail('invalid_value'); end if;
  if exists (select 1 from public.categories where (slug = v_slug or lower(name) = lower(v_name))
             and id is distinct from p_id) then
    perform private.fail('category_exists');
  end if;
  if p_id is null then
    insert into public.categories (slug, name, sort_order) values (v_slug, v_name, coalesce(p_sort_order, 100))
    returning id into v_id;
    perform private.audit('category.create', 'category', v_id::text, null, null, jsonb_build_object('name', v_name));
  else
    update public.categories set name = v_name, sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id returning id into v_id;
    if v_id is null then perform private.fail('not_found'); end if;
    perform private.audit('category.update', 'category', v_id::text, null, null, jsonb_build_object('name', v_name));
  end if;
  return v_id;
end $$;

create or replace function public.admin_delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not private.is_platform_admin() then perform private.fail('forbidden'); end if;
  if exists (select 1 from public.events where category_id = p_id) then perform private.fail('category_in_use'); end if;
  delete from public.categories where id = p_id returning name into v_name;
  if v_name is null then perform private.fail('not_found'); end if;
  perform private.audit('category.delete', 'category', p_id::text, null, null, jsonb_build_object('name', v_name));
end $$;

revoke all on function public.admin_save_category(uuid, text, int), public.admin_delete_category(uuid) from public, anon;
grant execute on function public.admin_save_category(uuid, text, int), public.admin_delete_category(uuid) to authenticated;
