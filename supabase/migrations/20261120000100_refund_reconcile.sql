-- Re-check in-flight refunds with the payment provider.
--
-- Paystack usually confirms a refund days after it is requested, by webhook. Its refund
-- webhooks carry no refund id, so the app now re-fetches each open refund from the provider
-- (`refund.reconcile` job). This sweep queues that check hourly for any refund still
-- "processing" after 30 minutes, so a missed or failed webhook can't leave a refund stuck.
--
-- Same as the previous run_maintenance, plus the refund loop.

create or replace function public.run_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_exp int; v_rel int; v_comp int; r text; v_rf uuid;
begin
  perform private.require_service();
  v_exp := public.expire_holds(500);
  v_rel := public.release_matured_earnings(500);
  v_comp := public.complete_past_events();
  -- queue provider verification for stale attempts (reconciliation)
  for r in select reference from public.payment_attempts where status = 'initialized'
           and created_at < now() - interval '15 minutes' and created_at > now() - interval '2 days' loop
    insert into public.outbox_jobs (kind, payload, dedupe_key, run_after)
    values ('payment.reconcile', jsonb_build_object('reference', r), 'payment.reconcile:' || r || ':' || to_char(now(), 'YYYYMMDDHH24'), now())
    on conflict do nothing;
  end loop;
  -- queue provider checks for refunds still waiting on the provider (hourly per refund)
  for v_rf in select rr.id from public.refund_requests rr
              where rr.status = 'processing'
                and exists (select 1 from public.refund_attempts a
                            where a.refund_request_id = rr.id and a.provider_refund_id is not null
                              and a.status in ('pending', 'processing')
                              and a.updated_at < now() - interval '30 minutes')
                and rr.created_at > now() - interval '60 days'
              limit 200 loop
    insert into public.outbox_jobs (kind, payload, dedupe_key, run_after)
    values ('refund.reconcile', jsonb_build_object('refund_id', v_rf), 'refund.reconcile:' || v_rf || ':' || to_char(now(), 'YYYYMMDDHH24'), now())
    on conflict do nothing;
  end loop;
  delete from private.rate_limits where window_start < now() - interval '1 day';
  delete from public.referral_visits where visited_at < now() - interval '90 days';
  return jsonb_build_object('expired_holds', v_exp, 'released_allocations', v_rel, 'completed_events', v_comp);
end $$;
