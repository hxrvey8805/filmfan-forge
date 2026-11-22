-- Operator-managed complimentary testing access. No customer API can create,
-- read or change these grants, and no purchase or payment record is fabricated.
-- Individual account grants are applied privately, outside source control.
CREATE TABLE public.cinegeek_private_test_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('monthly','annual')),
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  expires_at timestamptz CHECK (expires_at IS NULL OR (isfinite(expires_at) AND expires_at>starts_at)),
  revoked boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(trim(reason))>0)
);
ALTER TABLE public.cinegeek_private_test_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cinegeek_private_test_grants FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.cinegeek_private_test_grants IS
  'Explicit operator test overrides; NULL expiry means no automatic expiry. Normal allowances and spending caps still apply.';

CREATE OR REPLACE FUNCTION public.active_companion_entitlement(p_user_id uuid)
RETURNS TABLE(user_id uuid,plan text,anchor timestamptz,valid_until timestamptz,grant_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH test_grant AS (
    SELECT g.user_id,g.plan,g.starts_at AS anchor,coalesce(g.expires_at,'infinity'::timestamptz) AS valid_until,
      'private_test_override'::text AS grant_source
    FROM public.cinegeek_private_test_grants g
    WHERE g.user_id=p_user_id AND NOT g.revoked AND g.starts_at<=now()
      AND (g.expires_at IS NULL OR g.expires_at>now())
  )
  SELECT * FROM test_grant
  UNION ALL
  SELECT e.user_id,e.plan,e.anchor,e.valid_until,'verified_purchase'::text
    FROM public.companion_pro_entitlements e
    WHERE e.user_id=p_user_id AND NOT e.revoked AND e.anchor<=now() AND e.valid_until>now()
      AND NOT EXISTS(SELECT 1 FROM test_grant)
  UNION ALL
  SELECT g.user_id,'monthly'::text,g.starts_at,g.expires_at,'private_test'::text
    FROM public.cinegeek_private_monthly_grants g
    WHERE g.user_id=p_user_id AND NOT g.revoked AND g.starts_at<=now() AND g.expires_at>now()
      AND NOT EXISTS(SELECT 1 FROM test_grant)
      -- Preserve the older grant's refund/expiry guard for ordinary accounts.
      AND NOT EXISTS(SELECT 1 FROM public.companion_pro_entitlements e WHERE e.user_id=p_user_id)
  UNION ALL
  SELECT r.user_id,r.plan,r.anchor,least(r.valid_until,t.expires_at),'verified_sandbox_review'::text
    FROM public.apple_review_entitlements r JOIN public.apple_review_testers t ON t.user_id=r.user_id
    WHERE r.user_id=p_user_id AND public.apple_review_can_deliver(p_user_id)
      AND NOT r.revoked AND r.anchor<=now() AND r.valid_until>now()
      AND NOT EXISTS(SELECT 1 FROM test_grant);
$$;
REVOKE ALL ON FUNCTION public.active_companion_entitlement(uuid) FROM PUBLIC,anon,authenticated,service_role;

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
    -- Internal infinity keeps reservation/retry checks unchanged. The client
    -- contract uses NULL for a plan with no expiry, never the string infinity.
    'expiresAt',(SELECT CASE WHEN isfinite(valid_until) THEN valid_until ELSE NULL END
      FROM public.active_companion_entitlement(u)));
END;
$$;
-- CREATE OR REPLACE retains the existing authenticated-only access RPC grant.
