-- Deterministic local/test payment provider state. Used only when PAYMENT_PROVIDER=test
-- (refused by the app when APP_ENV=production). Lives in the non-exposed private schema.
create table private.test_provider_transactions (
  reference text primary key,
  amount_minor bigint not null,
  currency char(3) not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  transaction_id text not null default 'test_' || replace(gen_random_uuid()::text, '-', ''),
  refunded_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.test_provider_upsert(p_reference text, p_amount bigint, p_currency text, p_email text, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t private.test_provider_transactions;
begin
  perform private.require_service();
  insert into private.test_provider_transactions (reference, amount_minor, currency, email, status)
  values (p_reference, p_amount, p_currency, p_email, coalesce(p_status, 'pending'))
  on conflict (reference) do update set status = coalesce(p_status, private.test_provider_transactions.status), updated_at = now()
  returning * into t;
  return to_jsonb(t);
end $$;

create or replace function public.test_provider_get(p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_service();
  return (select to_jsonb(t) from private.test_provider_transactions t where reference = p_reference);
end $$;

create or replace function public.test_provider_refund(p_reference text, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t private.test_provider_transactions;
begin
  perform private.require_service();
  update private.test_provider_transactions set refunded_minor = refunded_minor + p_amount, updated_at = now()
  where reference = p_reference and status = 'success' and refunded_minor + p_amount <= amount_minor
  returning * into t;
  if not found then perform private.fail('refund_not_possible'); end if;
  return to_jsonb(t);
end $$;

revoke execute on function public.test_provider_upsert(text, bigint, text, text, text), public.test_provider_get(text),
  public.test_provider_refund(text, bigint) from public, anon, authenticated;
grant execute on function public.test_provider_upsert(text, bigint, text, text, text), public.test_provider_get(text),
  public.test_provider_refund(text, bigint) to service_role;
grant all on private.test_provider_transactions to service_role;
