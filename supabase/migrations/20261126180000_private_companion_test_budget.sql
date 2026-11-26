-- Refuse to overwrite unreviewed changes to the two existing reservation RPCs.
DO $preflight$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM 'a23673b3353fd7b191e126d15447e3e1' THEN
    RAISE EXCEPTION 'Unexpected existing reserve_companion_question_call; review before replacing';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.try_reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM 'aabf866d5a8d513b5d640f77bfa46c0e' THEN
    RAISE EXCEPTION 'Unexpected existing try_reserve_companion_question_call; review before replacing';
  END IF;
END $preflight$;

-- Apply atomically in the transactional migration runner. Creates no grants
-- and changes no shared policy, paid balance, unknown hold or AI configuration.
CREATE TABLE public.companion_private_test_budget_grants (
  user_id uuid NOT NULL REFERENCES public.companion_usage_accounts(user_id) ON DELETE CASCADE,
  month_start date NOT NULL CHECK (isfinite(month_start) AND extract(day FROM month_start)=1),
  additional_micro_usd bigint NOT NULL CHECK (additional_micro_usd BETWEEN 1 AND 2000000),
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at>starts_at
    AND expires_at<=starts_at+interval '24 hours'),
  revoked boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  PRIMARY KEY(user_id,month_start)
);
ALTER TABLE public.companion_private_test_budget_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_private_test_budget_grants FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.companion_private_test_budget_grants IS
  'Operator-only test allowance, at most $2 per account/UTC month, expires within 24 hours. No renewal or customer write API.';

CREATE OR REPLACE FUNCTION public.reserve_companion_question_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_attempt uuid,p_micro_usd bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; policy public.companion_usage_policy;
  month_spent bigint; day_spent bigint; calls integer; reason text;
  day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_boundary timestamptz := date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
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
  -- Only an explicit, operator-issued, unexpired grant for this UTC month
  -- changes this account's local ceiling. All policy rows remain unchanged.
  policy.user_month_limit_micro_usd := policy.user_month_limit_micro_usd + coalesce((
    SELECT g.additional_micro_usd FROM public.companion_private_test_budget_grants g
    WHERE g.user_id=p_user_id AND g.month_start=(month_boundary AT TIME ZONE 'UTC')::date
      AND NOT g.revoked AND g.starts_at<=now() AND g.expires_at>now()
  ),0);
  -- These are account-wide costs, including failed attempts, uncharged answers,
  -- purchased questions, old beta requests and unresolved provider calls.
  SELECT coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0),
    coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER (WHERE created_at>=day_start),0)
    INTO month_spent,day_spent FROM public.companion_sol_calls
    WHERE user_id=p_user_id AND created_at>=month_boundary;
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
  month_boundary timestamptz:=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_micro_usd IS NULL OR p_micro_usd<=0 OR p_micro_usd>5000000 OR p_call_id IS NULL THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
  SELECT * INTO b FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
  SELECT * INTO policy FROM public.companion_usage_policy WHERE id FOR SHARE;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id;
  IF NOT FOUND OR r.status<>'working' OR r.attempt IS DISTINCT FROM p_attempt OR r.lease_until<=now()
    OR r.budget_block_reason IS NOT NULL THEN RETURN 'denied'; END IF;
  -- Only an explicit, operator-issued, unexpired grant for this UTC month
  -- changes this account's local ceiling. All policy rows remain unchanged.
  policy.user_month_limit_micro_usd := policy.user_month_limit_micro_usd + coalesce((
    SELECT g.additional_micro_usd FROM public.companion_private_test_budget_grants g
    WHERE g.user_id=p_user_id AND g.month_start=(month_boundary AT TIME ZONE 'UTC')::date
      AND NOT g.revoked AND g.starts_at<=now() AND g.expires_at>now()
  ),0);
  SELECT coalesce(sum(c.reserved_micro_usd),0) INTO pending FROM public.companion_question_calls q
    JOIN public.companion_sol_calls c ON c.id=q.call_id WHERE q.request_id=p_request_id AND c.status='reserved';
  IF pending>0 AND b.enabled AND b.halted_reason IS NULL AND policy.enabled THEN
    SELECT coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0),
      coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER(WHERE created_at>=day_start),0)
      INTO spent_month,spent_day FROM public.companion_sol_calls WHERE user_id=p_user_id AND created_at>=month_boundary;
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
