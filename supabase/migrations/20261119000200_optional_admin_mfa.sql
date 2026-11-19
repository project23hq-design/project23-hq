-- Two-factor authentication is no longer mandatory for platform staff.
--
-- Before: a platform role only counted with an MFA-verified (aal2) session.
-- Now:    "MFA if enrolled". Staff without an authenticator app act on a password session;
--         staff who HAVE enrolled one must still verify it (aal2), so turning MFA on keeps
--         protecting that account and a stolen password alone can't bypass it.
--
-- Every function that checks platform roles (is_platform_admin, has_platform_role and the
-- RLS policies built on them) picks this up, because they all go through this function.

create or replace function private.has_platform_role(roles public.platform_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_role_assignments a
    where a.user_id = auth.uid()
      and a.revoked_at is null
      and (roles is null or a.role = any(roles) or a.role = 'super_admin')
  ) and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  );
$$;
