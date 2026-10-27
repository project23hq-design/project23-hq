-- Row Level Security, least-privilege grants, safe public projections, storage.

-- Guard triggers write audit/outbox rows and call private helpers; they run with the
-- owner's rights (their own checks read the caller's JWT claims, which are unaffected).
alter function private.guard_org_platform_fields() security definer;
alter function private.guard_event() security definer;
alter function private.guard_ticket_type() security definer;
alter function private.guard_promotion() security definer;
alter function private.guard_order() security definer;
alter function private.guard_order_item() security definer;
alter function private.guard_ticket() security definer;

-- ===========================================================================
-- 1. Lock everything down, then grant deliberately.
-- ===========================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant all on all tables in schema private to service_role;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ===========================================================================
-- 2. Public projections (security-definer views exposing only safe columns).
-- Only published, approved events of active approved organizations; private
-- visibility never appears. Discovery additionally filters visibility = 'public'.
-- ===========================================================================
create view public.public_organizations with (security_barrier) as
  select o.id, o.slug, o.name, o.description, o.logo_path, o.website, o.city_id,
         o.is_first_party, (o.verification_status = 'verified') as is_verified, o.created_at
  from public.organizations o
  where o.status = 'active' and o.approval_status = 'approved';

create view public.public_events with (security_barrier) as
  select e.id, e.slug, e.title, e.summary, e.description_html, e.category_id, c.slug category_slug, c.name category_name,
         e.tags, e.format, e.venue_name, e.address_line, e.country_code, e.region_id, r.name region_name,
         e.city_id, ci.name city_name, ci.slug city_slug, e.timezone, e.starts_at, e.ends_at,
         e.cover_path, e.cover_alt, e.age_restriction, e.accessibility_info, e.entry_rules, e.refund_policy,
         e.refund_policy_text, e.attendee_questions, e.collect_attendee_names, e.visibility, e.status, e.currency,
         e.is_featured, e.featured_rank, e.published_at, e.cancellation_reason,
         o.id organization_id, o.slug organization_slug, o.name organization_name, o.logo_path organization_logo_path,
         o.is_first_party, (o.verification_status = 'verified') organization_verified,
         v.latitude, v.longitude,
         (select min(t.price_minor) from public.ticket_types t where t.event_id = e.id and t.is_active and t.visibility = 'public'
            and t.kind <> 'complimentary') min_price_minor,
         (select max(t.price_minor) from public.ticket_types t where t.event_id = e.id and t.is_active and t.visibility = 'public'
            and t.kind <> 'complimentary') max_price_minor,
         greatest(e.capacity - e.admissions_sold - e.admissions_held, 0) = 0 or not exists (
           select 1 from public.ticket_types t where t.event_id = e.id and t.is_active and t.visibility <> 'hidden'
             and t.kind <> 'complimentary' and t.quantity_total - t.units_sold - t.units_held > 0) as is_sold_out,
         not exists (select 1 from public.ticket_types t where t.event_id = e.id and t.is_active and t.visibility <> 'hidden'
             and t.kind <> 'complimentary' and (t.sales_end_at is null or t.sales_end_at > now())) or e.ends_at <= now() as sales_ended,
         to_tsvector('simple', coalesce(e.title, '') || ' ' || coalesce(e.summary, '') || ' ' || coalesce(e.venue_name, '')
                     || ' ' || coalesce(o.name, '') || ' ' || array_to_string(e.tags, ' ')) as search_vector
  from public.events e
  join public.organizations o on o.id = e.organization_id and o.status = 'active' and o.approval_status = 'approved'
  left join public.categories c on c.id = e.category_id
  left join public.cities ci on ci.id = e.city_id
  left join public.regions r on r.id = e.region_id
  left join public.venues v on v.id = e.venue_id
  where e.moderation_status = 'approved' and e.visibility <> 'private'
    and e.status in ('published', 'paused', 'cancelled', 'completed');

create view public.public_ticket_types with (security_barrier) as
  select t.id, t.event_id, t.name, t.kind, t.description, t.price_minor, t.currency, t.admissions_per_unit,
         t.min_per_order, least(t.max_per_order, greatest(t.quantity_total - t.units_sold - t.units_held, 0)) max_per_order,
         t.sales_start_at, t.sales_end_at, t.sort_order, (t.visibility = 'access_code') requires_access_code,
         case
           when e.status <> 'published' then 'unavailable'
           when t.sales_end_at is not null and t.sales_end_at <= now() then 'sales_ended'
           when t.quantity_total - t.units_sold - t.units_held <= 0 and t.units_held > 0
                and t.quantity_total - t.units_sold > 0 then 'on_hold'
           when t.quantity_total - t.units_sold - t.units_held <= 0 then 'sold_out'
           when e.capacity - e.admissions_sold - e.admissions_held < t.admissions_per_unit then 'sold_out'
           when t.sales_start_at is not null and t.sales_start_at > now() then 'not_started'
           when t.opens_after_ticket_type_id is not null and not private.ticket_dependency_open(t.opens_after_ticket_type_id) then 'locked'
           else 'available'
         end as availability,
         (select name from public.ticket_types d where d.id = t.opens_after_ticket_type_id) opens_after_name,
         -- coarse scarcity signal only; exact inventory stays private
         (t.quantity_total - t.units_sold - t.units_held) between 1 and 10 as few_left
  from public.ticket_types t
  join public.events e on e.id = t.event_id
  where t.is_active and t.visibility <> 'hidden' and t.kind <> 'complimentary'
    and exists (select 1 from public.public_events pe where pe.id = e.id);

create view public.public_event_media with (security_barrier) as
  select m.id, m.event_id, m.path, m.alt, m.sort_order from public.event_media m
  join public.public_events e on e.id = m.event_id;

-- "Selling now": admissions sold online in the last 7 days (real activity, ranking only).
create view public.trending_events with (security_barrier) as
  select e.id event_id, rank() over (order by sum(o.admissions) desc) as trend_rank
  from public.orders o join public.public_events e on e.id = o.event_id
  where o.status = 'paid' and o.channel = 'online' and o.paid_at > now() - interval '7 days'
    and e.status = 'published' and e.visibility = 'public' and e.starts_at > now()
  group by e.id having sum(o.admissions) >= 3;

create view public.public_referral_programs with (security_barrier) as
  select p.id, p.event_id, p.enrollment_mode, v.id version_id, v.version, v.rate_bps, v.attribution_window_days,
         v.maturity_days_after_event, v.terms_text, v.starts_at, v.ends_at, v.eligible_ticket_type_ids,
         e.title event_title, e.slug event_slug, e.starts_at event_starts_at, e.organization_name, e.cover_path
  from public.referral_programs p
  join public.referral_program_versions v on v.id = p.current_version_id
  join public.public_events e on e.id = p.event_id
  where p.status = 'active' and e.status = 'published' and e.visibility = 'public';

grant select on public.public_organizations, public.public_events, public.public_ticket_types,
  public.public_event_media, public.trending_events, public.public_referral_programs to anon, authenticated;

-- ===========================================================================
-- 3. Reference data
-- ===========================================================================
grant select on public.currencies, public.countries, public.regions, public.cities, public.categories,
  public.platform_settings to anon, authenticated;
create policy "reference read" on public.currencies for select using (true);
create policy "reference read" on public.countries for select using (true);
create policy "reference read" on public.regions for select using (true);
create policy "reference read" on public.cities for select using (true);
create policy "reference read" on public.categories for select using (true);
create policy "settings read" on public.platform_settings for select using (true);

-- ===========================================================================
-- 4. Identity & tenancy
-- ===========================================================================
grant select, update (full_name, phone, avatar_path, marketing_opt_in) on public.profiles to authenticated;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or private.is_platform_admin());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.platform_role_assignments to authenticated;
create policy "own roles" on public.platform_role_assignments for select to authenticated
  using (user_id = auth.uid() or private.is_platform_admin());

grant select, update (name, description, logo_path, contact_email, contact_phone, website, region_id, city_id)
  on public.organizations to authenticated;
create policy "members read org" on public.organizations for select to authenticated
  using (private.is_org_member(id) or private.is_platform_admin());
create policy "owners managers update org" on public.organizations for update to authenticated
  using (private.has_org_role(id, array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(id, array['owner', 'manager']::public.org_role[]));

grant select on public.memberships to authenticated;
create policy "membership read" on public.memberships for select to authenticated
  using (user_id = auth.uid() or private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])
         or private.is_platform_admin());

grant select (id, organization_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
  on public.invitations to authenticated;
create policy "invitation read" on public.invitations for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin());

grant select on public.audit_logs to authenticated;
create policy "audit read" on public.audit_logs for select to authenticated
  using (private.is_platform_admin() or (organization_id is not null and private.has_org_role(organization_id, array['owner']::public.org_role[])));

-- ===========================================================================
-- 5. Events & inventory (writes restricted to owner/manager; guards protect engine columns)
-- ===========================================================================
grant select, insert, update on public.venues to authenticated;
create policy "venue read" on public.venues for select to authenticated using (private.is_org_member(organization_id) or private.is_platform_admin());
create policy "venue write" on public.venues for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));
create policy "venue update" on public.venues for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

grant select, insert, update on public.events to authenticated;
create policy "event read" on public.events for select to authenticated
  using (private.is_org_member(organization_id) or private.is_platform_admin());
create policy "event insert" on public.events for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])
              and private.org_is_active(organization_id) and created_by = auth.uid());
create policy "event update" on public.events for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

grant select, insert, update on public.event_private to authenticated;
create policy "event private" on public.event_private for all to authenticated
  using (private.has_org_role(private.event_org(event_id), array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(private.event_org(event_id), array['owner', 'manager']::public.org_role[]));

grant select, insert, update, delete on public.event_media to authenticated;
create policy "event media" on public.event_media for all to authenticated
  using (private.has_org_role(private.event_org(event_id), array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(private.event_org(event_id), array['owner', 'manager']::public.org_role[]));

grant select, insert, update, delete on public.ticket_types to authenticated;
create policy "ticket type read" on public.ticket_types for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager', 'finance']::public.org_role[]) or private.is_platform_admin());
create policy "ticket type write" on public.ticket_types for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));
create policy "ticket type update" on public.ticket_types for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));
create policy "ticket type delete" on public.ticket_types for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

grant select, insert, update on public.promotions to authenticated;
create policy "promo read" on public.promotions for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager', 'finance']::public.org_role[]) or private.is_platform_admin());
create policy "promo insert" on public.promotions for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));
create policy "promo update" on public.promotions for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

grant select on public.event_staff to authenticated;
create policy "staff read" on public.event_staff for select to authenticated
  using (user_id = auth.uid() or private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

grant select, insert, delete on public.favorites to authenticated;
create policy "own favorites" on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant insert on public.reports to authenticated;
grant select, update (status, resolution, handled_by, handled_at) on public.reports to authenticated;
create policy "file report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "admin reports" on public.reports for select to authenticated using (private.is_platform_admin());
create policy "admin reports update" on public.reports for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());

grant select on public.event_view_counts to authenticated;
create policy "views read" on public.event_view_counts for select to authenticated
  using (private.is_org_member(private.event_org(event_id)) or private.is_platform_admin());

-- ===========================================================================
-- 6. Commerce (read-only to clients; all writes through engine RPCs)
-- ===========================================================================
grant select on public.fee_policies to authenticated;
create policy "fee policy read" on public.fee_policies for select to authenticated
  using (scope = 'platform' or private.is_platform_admin()
         or (organization_id is not null and private.is_org_member(organization_id))
         or (event_id is not null and private.is_org_member(private.event_org(event_id))));

create or replace function private.can_read_order(p_org uuid, p_buyer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_buyer = auth.uid()
      or private.has_org_role(p_org, array['owner', 'manager', 'finance']::public.org_role[])
      or private.is_platform_admin();
$$;

grant select on public.orders, public.order_items, public.refund_requests, public.refund_items to authenticated;
create policy "order read" on public.orders for select to authenticated using (private.can_read_order(organization_id, buyer_user_id));
create policy "order item read" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and private.can_read_order(o.organization_id, o.buyer_user_id)));
create policy "refund read" on public.refund_requests for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and private.can_read_order(o.organization_id, o.buyer_user_id)));
create policy "refund item read" on public.refund_items for select to authenticated
  using (exists (select 1 from public.refund_requests r join public.orders o on o.id = r.order_id
                 where r.id = refund_request_id and private.can_read_order(o.organization_id, o.buyer_user_id)));

-- Tickets: qr_hash is never selectable by clients.
grant select (id, public_ref, order_id, order_item_id, event_id, ticket_type_id, unit_number, admission_number, status,
  token_version, attendee_name, attendee_email, issued_at, voided_at, void_reason, first_checked_in_at, check_in_count)
  on public.tickets to authenticated;
create policy "ticket read" on public.tickets for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_user_id = auth.uid()
           or private.has_org_role(o.organization_id, array['owner', 'manager']::public.org_role[]) or private.is_platform_admin())));

grant select (id, order_id, provider, environment, reference, amount_minor, currency, status, provider_fees_minor, channel,
  failure_reason, verified_at, created_at) on public.payment_attempts to authenticated;
create policy "payment read" on public.payment_attempts for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
         and (private.has_org_role(o.organization_id, array['owner', 'finance']::public.org_role[]) or private.is_platform_admin())));

grant select on public.check_ins to authenticated;
create policy "check-in read" on public.check_ins for select to authenticated
  using (staff_user_id = auth.uid() or private.has_org_role(private.event_org(event_id), array['owner', 'manager']::public.org_role[])
         or private.is_platform_admin());

grant select on public.provider_events, public.disputes, public.refund_attempts, public.refund_batches,
  public.ledger_accounts, public.ledger_transactions, public.ledger_entries, public.outbox_jobs, public.email_messages,
  public.payout_attempts, public.referral_flags to authenticated;
create policy "admin only" on public.provider_events for select to authenticated using (private.is_platform_admin());
create policy "admin only" on public.ledger_accounts for select to authenticated using (private.is_platform_admin());
create policy "admin only" on public.ledger_transactions for select to authenticated using (private.is_platform_admin());
create policy "admin only" on public.ledger_entries for select to authenticated using (private.is_platform_admin());
create policy "admin only" on public.outbox_jobs for select to authenticated using (private.is_platform_admin());
create policy "admin only" on public.email_messages for select to authenticated using (private.is_platform_admin());
create policy "admin only" on public.payout_attempts for select to authenticated using (private.is_platform_admin());
create policy "org finance or admin" on public.disputes for select to authenticated
  using (private.is_platform_admin() or exists (select 1 from public.orders o where o.id = order_id
         and private.has_org_role(o.organization_id, array['owner', 'finance']::public.org_role[])));
create policy "refund attempts" on public.refund_attempts for select to authenticated
  using (private.is_platform_admin() or exists (select 1 from public.refund_requests r where r.id = refund_request_id
         and private.has_org_role(r.organization_id, array['owner', 'manager', 'finance']::public.org_role[])));
create policy "refund batches" on public.refund_batches for select to authenticated
  using (private.is_platform_admin() or private.has_org_role(private.event_org(event_id), array['owner', 'manager', 'finance']::public.org_role[]));
create policy "referral flags" on public.referral_flags for select to authenticated
  using (private.is_platform_admin() or exists (select 1 from public.promoter_enrollments en join public.referral_programs p on p.id = en.program_id
         where en.id = enrollment_id and private.has_org_role(p.organization_id, array['owner', 'manager']::public.org_role[])));

-- ===========================================================================
-- 7. Earnings & payouts
-- ===========================================================================
grant select on public.earnings_allocations to authenticated;
create policy "allocation read" on public.earnings_allocations for select to authenticated
  using (promoter_user_id = auth.uid() or private.is_platform_admin()
         or private.has_org_role(organization_id, array['owner', 'finance']::public.org_role[]));

grant select (id, beneficiary_kind, organization_id, user_id, bank_code, bank_name, account_name, account_last4, status,
  verified_at, created_at) on public.payout_recipients to authenticated;
create policy "recipient read" on public.payout_recipients for select to authenticated
  using (user_id = auth.uid() or private.is_platform_admin()
         or (organization_id is not null and private.has_org_role(organization_id, array['owner', 'finance']::public.org_role[])));

grant select on public.payout_requests to authenticated;
create policy "payout read" on public.payout_requests for select to authenticated
  using (user_id = auth.uid() or private.is_platform_admin()
         or (organization_id is not null and private.has_org_role(organization_id, array['owner', 'finance']::public.org_role[])));

-- ===========================================================================
-- 8. Referrals
-- ===========================================================================
grant select on public.organization_referral_defaults to authenticated;
grant insert, update (rate_bps, attribution_window_days, terms_text, enrollment_mode) on public.organization_referral_defaults to authenticated;
create policy "ref defaults read" on public.organization_referral_defaults for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));
create policy "ref defaults write" on public.organization_referral_defaults for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['owner', 'manager']::public.org_role[])
              and rate_bps <= private.setting_int('max_promoter_rate_bps', 3000));

grant select on public.referral_programs, public.referral_program_versions, public.promoter_enrollments,
  public.referral_links, public.order_attributions to authenticated;
create policy "program read" on public.referral_programs for select to authenticated
  using (private.is_org_member(organization_id) or private.is_platform_admin()
         or exists (select 1 from public.promoter_enrollments en where en.program_id = id and en.user_id = auth.uid()));
create policy "version read" on public.referral_program_versions for select to authenticated
  using (exists (select 1 from public.referral_programs p where p.id = program_id and (private.is_org_member(p.organization_id)
         or private.is_platform_admin() or exists (select 1 from public.promoter_enrollments en where en.program_id = p.id and en.user_id = auth.uid()))));
create policy "enrollment read" on public.promoter_enrollments for select to authenticated
  using (user_id = auth.uid() or private.is_platform_admin()
         or exists (select 1 from public.referral_programs p where p.id = program_id
                    and private.has_org_role(p.organization_id, array['owner', 'manager']::public.org_role[])));
create policy "link read" on public.referral_links for select to authenticated
  using (exists (select 1 from public.promoter_enrollments en join public.referral_programs p on p.id = en.program_id
         where en.id = enrollment_id and (en.user_id = auth.uid() or private.is_platform_admin()
           or private.has_org_role(p.organization_id, array['owner', 'manager']::public.org_role[]))));
create policy "attribution read" on public.order_attributions for select to authenticated
  using (private.is_platform_admin() or exists (select 1 from public.orders o where o.id = order_id
         and private.has_org_role(o.organization_id, array['owner', 'manager', 'finance']::public.org_role[])));

-- ===========================================================================
-- 9. Notifications
-- ===========================================================================
grant select, update (read_at) on public.notifications to authenticated;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifications update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- 10. RPC execute grants (everything else stays service_role only)
-- ===========================================================================
grant execute on function
  public.my_platform_roles(), public.create_organization(text, text, text, text, text, uuid),
  public.invite_member(uuid, text, public.org_role, text), public.accept_invitation(text), public.revoke_invitation(uuid),
  public.change_member_role(uuid, uuid, public.org_role), public.remove_member(uuid, uuid), public.org_members(uuid),
  public.assign_event_staff(uuid, uuid, boolean, boolean, boolean), public.unassign_event_staff(uuid, uuid),
  public.event_submit_for_review(uuid), public.admin_moderate_event(uuid, text, text),
  public.event_set_status(uuid, public.event_status, text), public.admin_feature_event(uuid, boolean, int),
  public.ticket_reissue(uuid, text),
  public.gate_check_in(uuid, text, text), public.gate_check_in_ticket(uuid, uuid, text), public.gate_reentry(uuid, uuid, text, text),
  public.gate_lookup(uuid, text), public.gate_event_stats(uuid), public.my_gate_events(),
  public.door_sale(uuid, jsonb, jsonb, text, text), public.issue_complimentary(uuid, uuid, int, jsonb, text, text),
  public.refund_request_create(uuid, jsonb, text, boolean), public.refund_review(uuid, boolean, text), public.refund_retry(uuid),
  public.cancel_event(uuid, text),
  public.payout_recipient_set(text, uuid, text, text, text, text), public.payout_recipient_mark_verified(uuid, text, text),
  public.payout_request(text, uuid, bigint, text), public.payout_transition(uuid, public.payout_status, text, text),
  public.record_provider_settlement(bigint, text, text),
  public.referral_program_upsert(uuid, int, uuid[], int, text, text, int, timestamptz, timestamptz),
  public.referral_program_set_status(uuid, text, text), public.promoter_apply(uuid, uuid, text),
  public.promoter_decide(uuid, text, text, int), public.promoter_dashboard(), public.link_my_orders(),
  public.org_event_summary(uuid), public.org_sales_series(uuid, uuid, int), public.org_balances(uuid),
  public.admin_update_organization(uuid, jsonb, text),
  public.admin_set_fee_policy(text, uuid, uuid, int, bigint, int, bigint, boolean, timestamptz, text),
  public.admin_set_setting(text, jsonb, text), public.admin_retry_job(bigint), public.admin_overview(timestamptz, timestamptz),
  public.admin_ledger(uuid, int), public.run_reconciliation()
to authenticated;
grant execute on function public.record_event_view(uuid) to anon, authenticated;

-- Helper functions used inside RLS policies must be executable by the querying role.
grant usage on schema private to authenticated, anon;
grant execute on function private.is_org_member(uuid), private.has_org_role(uuid, public.org_role[]),
  private.org_role_of(uuid), private.is_platform_admin(), private.has_platform_role(public.platform_role[]),
  private.event_org(uuid), private.org_is_active(uuid), private.can_read_order(uuid, uuid),
  private.setting_int(text, bigint), private.ticket_dependency_open(uuid)
to authenticated, anon;

-- ===========================================================================
-- 11. Storage: public event artwork; private organization documents.
-- Ticket PDFs are generated on demand and never stored in a public bucket.
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('event-media', 'event-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('org-logos', 'org-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('org-private', 'org-private', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Paths: {organization_id}/{...}. Writers must be owner/manager of that organization.
create policy "event media upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('event-media', 'org-logos')
    and private.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::public.org_role[]));
create policy "event media modify" on storage.objects for update to authenticated
  using (bucket_id in ('event-media', 'org-logos')
    and private.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::public.org_role[]));
create policy "event media delete" on storage.objects for delete to authenticated
  using (bucket_id in ('event-media', 'org-logos')
    and private.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::public.org_role[]));
create policy "org private read" on storage.objects for select to authenticated
  using (bucket_id = 'org-private'
    and (private.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'finance']::public.org_role[]) or private.is_platform_admin()));
create policy "org private write" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-private'
    and private.has_org_role(((storage.foldername(name))[1])::uuid, array['owner']::public.org_role[]));
