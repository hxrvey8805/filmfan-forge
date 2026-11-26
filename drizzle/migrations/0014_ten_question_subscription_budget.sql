-- Ten questions and $4 per subscription month. No provider/model changes,
-- balance resets, sales activation, test-key funding or global-cap changes.
DO $preflight$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM '6c282d6ea85e94987a5c721ef9170c59'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.try_reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM '18ad54b3c50b984961068bbfd45a5119' THEN
    RAISE EXCEPTION 'Unexpected reservation RPCs; review before replacing';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.companion_allowance_for(uuid)'::regprocedure) IS DISTINCT FROM '3e55f5657c7fe70fdae6af3d2f219f1b' THEN
    RAISE EXCEPTION 'Unexpected allowance RPC; review before replacing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companion_usage_policy WHERE id
    AND user_month_limit_micro_usd IN (0,3000000) AND question_limit_micro_usd IN (0,350000)) THEN
    RAISE EXCEPTION 'Unexpected spending policy; review before changing';
  END IF;
END $preflight$;
ALTER TABLE public.companion_usage_policy ADD COLUMN subscription_budget_started_at timestamptz NOT NULL DEFAULT now();
UPDATE public.companion_usage_policy SET user_month_limit_micro_usd=4000000 WHERE id;
-- Existing private grants were authorised on top of $3, not the new $4.
-- Preserve their approved total and expiry rather than silently adding $1.
ALTER TABLE public.companion_private_test_budget_grants
  ADD COLUMN approved_base_micro_usd bigint NOT NULL DEFAULT 3000000
  CHECK(approved_base_micro_usd BETWEEN 0 AND 5000000);

CREATE FUNCTION public.companion_account_spending_window(p_user_id uuid)
RETURNS TABLE(period_start timestamptz,period_end timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a timestamptz; w record; cutover timestamptz;
BEGIN
  SELECT e.anchor INTO a FROM public.active_companion_entitlement(p_user_id) e;
  IF a IS NULL THEN
    -- Retain the original anniversary after expiry/refund; cancellation and
    -- future pack use must not manufacture a second spending allowance.
    SELECT e.anchor INTO a FROM public.companion_pro_entitlements e WHERE e.user_id=p_user_id;
  END IF;
  IF a IS NOT NULL AND a<=now() THEN
    SELECT * INTO w FROM public.companion_month_window(a,now());
    period_start:=w.period_start; period_end:=w.period_end;
  ELSE
    -- Retain an unexpired former private/reviewer question period as well.
    SELECT q.period_start,q.period_end INTO period_start,period_end
      FROM public.companion_question_requests q WHERE q.user_id=p_user_id AND q.source='monthly'
        AND q.period_start<=now() AND q.period_end>now() ORDER BY q.period_start DESC LIMIT 1;
    IF period_start IS NULL THEN
      period_start:=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
      period_end:=period_start+interval '1 month';
    END IF;
  END IF;
  SELECT p.subscription_budget_started_at INTO cutover FROM public.companion_usage_policy p WHERE p.id;
  -- During the first migrated period, retain the old calendar-month costs too.
  -- At the next anniversary both balances reset together, without erasing calls.
  IF period_start<cutover THEN
    period_start:=least(period_start,date_trunc('month',cutover AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  END IF;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.companion_account_spending_window(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.companion_account_spending_limit(p_user_id uuid,p_base bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT greatest(p_base,coalesce((SELECT g.approved_base_micro_usd+g.additional_micro_usd
    FROM public.companion_private_test_budget_grants g WHERE g.user_id=p_user_id
      AND g.month_start=date_trunc('month',now() AT TIME ZONE 'UTC')::date
      AND NOT g.revoked AND g.starts_at<=now() AND g.expires_at>now()),p_base));
$$;
REVOKE ALL ON FUNCTION public.companion_account_spending_limit(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.companion_allowance_for(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; w record; renewal timestamptz; included integer := 0; packs bigint; held bigint;
BEGIN
  IF NOT public.companion_usage_enabled() THEN
    RETURN jsonb_build_object('mode','beta');
  END IF;
  SELECT * INTO e FROM public.active_companion_entitlement(p_user_id);
  IF FOUND THEN
    SELECT * INTO w FROM public.companion_month_window(e.anchor, now());
    renewal := least(w.period_end,e.valid_until);
    SELECT greatest(0,10-count(*))::integer INTO included FROM public.companion_question_requests
      WHERE user_id=p_user_id AND source='monthly' AND period_start=w.period_start
      AND (status='charged' OR (status IN ('working','paused') AND lease_until>now()));
  END IF;
  SELECT count(*) INTO held FROM public.companion_question_requests WHERE user_id=p_user_id
    AND source='pack' AND status IN ('working','paused') AND lease_until>now();
  SELECT greatest(0,pack_questions-held) INTO packs FROM public.companion_usage_accounts WHERE user_id=p_user_id;
  RETURN jsonb_build_object('mode','monthly','plan',coalesce(e.plan,'free'),'included',included,
    'limit',CASE WHEN e.user_id IS NULL THEN 0 ELSE 10 END,'purchased',coalesce(packs,0),
    'renewsAt',renewal);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_companion_question_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_attempt uuid,p_micro_usd bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; policy public.companion_usage_policy;
  month_spent bigint; day_spent bigint; calls integer; reason text;
  day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_boundary timestamptz; month_end timestamptz;
BEGIN
  IF p_call_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL OR p_attempt IS NULL
    OR p_micro_usd IS NULL OR p_micro_usd<=0 OR p_micro_usd>5000000 THEN
    RAISE EXCEPTION 'Invalid companion reservation';
  END IF;
  -- Same lock order as settlement. All instances share these database locks.
  PERFORM 1 FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
  SELECT * INTO policy FROM public.companion_usage_policy WHERE id FOR SHARE;
  IF NOT FOUND OR NOT policy.enabled THEN RETURN false; END IF;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id;
  IF NOT FOUND OR r.status<>'working' OR r.attempt IS DISTINCT FROM p_attempt
    OR r.lease_until<=now() OR r.budget_block_reason IS NOT NULL THEN RETURN false; END IF;
  IF r.source='monthly' AND (r.period_end<=now() OR NOT EXISTS(
    SELECT 1 FROM public.active_companion_entitlement(p_user_id) e
      CROSS JOIN LATERAL public.companion_month_window(e.anchor,now()) w
    WHERE w.period_start=r.period_start AND e.valid_until>now())) THEN RETURN false; END IF;
  SELECT w.period_start,w.period_end INTO month_boundary,month_end
    FROM public.companion_account_spending_window(p_user_id) w;
  policy.user_month_limit_micro_usd:=public.companion_account_spending_limit(p_user_id,policy.user_month_limit_micro_usd);

  -- These are account-wide costs, including failed attempts, uncharged answers,
  -- purchased questions, old beta requests and unresolved provider calls.
  SELECT coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER(WHERE created_at>=month_boundary AND created_at<month_end),0),
    coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER (WHERE created_at>=day_start),0)
    INTO month_spent,day_spent FROM public.companion_sol_calls
    WHERE user_id=p_user_id AND created_at>=least(month_boundary,day_start);
  SELECT count(*) INTO calls FROM public.companion_question_calls WHERE request_id=p_request_id;
  IF EXISTS(SELECT 1 FROM public.companion_sol_calls WHERE id=p_call_id) THEN reason:='duplicate_call';
  ELSIF r.committed_micro_usd+p_micro_usd>least(coalesce(r.spend_limit_micro_usd,policy.question_limit_micro_usd),policy.question_limit_micro_usd)
    THEN reason:='question_limit';
  ELSIF calls>=least(coalesce(r.provider_call_limit,policy.question_call_limit),policy.question_call_limit)
    THEN reason:='call_limit';
  ELSIF policy.user_day_limit_micro_usd IS NOT NULL AND day_spent+p_micro_usd>policy.user_day_limit_micro_usd
    THEN reason:='user_day_limit';
  ELSIF month_spent+p_micro_usd>policy.user_month_limit_micro_usd THEN reason:='user_month_limit';
  END IF;
  IF reason IS NULL AND NOT public.reserve_companion_sol_call_legacy(p_call_id,p_user_id,p_request_id,p_micro_usd)
    THEN reason:='platform_budget'; END IF;
  IF reason IS NOT NULL THEN
    UPDATE public.companion_question_requests SET budget_block_reason=reason WHERE id=p_request_id;
    RETURN false;
  END IF;
  INSERT INTO public.companion_question_calls(call_id,request_id) VALUES(p_call_id,p_request_id);
  UPDATE public.companion_question_requests SET committed_micro_usd=committed_micro_usd+p_micro_usd,
    spend_limit_micro_usd=least(coalesce(spend_limit_micro_usd,policy.question_limit_micro_usd),policy.question_limit_micro_usd),
    provider_call_limit=least(coalesce(provider_call_limit,policy.question_call_limit),policy.question_call_limit)
    WHERE id=p_request_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_reserve_companion_question_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_attempt uuid,p_micro_usd bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; policy public.companion_usage_policy; b public.companion_sol_budget;
  pending bigint; spent_month bigint; spent_day bigint;
  day_start timestamptz:=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_boundary timestamptz; month_end timestamptz;
BEGIN
  IF p_micro_usd IS NULL OR p_micro_usd<=0 OR p_micro_usd>5000000 OR p_call_id IS NULL THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
  SELECT * INTO b FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
  SELECT * INTO policy FROM public.companion_usage_policy WHERE id FOR SHARE;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id;
  IF NOT FOUND OR r.status<>'working' OR r.attempt IS DISTINCT FROM p_attempt OR r.lease_until<=now()
    OR r.budget_block_reason IS NOT NULL THEN RETURN 'denied'; END IF;
  IF r.source='monthly' AND (r.period_end<=now() OR NOT EXISTS(
    SELECT 1 FROM public.active_companion_entitlement(p_user_id) e
      CROSS JOIN LATERAL public.companion_month_window(e.anchor,now()) w
    WHERE w.period_start=r.period_start AND e.valid_until>now())) THEN RETURN 'denied'; END IF;
  SELECT w.period_start,w.period_end INTO month_boundary,month_end
    FROM public.companion_account_spending_window(p_user_id) w;
  policy.user_month_limit_micro_usd:=public.companion_account_spending_limit(p_user_id,policy.user_month_limit_micro_usd);

  SELECT coalesce(sum(c.reserved_micro_usd),0) INTO pending FROM public.companion_question_calls q
    JOIN public.companion_sol_calls c ON c.id=q.call_id WHERE q.request_id=p_request_id AND c.status='reserved';
  IF pending>0 AND b.enabled AND b.halted_reason IS NULL AND policy.enabled THEN
    SELECT coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER(WHERE created_at>=month_boundary AND created_at<month_end),0),
      coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER(WHERE created_at>=day_start),0)
      INTO spent_month,spent_day FROM public.companion_sol_calls WHERE user_id=p_user_id AND created_at>=least(month_boundary,day_start);
    IF r.committed_micro_usd+p_micro_usd>least(coalesce(r.spend_limit_micro_usd,policy.question_limit_micro_usd),policy.question_limit_micro_usd)
      OR b.committed_micro_usd+p_micro_usd>b.limit_micro_usd
      OR spent_month+p_micro_usd>policy.user_month_limit_micro_usd
      OR spent_day+p_micro_usd>policy.user_day_limit_micro_usd THEN RETURN 'wait'; END IF;
  END IF;
  RETURN CASE WHEN public.reserve_companion_question_call(p_call_id,p_user_id,p_request_id,p_attempt,p_micro_usd)
    THEN 'reserved' ELSE 'denied' END;
END;
$$;

-- CREATE OR REPLACE preserves the existing service-role-only RPC grants.