-- Events go live as soon as the organizer publishes them: no platform review queue.
-- Publishing still runs the completeness checks (description, future start, venue + city,
-- category, an active ticket type) and still requires an active, non-blocked organization.
-- Admins keep their take-down levers: pause (event_set_status), cancel + refund, and
-- blocking or suspending the organization.

create or replace function private.event_transition_allowed(f public.event_status, t public.event_status)
returns boolean language sql immutable set search_path = '' as $$
  select (f, t) in (
    ('draft', 'published'), ('draft', 'archived'),
    ('pending_review', 'draft'), ('pending_review', 'published'),
    ('published', 'paused'), ('published', 'cancelled'), ('published', 'completed'),
    ('paused', 'published'), ('paused', 'cancelled'), ('paused', 'completed'),
    ('cancelled', 'archived'), ('completed', 'archived')
  );
$$;

drop function if exists public.event_submit_for_review(uuid);
drop function if exists public.admin_moderate_event(uuid, text, text);

create or replace function public.event_publish(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_problems text[] := '{}';
begin
  select * into ev from public.events where id = p_event for update;
  if not private.has_org_role(ev.organization_id, array['owner', 'manager']::public.org_role[]) then perform private.fail('forbidden'); end if;
  if not private.org_is_active(ev.organization_id) then perform private.fail('organizer_suspended'); end if;
  if not exists (select 1 from public.organizations where id = ev.organization_id and approval_status = 'approved') then
    perform private.fail('organization_not_approved');
  end if;
  if ev.status <> 'draft' then perform private.fail('invalid_transition'); end if;
  if coalesce(length(ev.description_html), 0) < 20 then v_problems := array_append(v_problems, 'description'); end if;
  if ev.starts_at <= now() then v_problems := array_append(v_problems, 'starts_at'); end if;
  if ev.format <> 'online' and (ev.venue_name is null or ev.city_id is null) then v_problems := array_append(v_problems, 'venue'); end if;
  if ev.category_id is null then v_problems := array_append(v_problems, 'category'); end if;
  if not exists (select 1 from public.ticket_types where event_id = ev.id and is_active and quantity_total > 0) then
    v_problems := array_append(v_problems, 'ticket_types');
  end if;
  if cardinality(v_problems) > 0 then perform private.fail('event_incomplete', array_to_string(v_problems, ',')); end if;
  perform private.begin_internal();
  update public.events set status = 'published', moderation_status = 'approved', moderation_notes = null,
    published_at = coalesce(published_at, now()) where id = ev.id;
  perform private.audit('event.publish', 'event', ev.id::text, ev.organization_id);
end $$;
revoke all on function public.event_publish(uuid) from public, anon;
grant execute on function public.event_publish(uuid) to authenticated;

-- Anything left in the old review queue goes live now.
update public.events set status = 'published', moderation_status = 'approved',
  published_at = coalesce(published_at, now())
where status = 'pending_review';
