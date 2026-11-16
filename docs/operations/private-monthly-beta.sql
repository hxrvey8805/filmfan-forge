-- Temporary owner-only access bridge while public subscription accounting is staged.
-- This grants no receipt, question balance, XP, purchase, automatic renewal or budget.
-- Apply only before the staged subscription migrations, which replace these RPCs.
BEGIN;
DO $guard$ BEGIN
  IF to_regprocedure('public.get_cinegeek_access()') IS NOT NULL
    OR to_regprocedure('public.get_companion_allowance()') IS NOT NULL THEN
    RAISE EXCEPTION 'Access RPCs already exist; use the current entitlement system';
  END IF;
END $guard$;
CREATE TABLE public.cinegeek_private_monthly_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
  revoked boolean NOT NULL DEFAULT false,
  reason text NOT NULL
);
ALTER TABLE public.cinegeek_private_monthly_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cinegeek_private_monthly_grants FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_cinegeek_access()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); expiry timestamptz; points bigint;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT expires_at INTO expiry FROM public.cinegeek_private_monthly_grants
    WHERE user_id=u AND NOT revoked AND starts_at<=now() AND expires_at>now();
  -- Preserve unconfirmed access for everyone else until full tier rollout.
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT greatest(0,coins) INTO points FROM public.user_stats WHERE user_id=u;
  RETURN jsonb_build_object('userId',u,'plan','monthly','purchasesEnabled',false,
    'smartLists',true,'focusGeek',true,'allSkins',false,'unlockedSkins','[]'::jsonb,
    'badges','[]'::jsonb,'gamesRemaining',NULL,'xp',coalesce(points,0),
    'lifetimeXp',coalesce(points,0),'xpToday',0,'xpDailyCap',225,'spinAvailable',false,
    'expiresAt',expiry,'privateBeta',true);
END;
$$;
CREATE FUNCTION public.get_companion_allowance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF EXISTS(SELECT 1 FROM public.cinegeek_private_monthly_grants WHERE user_id=auth.uid()
    AND NOT revoked AND starts_at<=now() AND expires_at>now()) THEN
    RETURN jsonb_build_object('mode','beta');
  END IF;
  RETURN jsonb_build_object('mode','unavailable');
END;
$$;
COMMENT ON FUNCTION public.get_cinegeek_access() IS 'cinegeek-private-monthly-bridge-v1';
COMMENT ON FUNCTION public.get_companion_allowance() IS 'cinegeek-private-monthly-bridge-v1';
REVOKE ALL ON FUNCTION public.get_cinegeek_access(),public.get_companion_allowance() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_cinegeek_access(),public.get_companion_allowance() TO authenticated;
COMMIT;
