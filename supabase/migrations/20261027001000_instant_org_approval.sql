-- Organizations are approved the moment they are created: no platform review before an
-- organizer can build and submit events. Admins can still set approval_status = 'rejected'
-- (or suspend) to block an organization; verification and payout eligibility stay separate.
alter table public.organizations alter column approval_status set default 'approved';

create or replace function private.guard_org_platform_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_internal() then return new; end if;
  if tg_op = 'INSERT' then
    if new.is_first_party or new.approval_status <> 'approved' or new.verification_status <> 'unverified'
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

-- Anyone still waiting under the old rule is approved now.
update public.organizations set approval_status = 'approved' where approval_status = 'pending';
