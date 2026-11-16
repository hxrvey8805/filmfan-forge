BEGIN;
-- Preserve the owner-only bridge until this migration can replace it atomically.
DO $retire$ BEGIN
  IF obj_description(to_regprocedure('public.get_cinegeek_access()'),'pg_proc')='cinegeek-private-monthly-bridge-v1'
    AND obj_description(to_regprocedure('public.get_companion_allowance()'),'pg_proc')='cinegeek-private-monthly-bridge-v1' THEN
    DROP FUNCTION public.get_cinegeek_access();
    DROP FUNCTION public.get_companion_allowance();
  ELSIF to_regprocedure('public.get_cinegeek_access()') IS NOT NULL
    OR to_regprocedure('public.get_companion_allowance()') IS NOT NULL THEN
    RAISE EXCEPTION 'Full or unexpected access RPCs exist; do not replace them';
  END IF;
END $retire$;

-- Staged only: no subscriber is created, purchase enabled, beta allowance
-- changed or money added. An operator must choose monetary limits and connect
-- verified StoreKit entitlements before enabling this policy.
CREATE TABLE public.companion_usage_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  question_limit_micro_usd bigint NOT NULL DEFAULT 0 CHECK (question_limit_micro_usd BETWEEN 0 AND 5000000),
  user_month_limit_micro_usd bigint NOT NULL DEFAULT 0 CHECK (user_month_limit_micro_usd BETWEEN 0 AND 5000000),
  CHECK (NOT enabled OR (question_limit_micro_usd > 0 AND user_month_limit_micro_usd >= question_limit_micro_usd))
);
INSERT INTO public.companion_usage_policy(id) VALUES (true);

-- Only a trusted receipt/webhook verifier may write these. Never populate from
-- a selected plan, a client receipt payload without verification, or metadata.
CREATE TABLE public.companion_pro_entitlements (
  user_id uuid PRIMARY KEY,
  plan text NOT NULL CHECK (plan IN ('monthly','annual')),
  anchor timestamptz NOT NULL,
  valid_until timestamptz NOT NULL CHECK (valid_until > anchor),
  revoked boolean NOT NULL DEFAULT false,
  verified_transaction_id text NOT NULL UNIQUE CHECK (length(verified_transaction_id) BETWEEN 1 AND 200)
);
CREATE TABLE public.companion_usage_accounts (
  user_id uuid PRIMARY KEY,
  pack_questions bigint NOT NULL DEFAULT 0 CHECK (pack_questions >= 0)
);
CREATE TABLE public.companion_question_packs (
  transaction_id text PRIMARY KEY CHECK (length(transaction_id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL,
  questions integer NOT NULL CHECK (questions BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.companion_question_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.companion_usage_accounts(user_id),
  scope jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('monthly','pack')),
  period_start timestamptz,
  period_end timestamptz,
  status text NOT NULL CHECK (status IN ('working','paused','charged','released')),
  attempt uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  budget_month date NOT NULL,
  committed_micro_usd bigint NOT NULL DEFAULT 0 CHECK (committed_micro_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> 'monthly' OR (period_start IS NOT NULL AND period_end > period_start))
);
CREATE INDEX companion_question_requests_user ON public.companion_question_requests(user_id, budget_month);
CREATE TABLE public.companion_question_calls (
  call_id uuid PRIMARY KEY REFERENCES public.companion_sol_calls(id),
  request_id uuid NOT NULL REFERENCES public.companion_question_requests(id)
);
ALTER TABLE public.companion_usage_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_pro_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_usage_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_question_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_question_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_question_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_usage_policy, public.companion_pro_entitlements,
  public.companion_usage_accounts, public.companion_question_packs,
  public.companion_question_requests, public.companion_question_calls FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.companion_pro_entitlements TO service_role;

CREATE FUNCTION public.companion_usage_enabled()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enabled boolean;
BEGIN
  SELECT p.enabled INTO enabled FROM public.companion_usage_policy p WHERE id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question policy unavailable'; END IF;
  RETURN enabled;
END;
$$;

-- Always calculate from the original anchor: Jan 31 -> Feb 28 -> Mar 31.
-- UTC avoids daylight-saving drift. Annual plans receive twelve monthly
-- buckets, not 180 questions up front. Unused included questions do not roll.
CREATE FUNCTION public.companion_month_window(p_anchor timestamptz, p_now timestamptz)
RETURNS TABLE(period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql IMMUTABLE SET search_path = public SET timezone = 'UTC' AS $$
DECLARE n integer;
BEGIN
  n := (extract(year FROM p_now)::integer - extract(year FROM p_anchor)::integer) * 12
    + extract(month FROM p_now)::integer - extract(month FROM p_anchor)::integer;
  IF p_anchor + make_interval(months => n) > p_now THEN n := n - 1; END IF;
  RETURN QUERY SELECT p_anchor + make_interval(months => n), p_anchor + make_interval(months => n + 1);
END;
$$;

CREATE FUNCTION public.companion_allowance_for(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.companion_pro_entitlements; w record; renewal timestamptz; included integer := 0; packs bigint; held bigint;
BEGIN
  IF NOT public.companion_usage_enabled() THEN
    RETURN jsonb_build_object('mode','beta');
  END IF;
  SELECT * INTO e FROM public.companion_pro_entitlements WHERE user_id=p_user_id
    AND NOT revoked AND anchor<=now() AND valid_until>now();
  IF FOUND THEN
    SELECT * INTO w FROM public.companion_month_window(e.anchor, now());
    renewal := least(w.period_end,e.valid_until);
    SELECT greatest(0,15-count(*))::integer INTO included FROM public.companion_question_requests
      WHERE user_id=p_user_id AND source='monthly' AND period_start=w.period_start
      AND (status='charged' OR (status IN ('working','paused') AND lease_until>now()));
  END IF;
  SELECT count(*) INTO held FROM public.companion_question_requests WHERE user_id=p_user_id
    AND source='pack' AND status IN ('working','paused') AND lease_until>now();
  SELECT greatest(0,pack_questions-held) INTO packs FROM public.companion_usage_accounts WHERE user_id=p_user_id;
  RETURN jsonb_build_object('mode','monthly','plan',coalesce(e.plan,'free'),'included',included,
    'limit',CASE WHEN e.user_id IS NULL THEN 0 ELSE 15 END,'purchased',coalesce(packs,0),
    'renewsAt',renewal);
END;
$$;
CREATE FUNCTION public.get_companion_allowance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  RETURN public.companion_allowance_for(auth.uid());
END;
$$;

-- Called only AFTER verifying the purchase against Apple's server. The ledger
-- makes webhook/delivery retries harmless; purchased questions do not expire.
CREATE FUNCTION public.grant_companion_question_pack(p_user_id uuid, p_transaction_id text, p_questions integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old public.companion_question_packs;
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR p_questions IS NULL THEN RAISE EXCEPTION 'Invalid pack'; END IF;
  INSERT INTO public.companion_usage_accounts(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  INSERT INTO public.companion_question_packs(transaction_id,user_id,questions)
    VALUES(p_transaction_id,p_user_id,p_questions) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO old FROM public.companion_question_packs WHERE transaction_id=p_transaction_id;
    IF old.user_id IS DISTINCT FROM p_user_id OR old.questions IS DISTINCT FROM p_questions THEN RAISE EXCEPTION 'Purchase already claimed'; END IF;
    RETURN false;
  END IF;
  UPDATE public.companion_usage_accounts SET pack_questions=pack_questions+p_questions WHERE user_id=p_user_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.begin_companion_question(p_user_id uuid, p_request_id uuid, p_attempt uuid, p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old public.companion_question_requests; a jsonb; e public.companion_pro_entitlements; w record; chosen text;
BEGIN
  IF NOT public.companion_usage_enabled() THEN RETURN jsonb_build_object('mode','beta'); END IF;
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_attempt IS NULL OR p_scope IS NULL
    OR jsonb_typeof(p_scope)<>'object' THEN RAISE EXCEPTION 'Invalid question reservation'; END IF;
  INSERT INTO public.companion_usage_accounts(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  -- Expired work loses authority to call the provider/save a charge. Its actual
  -- and uncertain spending stays on the money ledger even after a crash.
  UPDATE public.companion_question_requests SET status='released'
    WHERE user_id=p_user_id AND status IN ('working','paused') AND lease_until<=now();
  SELECT * INTO old FROM public.companion_question_requests WHERE id=p_request_id;
  IF FOUND THEN
    IF old.user_id IS DISTINCT FROM p_user_id OR old.scope IS DISTINCT FROM p_scope THEN
      RETURN jsonb_build_object('error','request_mismatch');
    END IF;
    IF old.status='working' THEN RETURN jsonb_build_object('error','question_busy'); END IF;
    IF old.status<>'paused' THEN RETURN jsonb_build_object('error','question_request_closed'); END IF;
    UPDATE public.companion_question_requests SET status='working',attempt=p_attempt,lease_until=now()+interval '10 minutes' WHERE id=p_request_id;
    RETURN jsonb_build_object('mode','monthly','source',old.source);
  END IF;
  IF EXISTS(SELECT 1 FROM public.companion_question_requests WHERE user_id=p_user_id AND status='working') THEN
    RETURN jsonb_build_object('error','question_busy');
  END IF;
  -- A viewer may leave a preparing recap to rewind/switch episodes. Paused
  -- work has no active worker and may be replaced without waiting ten minutes.
  UPDATE public.companion_question_requests SET status='released' WHERE user_id=p_user_id AND status='paused';
  a := public.companion_allowance_for(p_user_id);
  IF (a->>'included')::integer>0 THEN
    chosen := 'monthly';
    SELECT * INTO e FROM public.companion_pro_entitlements WHERE user_id=p_user_id;
    SELECT * INTO w FROM public.companion_month_window(e.anchor,now());
    INSERT INTO public.companion_question_requests(id,user_id,scope,source,period_start,period_end,status,attempt,lease_until,budget_month)
      VALUES(p_request_id,p_user_id,p_scope,chosen,w.period_start,least(w.period_end,e.valid_until),'working',p_attempt,
        now()+interval '10 minutes',date_trunc('month',now() AT TIME ZONE 'UTC')::date);
  ELSIF (a->>'purchased')::bigint>0 THEN
    chosen := 'pack';
    INSERT INTO public.companion_question_requests(id,user_id,scope,source,status,attempt,lease_until,budget_month)
      VALUES(p_request_id,p_user_id,p_scope,chosen,'working',p_attempt,now()+interval '10 minutes',
        date_trunc('month',now() AT TIME ZONE 'UTC')::date);
  ELSE RETURN jsonb_build_object('error','questions_exhausted','allowance',a);
  END IF;
  RETURN jsonb_build_object('mode','monthly','source',chosen);
END;
$$;

CREATE FUNCTION public.end_companion_question_attempt(p_user_id uuid, p_request_id uuid, p_attempt uuid, p_pause boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  UPDATE public.companion_question_requests SET status=CASE WHEN p_pause THEN 'paused' ELSE 'released' END
    WHERE id=p_request_id AND user_id=p_user_id AND attempt=p_attempt AND status='working';
  RETURN FOUND;
END;
$$;

-- Keep the existing $5 lifetime beta ceiling authoritative. New reservations
-- additionally check a whole-question cap and a calendar-month user cap.
-- Calendar months for MONEY are independent of subscription changes, so
-- cancellation/rejoining cannot reset accumulated spending.
ALTER FUNCTION public.reserve_companion_sol_call(uuid,uuid,uuid,bigint) RENAME TO reserve_companion_sol_call_legacy;
CREATE FUNCTION public.reserve_companion_sol_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_micro_usd bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.companion_usage_enabled() THEN RETURN false; END IF;
  RETURN public.reserve_companion_sol_call_legacy(p_call_id,p_user_id,p_request_id,p_micro_usd);
END;
$$;
CREATE FUNCTION public.reserve_companion_question_call(p_call_id uuid,p_user_id uuid,p_request_id uuid,p_attempt uuid,p_micro_usd bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; policy public.companion_usage_policy; spent bigint;
BEGIN
  SELECT * INTO policy FROM public.companion_usage_policy WHERE id;
  IF NOT FOUND OR NOT policy.enabled THEN RETURN false; END IF;
  -- All paths lock global budget then user, including settlement below.
  PERFORM 1 FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.companion_question_requests WHERE id=p_request_id AND user_id=p_user_id;
  IF NOT FOUND OR r.status<>'working' OR r.attempt IS DISTINCT FROM p_attempt OR r.lease_until<=now() THEN RETURN false; END IF;
  SELECT coalesce(sum(committed_micro_usd),0) INTO spent FROM public.companion_question_requests
    WHERE user_id=p_user_id AND budget_month=r.budget_month;
  IF r.committed_micro_usd+p_micro_usd>policy.question_limit_micro_usd
    OR spent+p_micro_usd>policy.user_month_limit_micro_usd THEN RETURN false; END IF;
  IF NOT public.reserve_companion_sol_call_legacy(p_call_id,p_user_id,p_request_id,p_micro_usd) THEN RETURN false; END IF;
  INSERT INTO public.companion_question_calls(call_id,request_id) VALUES(p_call_id,p_request_id);
  UPDATE public.companion_question_requests SET committed_micro_usd=committed_micro_usd+p_micro_usd WHERE id=p_request_id;
  RETURN true;
END;
$$;
ALTER FUNCTION public.settle_companion_sol_call(uuid,bigint,text,text) RENAME TO settle_companion_sol_call_legacy;
CREATE FUNCTION public.settle_companion_sol_call(p_call_id uuid,p_micro_usd bigint,p_generation_id text,p_halt_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.companion_sol_calls; r public.companion_question_requests; ok boolean;
BEGIN
  PERFORM 1 FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
  SELECT * INTO c FROM public.companion_sol_calls WHERE id=p_call_id;
  SELECT q.* INTO r FROM public.companion_question_requests q JOIN public.companion_question_calls qc
    ON qc.request_id=q.id WHERE qc.call_id=p_call_id;
  IF FOUND THEN PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=r.user_id FOR UPDATE; END IF;
  ok := public.settle_companion_sol_call_legacy(p_call_id,p_micro_usd,p_generation_id,p_halt_reason);
  IF ok AND c.status='reserved' AND r.id IS NOT NULL THEN
    UPDATE public.companion_question_requests SET committed_micro_usd=committed_micro_usd-c.reserved_micro_usd+coalesce(p_micro_usd,c.reserved_micro_usd)
      WHERE id=r.id;
  END IF;
  RETURN ok;
END;
$$;

ALTER FUNCTION public.record_companion_answer(uuid,jsonb,boolean) RENAME TO record_companion_answer_legacy;
CREATE FUNCTION public.record_companion_answer(p_user_id uuid,p_conversation jsonb,p_charge boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.companion_usage_enabled() THEN RAISE EXCEPTION 'Question reservation required'; END IF;
  RETURN public.record_companion_answer_legacy(p_user_id,p_conversation,p_charge);
END;
$$;
CREATE FUNCTION public.finish_companion_question(p_user_id uuid,p_attempt uuid,p_conversation jsonb,p_charge boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.companion_question_requests; saved public.ai_conversations; required_version integer; scope jsonb;
BEGIN
  PERFORM 1 FROM public.companion_usage_accounts WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.companion_question_requests WHERE id=(p_conversation->>'id')::uuid AND user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question reservation required'; END IF;
  scope := jsonb_build_object('title_id',p_conversation->'title_id','media_type',p_conversation->'media_type',
    'season_number',p_conversation->'season_number','episode_number',p_conversation->'episode_number',
    'position_seconds',p_conversation->'position_seconds','question',p_conversation->'question','companion_version',p_conversation->'companion_version');
  IF r.scope IS DISTINCT FROM scope THEN RAISE EXCEPTION 'Question scope changed'; END IF;
  required_version := public.companion_answer_revision((p_conversation->>'title_id')::integer,p_conversation->>'media_type',
    (p_conversation->>'season_number')::integer,(p_conversation->>'episode_number')::integer);
  IF p_conversation->>'companion_version' IS DISTINCT FROM required_version::text THEN RAISE EXCEPTION 'Companion upgrade required'; END IF;
  SELECT * INTO saved FROM public.ai_conversations WHERE id=r.id AND user_id=p_user_id;
  IF FOUND THEN RETURN jsonb_build_object('conversation',to_jsonb(saved),'usedCoins',0,'allowance',public.companion_allowance_for(p_user_id)); END IF;
  IF r.status<>'working' OR r.attempt IS DISTINCT FROM p_attempt OR r.lease_until<=now() THEN RAISE EXCEPTION 'Question request closed'; END IF;
  -- A paid question may only complete after every provider call is settled.
  IF EXISTS(SELECT 1 FROM public.companion_question_calls qc JOIN public.companion_sol_calls c ON c.id=qc.call_id
    WHERE qc.request_id=r.id AND c.status<>'settled') THEN RAISE EXCEPTION 'Question cost is unresolved'; END IF;
  IF p_charge AND r.source='pack' THEN
    UPDATE public.companion_usage_accounts SET pack_questions=pack_questions-1 WHERE user_id=p_user_id;
  END IF;
  UPDATE public.companion_question_requests SET status=CASE WHEN p_charge THEN 'charged' ELSE 'released' END WHERE id=r.id;
  INSERT INTO public.ai_conversations(id,user_id,title_id,media_type,question,answer,context,season_number,episode_number,
    timestamp,position_seconds,companion_version,evidence,answer_status,used_coins)
  VALUES(r.id,p_user_id,(p_conversation->>'title_id')::integer,p_conversation->>'media_type',p_conversation->>'question',
    p_conversation->>'answer',p_conversation->>'context',(p_conversation->>'season_number')::integer,
    (p_conversation->>'episode_number')::integer,p_conversation->>'timestamp',(p_conversation->>'position_seconds')::integer,
    required_version,p_conversation->'evidence',p_conversation->>'answer_status',0) RETURNING * INTO saved;
  RETURN jsonb_build_object('conversation',to_jsonb(saved),'usedCoins',0,'allowance',public.companion_allowance_for(p_user_id));
END;
$$;

-- No browser can mint balances, modify usage, choose dates, or impersonate an
-- account. Service role cannot enable/fund the policy or call the bypasses.
REVOKE ALL ON FUNCTION public.companion_usage_enabled(), public.companion_month_window(timestamptz,timestamptz), public.companion_allowance_for(uuid),
  public.get_companion_allowance(), public.grant_companion_question_pack(uuid,text,integer),
  public.begin_companion_question(uuid,uuid,uuid,jsonb), public.end_companion_question_attempt(uuid,uuid,uuid,boolean),
  public.reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint), public.finish_companion_question(uuid,uuid,jsonb,boolean),
  public.reserve_companion_sol_call_legacy(uuid,uuid,uuid,bigint), public.settle_companion_sol_call_legacy(uuid,bigint,text,text),
  public.record_companion_answer_legacy(uuid,jsonb,boolean), public.reserve_companion_sol_call(uuid,uuid,uuid,bigint),
  public.settle_companion_sol_call(uuid,bigint,text,text), public.record_companion_answer(uuid,jsonb,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_companion_allowance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_companion_question_pack(uuid,text,integer),
  public.begin_companion_question(uuid,uuid,uuid,jsonb), public.end_companion_question_attempt(uuid,uuid,uuid,boolean),
  public.reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint), public.finish_companion_question(uuid,uuid,jsonb,boolean),
  public.reserve_companion_sol_call(uuid,uuid,uuid,bigint), public.settle_companion_sol_call(uuid,bigint,text,text),
  public.record_companion_answer(uuid,jsonb,boolean) TO service_role;
COMMIT;
