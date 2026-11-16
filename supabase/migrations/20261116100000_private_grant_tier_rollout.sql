BEGIN;
-- Carry explicit owner test access into the real tier gates without fabricating
-- an Apple transaction. No grant, policy activation or money is created here.
CREATE TABLE IF NOT EXISTS public.cinegeek_private_monthly_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
  revoked boolean NOT NULL DEFAULT false,
  reason text NOT NULL
);
ALTER TABLE public.cinegeek_private_monthly_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cinegeek_private_monthly_grants FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.active_companion_entitlement(p_user_id uuid)
RETURNS TABLE(user_id uuid,plan text,anchor timestamptz,valid_until timestamptz,grant_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.user_id,e.plan,e.anchor,e.valid_until,'verified_purchase'::text
    FROM public.companion_pro_entitlements e
    WHERE e.user_id=p_user_id AND NOT e.revoked AND e.anchor<=now() AND e.valid_until>now()
  UNION ALL
  SELECT g.user_id,'monthly'::text,g.starts_at,g.expires_at,'private_test'::text
    FROM public.cinegeek_private_monthly_grants g
    WHERE g.user_id=p_user_id AND NOT g.revoked AND g.starts_at<=now() AND g.expires_at>now()
    -- An expired/refunded purchase must not resurrect an older test grant.
    AND NOT EXISTS(SELECT 1 FROM public.companion_pro_entitlements e WHERE e.user_id=p_user_id);
$$;
REVOKE ALL ON FUNCTION public.active_companion_entitlement(uuid) FROM PUBLIC,anon,authenticated,service_role;


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

CREATE OR REPLACE FUNCTION public.begin_companion_question_before_spending(p_user_id uuid, p_request_id uuid, p_attempt uuid, p_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old public.companion_question_requests; a jsonb; e record; w record; chosen text;
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
    IF old.source='monthly' AND (old.period_end<=now() OR NOT EXISTS(
      SELECT 1 FROM public.active_companion_entitlement(p_user_id) current_ent
      CROSS JOIN LATERAL public.companion_month_window(current_ent.anchor,now()) current_window
      WHERE current_window.period_start=old.period_start AND current_ent.valid_until>now())) THEN
      UPDATE public.companion_question_requests SET status='released' WHERE id=p_request_id;
      RETURN jsonb_build_object('error','questions_exhausted','allowance',public.companion_allowance_for(p_user_id));
    END IF;
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
    SELECT * INTO e FROM public.active_companion_entitlement(p_user_id);
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

CREATE OR REPLACE FUNCTION public.cinegeek_plan(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT plan FROM public.active_companion_entitlement(p_user)),'free');
$$;

CREATE OR REPLACE FUNCTION public.get_cinegeek_access()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); p text; wallet public.cinegeek_xp; played integer; skins jsonb; badges jsonb;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  p:=public.cinegeek_plan(u);
  SELECT * INTO wallet FROM public.cinegeek_xp WHERE user_id=u;
  SELECT count(*) INTO played FROM public.cinegeek_games WHERE user_id=u
    AND started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT coalesce(jsonb_agg(item ORDER BY item),'[]') INTO skins FROM public.cinegeek_unlocks WHERE user_id=u AND kind='skin';
  SELECT coalesce(jsonb_agg(item ORDER BY item),'[]') INTO badges FROM public.cinegeek_unlocks WHERE user_id=u AND kind='badge';
  RETURN jsonb_build_object('userId',u,'plan',p,'purchasesEnabled',false,
    'smartLists',p<>'free','focusGeek',true,'allSkins',p='annual','unlockedSkins',skins,'badges',badges,
    'gamesRemaining',CASE WHEN p='free' THEN greatest(0,1-played) ELSE NULL END,
    'xp',coalesce(wallet.available,0),'lifetimeXp',coalesce(wallet.lifetime,0),
    'xpToday',CASE WHEN wallet.reward_day=(now() AT TIME ZONE 'UTC')::date THEN wallet.daily_earned ELSE 0 END,
    'xpDailyCap',225,'spinAvailable',p<>'free' AND coalesce(wallet.spin_earned_day=(now() AT TIME ZONE 'UTC')::date
      AND wallet.spin_used_day IS DISTINCT FROM (now() AT TIME ZONE 'UTC')::date,false),
    'expiresAt',(SELECT valid_until FROM public.active_companion_entitlement(u)));
END;
$$;

-- CREATE OR REPLACE retains the existing role grants. The helper and old
-- reservation implementation must never be callable as an application bypass.
REVOKE ALL ON FUNCTION public.begin_companion_question_before_spending(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.get_cinegeek_access() IS 'cinegeek-live-tiers-v1';
COMMENT ON FUNCTION public.get_companion_allowance() IS 'cinegeek-live-tiers-v1';
COMMIT;
