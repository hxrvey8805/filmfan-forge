BEGIN;
-- Staged, not activated or funded. Keep the existing $5 platform ceiling.
-- Money is attributed to when each provider call starts, not the month in
-- which a potentially long-running recap first created its request.
ALTER TABLE public.companion_usage_policy
  ADD COLUMN user_day_limit_micro_usd bigint CHECK (user_day_limit_micro_usd BETWEEN 1 AND 5000000),
  ADD COLUMN question_call_limit integer NOT NULL DEFAULT 64 CHECK (question_call_limit BETWEEN 1 AND 256),
  ADD CONSTRAINT companion_daily_limit_within_month CHECK
    (user_day_limit_micro_usd IS NULL OR
      (user_day_limit_micro_usd >= question_limit_micro_usd AND user_day_limit_micro_usd <= user_month_limit_micro_usd));

ALTER TABLE public.companion_question_requests
  ADD COLUMN spend_limit_micro_usd bigint CHECK (spend_limit_micro_usd BETWEEN 1 AND 5000000),
  ADD COLUMN provider_call_limit integer CHECK (provider_call_limit BETWEEN 1 AND 256),
  ADD COLUMN budget_block_reason text CHECK (budget_block_reason IN
    ('question_limit','call_limit','user_day_limit','user_month_limit','platform_budget','duplicate_call'));
CREATE INDEX companion_sol_calls_user_created ON public.companion_sol_calls(user_id,created_at);

-- Capture a question's original limits. Pausing/resuming or changing policy
-- cannot give the same question a fresh allowance or increase its ceiling.
ALTER FUNCTION public.begin_companion_question(uuid,uuid,uuid,jsonb) RENAME TO begin_companion_question_before_spending;
CREATE FUNCTION public.begin_companion_question(p_user_id uuid,p_request_id uuid,p_attempt uuid,p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; policy public.companion_usage_policy;
BEGIN
  result := public.begin_companion_question_before_spending(p_user_id,p_request_id,p_attempt,p_scope);
  IF result->>'mode' IS DISTINCT FROM 'monthly' THEN RETURN result; END IF;
  SELECT * INTO policy FROM public.companion_usage_policy WHERE id;
  UPDATE public.companion_question_requests SET
    spend_limit_micro_usd=least(coalesce(spend_limit_micro_usd,policy.question_limit_micro_usd),policy.question_limit_micro_usd),
    provider_call_limit=least(coalesce(provider_call_limit,policy.question_call_limit),policy.question_call_limit)
    WHERE id=p_request_id AND user_id=p_user_id;
  -- Check money when a provider call is requested. A safe stored answer that
  -- needs no AI call must not require any remaining inference budget.
  IF EXISTS(SELECT 1 FROM public.companion_question_requests
    WHERE id=p_request_id AND budget_block_reason IS NOT NULL) THEN
    UPDATE public.companion_question_requests SET status='released' WHERE id=p_request_id;
    RETURN jsonb_build_object('error','question_budget_unavailable');
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_companion_question_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_attempt uuid,p_micro_usd bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; policy public.companion_usage_policy;
  month_spent bigint; day_spent bigint; calls integer; reason text;
  day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_start timestamptz := date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
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
  -- These are account-wide costs, including failed attempts, uncharged answers,
  -- purchased questions, old beta requests and unresolved provider calls.
  SELECT coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0),
    coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER (WHERE created_at>=day_start),0)
    INTO month_spent,day_spent FROM public.companion_sol_calls
    WHERE user_id=p_user_id AND created_at>=month_start;
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

CREATE OR REPLACE FUNCTION public.end_companion_question_attempt(p_user_id uuid,p_request_id uuid,p_attempt uuid,p_pause boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  UPDATE public.companion_question_requests SET status=CASE
    WHEN p_pause AND budget_block_reason IS NULL THEN 'paused' ELSE 'released' END
    WHERE id=p_request_id AND user_id=p_user_id AND attempt=p_attempt AND status='working';
  RETURN FOUND;
END;
$$;

-- A worker cannot swallow a budget failure and publish a partial draft as a
-- successful answer, even if its in-memory flag was lost on a continuation.
ALTER FUNCTION public.finish_companion_question(uuid,uuid,jsonb,boolean) RENAME TO finish_companion_question_before_spending;
CREATE FUNCTION public.finish_companion_question(p_user_id uuid,p_attempt uuid,p_conversation jsonb,p_charge boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.companion_question_requests WHERE id=(p_conversation->>'id')::uuid
    AND user_id=p_user_id AND budget_block_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'Question budget unavailable';
  END IF;
  RETURN public.finish_companion_question_before_spending(p_user_id,p_attempt,p_conversation,p_charge);
END;
$$;

-- Operator-only cost reporting. No prompts, captions, questions, answers,
-- provider credentials or stored conversation memory are included.
CREATE VIEW public.companion_spending_daily AS
SELECT (created_at AT TIME ZONE 'UTC')::date AS day,user_id,count(*) AS provider_calls,
  coalesce(sum(actual_micro_usd),0)::bigint AS known_micro_usd,
  coalesce(sum(reserved_micro_usd) FILTER (WHERE actual_micro_usd IS NULL),0)::bigint AS unresolved_micro_usd,
  coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0)::bigint AS committed_micro_usd,
  count(*) FILTER (WHERE status='unknown') AS unknown_calls
FROM public.companion_sol_calls GROUP BY 1,2;
CREATE VIEW public.companion_spending_questions AS
SELECT r.id AS request_id,r.user_id,r.created_at,r.source,r.status,r.budget_block_reason,
  r.spend_limit_micro_usd,r.provider_call_limit,count(c.id) AS provider_calls,
  coalesce(sum(c.actual_micro_usd),0)::bigint AS known_micro_usd,
  coalesce(sum(c.reserved_micro_usd) FILTER (WHERE c.actual_micro_usd IS NULL),0)::bigint AS unresolved_micro_usd,
  r.committed_micro_usd
FROM public.companion_question_requests r
LEFT JOIN public.companion_question_calls qc ON qc.request_id=r.id
LEFT JOIN public.companion_sol_calls c ON c.id=qc.call_id GROUP BY r.id;
REVOKE ALL ON public.companion_spending_daily,public.companion_spending_questions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.companion_spending_daily,public.companion_spending_questions TO service_role;
REVOKE ALL ON FUNCTION public.begin_companion_question_before_spending(uuid,uuid,uuid,jsonb),
  public.finish_companion_question_before_spending(uuid,uuid,jsonb,boolean),
  public.begin_companion_question(uuid,uuid,uuid,jsonb),public.finish_companion_question(uuid,uuid,jsonb,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_companion_question(uuid,uuid,uuid,jsonb),
  public.finish_companion_question(uuid,uuid,jsonb,boolean) TO service_role;
COMMIT;
