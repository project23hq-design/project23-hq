-- Structural security invariants (run: pnpm test:db). Behavioural RLS/concurrency tests live in tests/integration.
begin;
select plan(7);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'every public table has row level security enabled');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), 0,
  'anonymous role has no write grants on any public table');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and table_name in ('orders', 'order_items', 'tickets', 'ledger_entries', 'ledger_transactions', 'ledger_accounts',
                         'payment_attempts', 'earnings_allocations', 'payout_requests', 'platform_role_assignments', 'audit_logs', 'fee_policies')), 0,
  'clients cannot write orders, tickets, money, roles, fees or audit records directly');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'every SECURITY DEFINER function pins its search_path');

select ok(
  not has_function_privilege('authenticated', 'public.payment_confirm(text, text, bigint, text, text, bigint, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.checkout_create_order(uuid, jsonb, jsonb, text, text, jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.release_matured_earnings(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.jobs_claim(text, int)', 'execute'),
  'payment, checkout, maturity and job RPCs are service-role only');

select ok(
  not has_table_privilege('authenticated', 'private.payout_recipient_secrets', 'select')
  and not has_table_privilege('anon', 'private.payout_recipient_secrets', 'select'),
  'full bank account numbers are unreadable by clients');

select is(
  (select count(*)::int from pg_trigger where tgname in ('ledger_entries_append_only', 'audit_logs_append_only', 'ledger_entries_balanced', 'fee_policies_append_only')), 4,
  'ledger, audit and fee history are append-only and balance-checked');

select * from finish();
rollback;
