BEGIN;
-- No policy, price, model, entitlement or budget change. This private journal
-- belongs to one existing question reservation and is never shared as evidence.
CREATE TABLE public.companion_work_checkpoints (
  request_id uuid NOT NULL REFERENCES public.companion_question_requests(id) ON DELETE CASCADE,
  revision text NOT NULL CHECK(length(revision) BETWEEN 1 AND 100),
  key text NOT NULL CHECK(key ~ '^[a-f0-9]{64}:[0-9]{1,3}$'),
  value jsonb NOT NULL CHECK(jsonb_typeof(value)='object' AND value ? 'value' AND octet_length(value::text)<=131072),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  PRIMARY KEY(request_id,revision,key)
);
CREATE INDEX companion_work_expiry ON public.companion_work_checkpoints(expires_at);
ALTER TABLE public.companion_work_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_work_checkpoints FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.load_companion_work(p_user_id uuid,p_request_id uuid,p_attempt uuid,p_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM 1 FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id
    AND status='working' AND attempt=p_attempt AND lease_until>now() AND budget_block_reason IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive companion request'; END IF;
  DELETE FROM public.companion_work_checkpoints WHERE expires_at<=now();
  SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO result FROM public.companion_work_checkpoints
    WHERE request_id=p_request_id AND revision=p_revision;
  RETURN result;
END;
$$;
CREATE FUNCTION public.save_companion_work(p_user_id uuid,p_request_id uuid,p_attempt uuid,p_revision text,p_key text,p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id
    AND status='working' AND attempt=p_attempt AND lease_until>now() AND budget_block_reason IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.companion_work_checkpoints WHERE request_id=p_request_id)>=256 THEN
    RAISE EXCEPTION 'Companion checkpoint limit'; END IF;
  INSERT INTO public.companion_work_checkpoints(request_id,revision,key,value) VALUES(p_request_id,p_revision,p_key,p_value)
    ON CONFLICT(request_id,revision,key) DO NOTHING;
  RETURN true;
END;
$$;
CREATE FUNCTION public.clear_finished_companion_work()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('released','charged') THEN DELETE FROM public.companion_work_checkpoints WHERE request_id=NEW.id; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clear_finished_companion_work AFTER UPDATE OF status ON public.companion_question_requests
FOR EACH ROW EXECUTE FUNCTION public.clear_finished_companion_work();

-- If THIS worker's concurrent reservations temporarily occupy the remaining
-- money, wait for settlement rather than marking the question permanently
-- blocked. The existing atomic reservation function still decides admission.
CREATE FUNCTION public.try_reserve_companion_question_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_attempt uuid,p_micro_usd bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; policy public.companion_usage_policy; b public.companion_sol_budget;
  pending bigint; spent_month bigint; spent_day bigint;
  day_start timestamptz:=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_start timestamptz:=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_micro_usd IS NULL OR p_micro_usd<=0 OR p_micro_usd>5000000 OR p_call_id IS NULL THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
  SELECT * INTO b FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
  SELECT * INTO policy FROM public.companion_usage_policy WHERE id FOR SHARE;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id;
  IF NOT FOUND OR r.status<>'working' OR r.attempt IS DISTINCT FROM p_attempt OR r.lease_until<=now()
    OR r.budget_block_reason IS NOT NULL THEN RETURN 'denied'; END IF;
  SELECT coalesce(sum(c.reserved_micro_usd),0) INTO pending FROM public.companion_question_calls q
    JOIN public.companion_sol_calls c ON c.id=q.call_id WHERE q.request_id=p_request_id AND c.status='reserved';
  IF pending>0 AND b.enabled AND b.halted_reason IS NULL AND policy.enabled THEN
    SELECT coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)),0),
      coalesce(sum(coalesce(actual_micro_usd,reserved_micro_usd)) FILTER(WHERE created_at>=day_start),0)
      INTO spent_month,spent_day FROM public.companion_sol_calls WHERE user_id=p_user_id AND created_at>=month_start;
    IF r.committed_micro_usd+p_micro_usd>least(coalesce(r.spend_limit_micro_usd,policy.question_limit_micro_usd),policy.question_limit_micro_usd)
      OR b.committed_micro_usd+p_micro_usd>b.limit_micro_usd
      OR spent_month+p_micro_usd>policy.user_month_limit_micro_usd
      OR spent_day+p_micro_usd>policy.user_day_limit_micro_usd THEN RETURN 'wait'; END IF;
  END IF;
  RETURN CASE WHEN public.reserve_companion_question_call(p_call_id,p_user_id,p_request_id,p_attempt,p_micro_usd)
    THEN 'reserved' ELSE 'denied' END;
END;
$$;
REVOKE ALL ON FUNCTION public.load_companion_work(uuid,uuid,uuid,text),
  public.save_companion_work(uuid,uuid,uuid,text,text,jsonb),public.clear_finished_companion_work(),
  public.try_reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.load_companion_work(uuid,uuid,uuid,text),
  public.save_companion_work(uuid,uuid,uuid,text,text,jsonb),
  public.try_reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint) TO service_role;
COMMIT;
