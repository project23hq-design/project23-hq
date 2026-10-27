-- Project23 LOCAL seed data. Everything here is fictional.
-- Seed accounts use the local-only password documented in README.md. No account here is a
-- platform admin; create one with `pnpm admin:create` (local only).

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
insert into public.currencies (code, name, symbol, minor_unit, checkout_enabled) values
  ('NGN', 'Nigerian Naira', '₦', 2, true),
  ('GHS', 'Ghanaian Cedi', 'GH₵', 2, false),
  ('KES', 'Kenyan Shilling', 'KSh', 2, false);

insert into public.countries (code, name, default_currency, default_timezone, phone_prefix, checkout_enabled) values
  ('NG', 'Nigeria', 'NGN', 'Africa/Lagos', '+234', true),
  ('GH', 'Ghana', 'GHS', 'Africa/Accra', '+233', false),
  ('KE', 'Kenya', 'KES', 'Africa/Nairobi', '+254', false);

insert into public.regions (id, country_code, code, name, is_launch_region) values
  ('10000000-0000-4000-8000-000000000001', 'NG', 'OS', 'Osun', true),
  ('10000000-0000-4000-8000-000000000002', 'NG', 'LA', 'Lagos', false),
  ('10000000-0000-4000-8000-000000000003', 'NG', 'OY', 'Oyo', false),
  ('10000000-0000-4000-8000-000000000004', 'NG', 'FC', 'Federal Capital Territory', false),
  ('10000000-0000-4000-8000-000000000005', 'NG', 'EK', 'Ekiti', false);

insert into public.cities (id, region_id, slug, name, timezone, sort_order) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'osogbo', 'Osogbo', 'Africa/Lagos', 1),
  ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'ile-ife', 'Ile-Ife', 'Africa/Lagos', 2),
  ('11000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'ilesa', 'Ilesa', 'Africa/Lagos', 3),
  ('11000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'ede', 'Ede', 'Africa/Lagos', 4),
  ('11000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'iwo', 'Iwo', 'Africa/Lagos', 5),
  ('11000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'lagos', 'Lagos', 'Africa/Lagos', 20),
  ('11000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', 'ibadan', 'Ibadan', 'Africa/Lagos', 21),
  ('11000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000004', 'abuja', 'Abuja', 'Africa/Lagos', 22),
  ('11000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000005', 'ado-ekiti', 'Ado-Ekiti', 'Africa/Lagos', 23);

insert into public.categories (id, slug, name, icon, sort_order) values
  ('12000000-0000-4000-8000-000000000001', 'music', 'Music', 'music', 1),
  ('12000000-0000-4000-8000-000000000002', 'nightlife', 'Nightlife', 'moon', 2),
  ('12000000-0000-4000-8000-000000000003', 'comedy', 'Comedy', 'laugh', 3),
  ('12000000-0000-4000-8000-000000000004', 'conferences', 'Conferences', 'presentation', 4),
  ('12000000-0000-4000-8000-000000000005', 'campus', 'Campus', 'graduation-cap', 5),
  ('12000000-0000-4000-8000-000000000006', 'workshops', 'Workshops', 'wrench', 6),
  ('12000000-0000-4000-8000-000000000007', 'community', 'Community', 'users', 7),
  ('12000000-0000-4000-8000-000000000008', 'arts-culture', 'Arts & Culture', 'palette', 8),
  ('12000000-0000-4000-8000-000000000009', 'food-drink', 'Food & Drink', 'utensils', 9);

-- Default platform commission: 5% of organizer ticket proceeds, no buyer fee.
insert into public.fee_policies (scope, platform_fee_bps, platform_fixed_minor, buyer_fee_bps, buyer_fixed_minor, note, effective_from)
values ('platform', 500, 0, 0, 0, 'Launch default (configurable by super-admins)', now() - interval '30 days');

-- ---------------------------------------------------------------------------
-- Local test users (password: Letmein1!)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_name text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('Letmein1!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
$$;

select pg_temp.seed_user('00000000-0000-4000-8000-000000000001', 'organizer@project23.test', 'Adeola Organizer');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000002', 'customer@project23.test', 'Tunde Customer');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000003', 'scanner@project23.test', 'Kemi Scanner');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000004', 'promoter@project23.test', 'Bisi Promoter');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000005', 'ops@project23.test', 'Project23 Events Team');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000006', 'campus@project23.test', 'Ife Campus Lead');
select pg_temp.seed_user('00000000-0000-4000-8000-000000000007', 'finance@project23.test', 'Femi Finance');

update public.profiles set phone = '+2348012345678' where id = '00000000-0000-4000-8000-000000000002';

-- Act as a given authenticated user inside this seed transaction.
create or replace function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1',
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, false);
  select set_config('request.jwt.claim.sub', p_uid::text, false);
$$;
create or replace function pg_temp.act_as_service() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', false);
  select set_config('request.jwt.claim.sub', '', false);
$$;

-- ---------------------------------------------------------------------------
-- Organizations (platform-controlled flags set directly by the seed)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, slug, name, description, contact_email, contact_phone, region_id, city_id,
  is_first_party, approval_status, verification_status, payout_status, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'project23', 'Project23 Events',
   'Official events produced by Project23: rooftop sessions, creative workshops and city takeovers across Osun and beyond.',
   'events@project23.example', '+2348000000023', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   true, 'approved', 'verified', 'eligible', '00000000-0000-4000-8000-000000000005'),
  ('20000000-0000-4000-8000-000000000002', 'osun-sound-collective', 'Osun Sound Collective',
   'A (fictional) collective of DJs and live acts throwing nights across Osogbo and Ede.',
   'hello@osunsound.example', '+2348011111111', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
   false, 'approved', 'verified', 'eligible', '00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', 'ife-campus-arts', 'Ife Campus Arts Society',
   'Student-run (fictional) society hosting poetry, tech meetups and exhibitions in Ile-Ife.',
   'arts@ifecampus.example', null, '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002',
   false, 'approved', 'unverified', 'not_ready', '00000000-0000-4000-8000-000000000006'),
  ('20000000-0000-4000-8000-000000000004', 'ilesa-laugh-factory', 'Ilesa Laugh Factory',
   'Stand-up nights in Ilesa (fictional organizer).', 'jokes@ilesalaughs.example', null,
   '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003',
   false, 'approved', 'unverified', 'not_ready', '00000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000005', 'pending-promotions', 'Pending Promotions Ltd',
   'A newly registered (fictional) organizer.', 'new@pending.example', null,
   '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000004',
   false, 'approved', 'unverified', 'not_ready', '00000000-0000-4000-8000-000000000006');

insert into public.memberships (organization_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'scanner'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'scanner'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000007', 'finance'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000006', 'owner'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006', 'owner');

insert into public.organization_referral_defaults (organization_id, rate_bps, terms_text)
select id, 1000, 'Promoters earn the stated commission on verified, fulfilled ticket sales attributed to their link. Commissions on refunded or disputed sales are reversed. Self-referrals are not eligible.'
from public.organizations;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create or replace function pg_temp.ev(
  p_id uuid, p_org uuid, p_slug text, p_title text, p_summary text, p_cat text, p_city text, p_venue text, p_addr text,
  p_start_days numeric, p_hours numeric, p_capacity int, p_status public.event_status default 'published',
  p_featured boolean default false, p_tags text[] default '{}', p_refund text default 'until_7d'
) returns void language sql as $$
  insert into public.events (id, organization_id, slug, title, summary, description_html, category_id, tags, format,
    venue_name, address_line, country_code, region_id, city_id, timezone, starts_at, ends_at, capacity, status,
    moderation_status, published_at, is_featured, featured_rank, refund_policy, entry_rules, accessibility_info,
    age_restriction, created_by)
  select p_id, p_org, p_slug, p_title, p_summary,
    '<p>' || p_summary || '</p><p>This is a fictional event created for the Project23 demo. Details, performers and venues are illustrative only.</p>',
    (select id from public.categories where slug = p_cat), p_tags, 'in_person', p_venue, p_addr, 'NG', c.region_id, c.id,
    'Africa/Lagos', date_trunc('day', now()) + make_interval(days => p_start_days::int) + interval '18 hours', -- 19:00 WAT
    date_trunc('day', now()) + make_interval(days => p_start_days::int) + interval '18 hours' + make_interval(hours => p_hours::int),
    p_capacity, p_status,
    case when p_status in ('draft') then 'not_submitted' when p_status = 'pending_review' then 'pending' else 'approved' end::public.moderation_status,
    case when p_status not in ('draft', 'pending_review') then now() - interval '3 days' end,
    p_featured, case when p_featured then 1 end, p_refund,
    'Valid ticket required for entry. Each QR admits one person once.',
    'Step-free entrance at the main gate. Contact the organizer for specific needs.',
    case when p_cat = 'nightlife' then 18 end,
    (select user_id from public.memberships where organization_id = p_org and role = 'owner' limit 1)
  from public.cities c where c.slug = p_city;
$$;

select pg_temp.ev('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'osogbo-afrobeats-night',
  'Osogbo Afrobeats Night', 'An all-night Afrobeats and Amapiano session with rotating DJs and a live percussion set.',
  'nightlife', 'osogbo', 'Grove Lounge (fictional)', '12 Station Road, Osogbo', 12, 7, 300, 'published', true, '{afrobeats,amapiano,dj}');
select pg_temp.ev('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'project23-rooftop-sessions-osogbo',
  'Project23 Rooftop Sessions: Osogbo', 'Sunset live music, local food vendors and a skyline view. Produced by Project23.',
  'music', 'osogbo', 'Skyline Terrace (fictional)', 'Gbongan Road, Osogbo', 19, 5, 200, 'published', true, '{live,sunset,rooftop}');
select pg_temp.ev('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'ife-tech-founders-meetup',
  'Ife Tech & Founders Meetup', 'Lightning talks from student founders, a product teardown, and open networking.',
  'conferences', 'ile-ife', 'Innovation Hall (fictional)', 'Campus Road, Ile-Ife', 9, 4, 200, 'published', false, '{tech,startups,networking}', 'no_refunds');
select pg_temp.ev('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'ilesa-comedy-jamz',
  'Ilesa Comedy Jamz', 'Five rising comedians, one microphone, and a crowd that talks back.',
  'comedy', 'ilesa', 'Owa Hall (fictional)', 'Palace Road, Ilesa', 6, 3, 250, 'published', true, '{standup,comedy}');
select pg_temp.ev('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'ede-highlife-revival',
  'Ede Highlife Revival', 'A tribute to classic highlife with a ten-piece band. Sales open soon.',
  'music', 'ede', 'Riverside Gardens (fictional)', 'Osun River Road, Ede', 30, 5, 400, 'published', false, '{highlife,live-band}');
select pg_temp.ev('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 'campus-poetry-slam',
  'Campus Poetry Slam', 'Spoken word battles judged by the audience. Limited seats.',
  'arts-culture', 'ile-ife', 'Amphitheatre B (fictional)', 'Campus Road, Ile-Ife', 4, 3, 20, 'published', false, '{poetry,spoken-word}');
select pg_temp.ev('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', 'osun-creatives-product-design-workshop',
  'Osun Creatives Workshop: Product Design', 'A hands-on day of UX research, wireframing and critique with working designers.',
  'workshops', 'osogbo', 'Project23 Studio (fictional)', 'Old Garage, Osogbo', 15, 7, 60, 'published', false, '{design,ux,career}');
select pg_temp.ev('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', 'lagos-sunset-social',
  'Lagos Sunset Social', 'Beachside DJs, games and food trucks as the sun goes down.',
  'nightlife', 'lagos', 'Shoreline Deck (fictional)', 'Admiralty Way, Lekki, Lagos', 22, 6, 500, 'published', false, '{beach,social}');
select pg_temp.ev('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', 'abuja-founders-dinner',
  'Abuja Founders Dinner', 'An intimate dinner conversation for early-stage founders and operators.',
  'conferences', 'abuja', 'Garden Court (fictional)', 'Maitama, Abuja', 26, 3, 40, 'published', false, '{founders,dinner}');
select pg_temp.ev('30000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000003', 'iwo-community-praise-night',
  'Iwo Community Praise Night', 'A free open-air community choir evening. Everyone welcome.',
  'community', 'iwo', 'Town Square (fictional)', 'Oja Oba, Iwo', 10, 3, 300, 'published', false, '{choir,free}');
select pg_temp.ev('30000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-000000000002', 'osogbo-street-food-festival',
  'Osogbo Street Food Festival', 'Fifty food stalls and a cook-off. (Seeded as cancelled.)',
  'food-drink', 'osogbo', 'Freedom Park (fictional)', 'Ola-Iya, Osogbo', 8, 6, 500, 'published', false, '{food}');
select pg_temp.ev('30000000-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000004', 'ilesa-open-mic',
  'Ilesa Open Mic Night', 'Draft event: an open mic for new comedians.',
  'comedy', 'ilesa', 'Owa Hall (fictional)', 'Palace Road, Ilesa', 40, 3, 100, 'draft');
select pg_temp.ev('30000000-0000-4000-8000-00000000000d', '20000000-0000-4000-8000-000000000003', 'ife-art-exhibition',
  'Ife Bronze & Beyond Exhibition', 'Student artists reinterpret classical Ife art. Awaiting moderation.',
  'arts-culture', 'ile-ife', 'Gallery One (fictional)', 'Mayfair, Ile-Ife', 35, 6, 150, 'pending_review');

-- ---------------------------------------------------------------------------
-- Ticket types (prices in kobo)
-- ---------------------------------------------------------------------------
insert into public.ticket_types (id, event_id, organization_id, name, kind, description, price_minor, quantity_total,
  admissions_per_unit, min_per_order, max_per_order, opens_after_ticket_type_id, visibility, access_code_hash, sales_start_at, sort_order) values
  -- Osogbo Afrobeats Night
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'Early Bird', 'early_bird', 'Limited first-release price.', 500000, 40, 1, 1, 6, null, 'public', null, null, 1),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'Regular', 'regular', 'Opens when Early Bird sells out or closes.', 800000, 200, 1, 1, 10, '40000000-0000-4000-8000-000000000001', 'public', null, null, 2),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'VIP', 'vip', 'Fast-lane entry and a reserved lounge area.', 2000000, 30, 1, 1, 4, null, 'public', null, null, 3),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'VIP Table (6 guests)', 'group', 'One table with six individual admission tickets.', 15000000, 5, 6, 1, 2, null, 'public', null, null, 4),
  -- Project23 Rooftop Sessions
  ('40000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'Regular', 'regular', null, 600000, 160, 1, 1, 8, null, 'public', null, null, 1),
  ('40000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'VIP', 'vip', 'Front terrace and a welcome drink.', 1500000, 40, 1, 1, 4, null, 'public', null, null, 2),
  -- Ife Tech meetup (free)
  ('40000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003',
   'Free RSVP', 'free', 'Free admission; registration required.', 0, 200, 1, 1, 2, null, 'public', null, null, 1),
  -- Ilesa Comedy
  ('40000000-0000-4000-8000-000000000031', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004',
   'Regular', 'regular', null, 300000, 200, 1, 1, 10, null, 'public', null, null, 1),
  ('40000000-0000-4000-8000-000000000032', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004',
   'VIP', 'vip', 'Front rows.', 750000, 50, 1, 1, 6, null, 'public', null, null, 2),
  -- Ede Highlife (sales not started)
  ('40000000-0000-4000-8000-000000000041', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002',
   'Regular', 'regular', null, 700000, 400, 1, 1, 10, null, 'public', null, now() + interval '5 days', 1),
  -- Campus Poetry Slam (will sell out)
  ('40000000-0000-4000-8000-000000000051', '30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003',
   'Student', 'student', 'Student ID checked at entry.', 100000, 20, 1, 1, 20, null, 'public', null, null, 1),
  -- Product Design Workshop
  ('40000000-0000-4000-8000-000000000061', '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
   'Standard', 'regular', 'Includes lunch and materials.', 1200000, 50, 1, 1, 3, null, 'public', null, null, 1),
  ('40000000-0000-4000-8000-000000000062', '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
   'Student (access code)', 'student', 'Use the access code shared with partner schools.', 400000, 10, 1, 1, 1, null,
   'access_code', encode(extensions.digest('STUDENT23', 'sha256'), 'hex'), null, 2),
  -- Lagos Sunset Social
  ('40000000-0000-4000-8000-000000000071', '30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002',
   'Regular', 'regular', null, 1000000, 450, 1, 1, 10, null, 'public', null, null, 1),
  -- Abuja Founders Dinner
  ('40000000-0000-4000-8000-000000000081', '30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001',
   'Dinner Seat', 'regular', 'Three-course dinner.', 2500000, 40, 1, 1, 2, null, 'public', null, null, 1),
  -- Iwo praise night (free)
  ('40000000-0000-4000-8000-000000000091', '30000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000003',
   'Free Entry', 'free', null, 0, 300, 1, 1, 6, null, 'public', null, null, 1),
  -- Street food festival (to be cancelled)
  ('40000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-000000000002',
   'Day Pass', 'regular', null, 200000, 500, 1, 1, 10, null, 'public', null, null, 1),
  -- Draft + pending events
  ('40000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000004',
   'Regular', 'regular', null, 150000, 100, 1, 1, 4, null, 'public', null, null, 1),
  ('40000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-00000000000d', '20000000-0000-4000-8000-000000000003',
   'General', 'general', null, 200000, 150, 1, 1, 4, null, 'public', null, null, 1),
  -- Complimentary type (hidden, staff-issued only)
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   'Guest List', 'complimentary', 'Staff-issued complimentary admission.', 0, 20, 1, 1, 4, null, 'hidden', null, null, 9);

insert into public.promotions (organization_id, event_id, code, description, discount_type, percent_bps, max_redemptions)
values ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'OSUN10', '10% off for Osun locals', 'percent', 1000, 50);
insert into public.promotions (organization_id, event_id, code, description, discount_type, amount_minor, max_redemptions, ticket_type_ids)
values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'ROOFTOP1K', '₦1,000 off Regular', 'fixed', 100000, 2,
        array['40000000-0000-4000-8000-000000000011'::uuid]);

insert into public.event_staff (event_id, organization_id, user_id, can_door_sell, can_issue_comps, can_override_reentry, assigned_by) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', true, false, false, '00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', false, false, false, '00000000-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------------
-- Referral programs (10%), enrollment and link
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select public.referral_program_upsert('30000000-0000-4000-8000-000000000001', 1000, null, 7,
  'Earn 10% of the ticket price (after discounts) on verified sales made through your link. Commissions become available 7 days after the event ends. Refunded or disputed sales are reversed. Self-referrals do not qualify.');
select pg_temp.act_as('00000000-0000-4000-8000-000000000005');
select public.referral_program_upsert('30000000-0000-4000-8000-000000000002', 1000, null, 7,
  'Project23 promoters earn 10% of eligible ticket proceeds after discounts on verified sales. Available 7 days after the event ends; reversals apply to refunds and disputes.');

select pg_temp.act_as('00000000-0000-4000-8000-000000000004');
select public.promoter_apply(p.id, p.current_version_id, 'I run a student events page with 4k followers.')
from public.referral_programs p where p.event_id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select public.promoter_decide(en.id, 'approved') from public.promoter_enrollments en
  join public.referral_programs p on p.id = en.program_id where p.event_id = '30000000-0000-4000-8000-000000000001';
select pg_temp.act_as('00000000-0000-4000-8000-000000000005');
select public.promoter_decide(en.id, 'approved') from public.promoter_enrollments en
  join public.referral_programs p on p.id = en.program_id where p.event_id = '30000000-0000-4000-8000-000000000002';
update public.referral_links set code = 'bisi-osogbo' where event_id = '30000000-0000-4000-8000-000000000001';
update public.referral_links set code = 'bisi-rooftop' where event_id = '30000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Orders through the real engine (test payment provider)
-- ---------------------------------------------------------------------------
select pg_temp.act_as_service();

create or replace function pg_temp.paid_order(p_event uuid, p_items jsonb, p_name text, p_email text, p_user uuid,
  p_key text, p_promo text default null, p_ref jsonb default null) returns uuid language plpgsql as $$
declare r jsonb; pa public.payment_attempts;
begin
  r := public.checkout_create_order(p_event => p_event, p_items => p_items,
         p_buyer => jsonb_build_object('name', p_name, 'email', p_email, 'user_id', p_user),
         p_idempotency_key => p_key, p_promo_code => p_promo, p_referral => p_ref);
  if (r ->> 'total_minor')::bigint > 0 then
    pa := public.payment_attempt_create((r ->> 'order_id')::uuid, 'test', 'test', 'seed_' || p_key);
    perform public.payment_confirm(pa.reference, 'success', pa.amount_minor, 'NGN', 'test_tx_' || p_key, 0, 'test', 'card');
  end if;
  return (r ->> 'order_id')::uuid;
end $$;

-- Customer: 2x Early Bird (with referral) + 1 VIP table (6 admissions) for Afrobeats Night.
select pg_temp.paid_order('30000000-0000-4000-8000-000000000001',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000001","quantity":2}]',
  'Tunde Customer', 'customer@project23.test', '00000000-0000-4000-8000-000000000002', 'seed-order-0001-eb', null,
  jsonb_build_object('link_id', (select id from public.referral_links where code = 'bisi-osogbo'), 'clicked_at', now() - interval '1 hour'));
select pg_temp.paid_order('30000000-0000-4000-8000-000000000001',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000004","quantity":1}]',
  'Tunde Customer', 'customer@project23.test', '00000000-0000-4000-8000-000000000002', 'seed-order-0002-table');
-- Guest buyer with promo code
select pg_temp.paid_order('30000000-0000-4000-8000-000000000001',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000003","quantity":2}]',
  'Ngozi Guest', 'ngozi.guest@example.com', null, 'seed-order-0003-vip', 'OSUN10');
-- Project23 own event via referral
select pg_temp.paid_order('30000000-0000-4000-8000-000000000002',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000011","quantity":2}]',
  'Ayo Guest', 'ayo.guest@example.com', null, 'seed-order-0004-rooftop', null,
  jsonb_build_object('link_id', (select id from public.referral_links where code = 'bisi-rooftop'), 'clicked_at', now() - interval '2 days'));
-- Free RSVP
select pg_temp.paid_order('30000000-0000-4000-8000-000000000003',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000021","quantity":1}]',
  'Tunde Customer', 'customer@project23.test', '00000000-0000-4000-8000-000000000002', 'seed-order-0005-free');
-- Sold-out poetry slam (20 of 20)
select pg_temp.paid_order('30000000-0000-4000-8000-000000000006',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000051","quantity":20}]',
  'Ife Campus Bulk Buyer', 'bulk.buyer@example.com', null, 'seed-order-0006-slam');
-- Comedy: one paid order (to be refunded) and one pending (unpaid) order
select pg_temp.paid_order('30000000-0000-4000-8000-000000000004',
  '[{"ticket_type_id":"40000000-0000-4000-8000-000000000031","quantity":2}]',
  'Tunde Customer', 'customer@project23.test', '00000000-0000-4000-8000-000000000002', 'seed-order-0007-comedy');
select public.checkout_create_order(p_event => '30000000-0000-4000-8000-000000000004',
  p_items => '[{"ticket_type_id":"40000000-0000-4000-8000-000000000032","quantity":1}]',
  p_buyer => '{"name":"Pending Buyer","email":"pending.buyer@example.com"}', p_idempotency_key => 'seed-order-0008-pending');
-- Street food festival order (event is cancelled below)
select pg_temp.paid_order('30000000-0000-4000-8000-00000000000b',
  '[{"ticket_type_id":"40000000-0000-4000-8000-0000000000a1","quantity":3}]',
  'Tunde Customer', 'customer@project23.test', '00000000-0000-4000-8000-000000000002', 'seed-order-0009-food');

-- Refund one comedy ticket (organizer-initiated partial refund), settled by provider.
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select public.refund_request_create(o.id,
  jsonb_build_array(jsonb_build_object('order_item_id', i.id, 'units', 1)), 'Customer can no longer attend', false)
from public.orders o join public.order_items i on i.order_id = o.id where o.idempotency_key = 'seed-order-0007-comedy';
-- Cancel the food festival: creates a tracked refund batch.
select public.cancel_event('30000000-0000-4000-8000-00000000000b', 'Venue permit was withdrawn (fictional scenario).');

select pg_temp.act_as_service();
select public.refund_mark_result(id, 'processed', 'seed_refund_' || left(id::text, 8)) from public.refund_requests where status = 'processing';

-- Check in one Early Bird admission at the gate as the assigned scanner.
select pg_temp.act_as('00000000-0000-4000-8000-000000000003');
select public.gate_check_in_ticket('30000000-0000-4000-8000-000000000001', t.id, 'seed-device')
from public.tickets t join public.orders o on o.id = t.order_id
where o.idempotency_key = 'seed-order-0001-eb' order by t.unit_number limit 1;

select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.claim.sub', '', false);

-- The seed's pending outbox jobs (emails for seeded orders) are marked done so local
-- workers don't email fictional addresses on first run.
update public.outbox_jobs set status = 'succeeded', completed_at = now(), last_error = 'skipped: seed data';
