-- A previously rejected, on-time proof can be rechecked once by the corrected
-- verifier. No path edits, new time allowance, client awards or direct XP grants.
ALTER TABLE public.cinegeek_games ADD COLUMN verification_version smallint NOT NULL DEFAULT 1 CHECK (verification_version IN (1,2));

CREATE OR REPLACE FUNCTION public.claim_cinegeek_win(p_user uuid,p_game uuid,p_proof jsonb,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.cinegeek_games;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO g FROM public.cinegeek_games WHERE id=p_game AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR p_token IS NULL OR jsonb_typeof(p_proof) IS DISTINCT FROM 'array' OR jsonb_array_length(p_proof) NOT BETWEEN 3 AND 21 THEN RAISE EXCEPTION 'Invalid game'; END IF;
  IF g.proof IS NOT NULL AND g.proof IS DISTINCT FROM p_proof THEN RAISE EXCEPTION 'Submitted path cannot change'; END IF;
  IF g.status='won' OR (g.status='lost' AND NOT coalesce((
    g.verification_version=1 AND g.proof IS NOT NULL AND g.submitted_at BETWEEN g.started_at AND g.expires_at
  ),false)) THEN RETURN to_jsonb(g)-'verification_token'; END IF;
  IF g.status='playing' AND now()>g.expires_at THEN RAISE EXCEPTION 'Game has ended'; END IF;
  IF g.status='verifying' AND g.verification_until>now() THEN RAISE EXCEPTION 'Checking your win'; END IF;
  UPDATE public.cinegeek_games SET status='verifying',proof=p_proof,submitted_at=coalesce(submitted_at,now()),
    verification_token=p_token,verification_until=now()+interval '45 seconds' WHERE id=g.id RETURNING * INTO g;
  RETURN to_jsonb(g)-'verification_token';
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_cinegeek_win(p_user uuid,p_game uuid,p_token uuid,p_valid boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.cinegeek_games; award integer; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO g FROM public.cinegeek_games WHERE id=p_game AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF g.status IN ('won','lost') THEN RETURN jsonb_build_object('won',g.status='won','xp',g.awarded); END IF;
  IF g.status<>'verifying' OR g.verification_token IS DISTINCT FROM p_token OR g.verification_until<=now()
    OR p_valid IS NULL THEN RAISE EXCEPTION 'Verification expired'; END IF;
  award:=CASE WHEN p_valid THEN least(75,225-(SELECT daily_earned FROM public.cinegeek_xp WHERE user_id=p_user)) ELSE 0 END;
  UPDATE public.cinegeek_games SET status=CASE WHEN p_valid THEN 'won' ELSE 'lost' END,awarded=award,verification_version=2 WHERE id=p_game;
  IF p_valid THEN
    UPDATE public.cinegeek_xp SET available=available+award,lifetime=lifetime+award,daily_earned=daily_earned+award,
      spin_earned_day=CASE WHEN public.cinegeek_plan(p_user)<>'free' THEN today ELSE spin_earned_day END WHERE user_id=p_user;
    INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details) VALUES(p_game,p_user,'game_win',award,jsonb_build_object('gameId',p_game));
  END IF;
  RETURN jsonb_build_object('won',p_valid,'xp',award);
END;
$$;
