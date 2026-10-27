-- Ticket types available to gate staff for door sales / complimentary issue.
create or replace function public.gate_ticket_types(p_event uuid)
returns table (id uuid, name text, kind public.ticket_kind, price_minor bigint, remaining int, admissions_per_unit int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (
       exists (select 1 from public.event_staff s where s.event_id = p_event and s.user_id = auth.uid() and (s.can_door_sell or s.can_issue_comps))
       or private.has_org_role(private.event_org(p_event), array['owner', 'manager']::public.org_role[])) then
    perform private.fail('forbidden');
  end if;
  return query select t.id, t.name, t.kind, t.price_minor, (t.quantity_total - t.units_sold - t.units_held), t.admissions_per_unit
    from public.ticket_types t where t.event_id = p_event and t.is_active order by t.sort_order;
end $$;
revoke execute on function public.gate_ticket_types(uuid) from public, anon;
grant execute on function public.gate_ticket_types(uuid) to authenticated, service_role;
