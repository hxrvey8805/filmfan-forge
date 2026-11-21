-- New clients opt into skin reveals. The existing RPC remains available for
-- older builds; both use the same locked wallet/day and immutable spin receipt.
CREATE FUNCTION public.spin_cinegeek_reward_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); today date:=(now() AT TIME ZONE 'UTC')::date; w public.cinegeek_xp;
  n double precision; prize jsonb; award integer:=0; pack uuid; badge text; skin text; plan text;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  SELECT * INTO w FROM public.cinegeek_xp WHERE user_id=u;
  plan:=public.cinegeek_plan(u);
  IF plan='free' THEN RAISE EXCEPTION 'Daily spins are a Pro benefit'; END IF;
  IF w.spin_used_day=today THEN
    SELECT details INTO prize FROM public.cinegeek_xp_events WHERE user_id=u AND kind='daily_spin'
      AND details->>'day'=today::text ORDER BY created_at DESC LIMIT 1;
    RETURN prize;
  END IF;
  IF w.spin_earned_day IS DISTINCT FROM today THEN RAISE EXCEPTION 'Win your first game today to earn a spin'; END IF;
  -- Published probabilities: 50% XP, 20% actor pack, 20% director pack,
  -- 10% unowned skin (badge when Annual/all skins are already available).
  n:=random();
  IF n<0.5 THEN
    award:=least(25,225-w.daily_earned); prize:=jsonb_build_object('kind','xp','xp',award);
  ELSIF n<0.9 THEN
    INSERT INTO public.user_packs(user_id,pack_type,pack_tier) VALUES(u,CASE WHEN n<0.7 THEN 'actor' ELSE 'director' END,'standard') RETURNING id INTO pack;
    prize:=jsonb_build_object('kind','pack','packType',CASE WHEN n<0.7 THEN 'actor' ELSE 'director' END,'packId',pack);
  ELSE
    IF plan='monthly' THEN
      SELECT candidate INTO skin FROM unnest(ARRAY['breaking','stranger','trek','matrix','jurassic','jedi','chucky','karate','mha','peaky','spider',
        'hogwarts','thrones','pulp','social','squid','dune','scar','gladiator','wolf']) AS candidate
      WHERE NOT EXISTS(SELECT 1 FROM public.cinegeek_unlocks owned WHERE owned.user_id=u AND owned.kind='skin' AND owned.item=candidate)
      ORDER BY random() LIMIT 1;
    END IF;
    IF skin IS NOT NULL THEN
      INSERT INTO public.cinegeek_unlocks(user_id,item,kind) VALUES(u,skin,'skin');
      prize:=jsonb_build_object('kind','skin','skin',skin);
    ELSE
      badge:=(ARRAY['film_buff','scene_spotter','cast_expert'])[1+floor(random()*3)::integer];
      INSERT INTO public.cinegeek_unlocks(user_id,item,kind) VALUES(u,badge,'badge') ON CONFLICT DO NOTHING;
      prize:=jsonb_build_object('kind','badge','badge',badge);
    END IF;
  END IF;
  prize:=prize||jsonb_build_object('day',today);
  UPDATE public.cinegeek_xp SET available=available+award,lifetime=lifetime+award,daily_earned=daily_earned+award,spin_used_day=today WHERE user_id=u;
  INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details) VALUES(gen_random_uuid(),u,'daily_spin',award,prize);
  RETURN prize;
END;
$$;
REVOKE ALL ON FUNCTION public.spin_cinegeek_reward_v2() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.spin_cinegeek_reward_v2() TO authenticated;
