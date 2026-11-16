BEGIN;
-- No subscriptions, trials or purchases are granted/enabled by this migration.
CREATE TABLE public.cinegeek_xp (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available bigint NOT NULL DEFAULT 0 CHECK (available>=0),
  lifetime bigint NOT NULL DEFAULT 0 CHECK (lifetime>=available),
  reward_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  daily_earned integer NOT NULL DEFAULT 0 CHECK (daily_earned BETWEEN 0 AND 225),
  spin_earned_day date,
  spin_used_day date
);
CREATE TABLE public.cinegeek_xp_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount integer NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Keep the old balance intact for audit; migrate its numeric value once, not
-- every time an old client changes coins. Reconcile any historic paid value
-- before rollout. No new account gets a 100-point signup grant.
INSERT INTO public.cinegeek_xp(user_id,available,lifetime)
  SELECT s.user_id,greatest(0,s.coins),greatest(0,s.coins) FROM public.user_stats s JOIN auth.users u ON u.id=s.user_id;
INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount)
  SELECT gen_random_uuid(),s.user_id,'legacy_balance',greatest(0,s.coins) FROM public.user_stats s JOIN auth.users u ON u.id=s.user_id;
CREATE TABLE public.cinegeek_unlocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, item text NOT NULL, kind text NOT NULL CHECK (kind IN ('skin','badge')),
  earned_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,kind,item)
);
CREATE TABLE public.cinegeek_games (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, start_actor integer NOT NULL CHECK (start_actor>0),
  target_actor integer NOT NULL CHECK (target_actor>0 AND target_actor<>start_actor),
  started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '120 seconds',
  status text NOT NULL DEFAULT 'playing' CHECK(status IN ('playing','verifying','won','lost')),
  proof jsonb, submitted_at timestamptz, verification_token uuid, verification_until timestamptz,
  awarded integer NOT NULL DEFAULT 0 CHECK (awarded BETWEEN 0 AND 75)
);
CREATE INDEX cinegeek_games_user_day ON public.cinegeek_games(user_id,started_at);
ALTER TABLE public.user_packs ADD COLUMN revealed_person jsonb,
  ADD COLUMN decision text CHECK (decision IN ('kept','skipped','legacy')),
  ADD COLUMN replaced_card_id uuid,
  ADD COLUMN reveal_token uuid, ADD COLUMN reveal_until timestamptz;
UPDATE public.user_packs SET decision='legacy' WHERE is_opened;

ALTER TABLE public.cinegeek_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cinegeek_xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cinegeek_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cinegeek_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cinegeek_xp,public.cinegeek_xp_events,public.cinegeek_unlocks,public.cinegeek_games
  FROM PUBLIC,anon,authenticated,service_role;
-- Old clients and retired sell/payment endpoints cannot mint or recycle funds.
REVOKE INSERT,UPDATE,DELETE ON public.user_stats,public.user_packs,public.user_collection FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.user_stats,public.user_packs,public.user_collection TO authenticated;

CREATE FUNCTION public.cinegeek_plan(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT plan FROM public.companion_pro_entitlements WHERE user_id=p_user
    AND NOT revoked AND anchor<=now() AND valid_until>now()),'free');
$$;
CREATE FUNCTION public.cinegeek_lock_wallet(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  INSERT INTO public.cinegeek_xp(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.cinegeek_xp WHERE user_id=p_user FOR UPDATE;
  UPDATE public.cinegeek_xp SET daily_earned=0,reward_day=(now() AT TIME ZONE 'UTC')::date
    WHERE user_id=p_user AND reward_day<>(now() AT TIME ZONE 'UTC')::date;
END;
$$;
CREATE FUNCTION public.get_cinegeek_access()
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
    'expiresAt',(SELECT valid_until FROM public.companion_pro_entitlements WHERE user_id=u AND p<>'free'));
END;
$$;

CREATE FUNCTION public.redeem_cinegeek_xp(p_request uuid,p_item text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); price integer; old public.cinegeek_xp_events; pack uuid; kind text; skin text;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  IF p_request IS NULL OR p_item IS NULL THEN RAISE EXCEPTION 'Invalid redemption'; END IF;
  SELECT * INTO old FROM public.cinegeek_xp_events WHERE id=p_request;
  IF FOUND THEN
    IF old.user_id<>u OR old.kind<>'redeem' OR old.details->>'item' IS DISTINCT FROM p_item THEN RAISE EXCEPTION 'Request already used'; END IF;
    RETURN old.details;
  END IF;
  IF p_item IN ('pack:actor','pack:director') THEN price:=150; kind:='pack';
  ELSIF p_item LIKE 'skin:%' THEN
    skin:=substr(p_item,6); kind:='skin'; price:=1500;
    IF public.cinegeek_plan(u)<>'monthly' THEN RAISE EXCEPTION 'Monthly Pro unlocks skins with XP; Annual includes all skins'; END IF;
    IF skin NOT IN ('breaking','stranger','trek','matrix','jurassic','jedi','chucky','karate','mha','peaky','spider',
      'hogwarts','thrones','pulp','social','squid','dune','scar','gladiator','wolf') THEN RAISE EXCEPTION 'Unknown skin'; END IF;
    IF EXISTS(SELECT 1 FROM public.cinegeek_unlocks unlocked WHERE unlocked.user_id=u AND unlocked.item=skin AND unlocked.kind='skin') THEN RAISE EXCEPTION 'Skin already unlocked'; END IF;
  ELSE RAISE EXCEPTION 'XP cannot buy this item'; END IF;
  IF (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<price THEN RAISE EXCEPTION 'Not enough XP'; END IF;
  UPDATE public.cinegeek_xp SET available=available-price WHERE user_id=u;
  IF kind='pack' THEN
    INSERT INTO public.user_packs(user_id,pack_type,pack_tier) VALUES(u,substr(p_item,6),'standard') RETURNING id INTO pack;
  ELSE INSERT INTO public.cinegeek_unlocks(user_id,item,kind) VALUES(u,skin,'skin'); END IF;
  INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details)
    VALUES(p_request,u,'redeem',-price,jsonb_build_object('item',p_item,'packId',pack));
  RETURN jsonb_build_object('item',p_item,'packId',pack);
END;
$$;

CREATE FUNCTION public.start_cinegeek_game(p_game uuid,p_start integer,p_target integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); old public.cinegeek_games;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  IF p_game IS NULL OR p_start IS NULL OR p_target IS NULL THEN RAISE EXCEPTION 'Invalid game'; END IF;
  SELECT * INTO old FROM public.cinegeek_games WHERE id=p_game;
  IF FOUND THEN
    IF old.user_id<>u OR old.start_actor<>p_start OR old.target_actor<>p_target THEN RAISE EXCEPTION 'Game already used'; END IF;
    RETURN to_jsonb(old)-'proof'-'verification_token';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cinegeek_games WHERE user_id=u AND status='playing' AND expires_at>now()) THEN RAISE EXCEPTION 'Finish your current game first'; END IF;
  IF public.cinegeek_plan(u)='free' AND EXISTS(SELECT 1 FROM public.cinegeek_games WHERE user_id=u
    AND started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'Your free game is used for today'; END IF;
  INSERT INTO public.cinegeek_games(id,user_id,start_actor,target_actor) VALUES(p_game,u,p_start,p_target) RETURNING * INTO old;
  RETURN to_jsonb(old)-'proof'-'verification_token';
END;
$$;
CREATE FUNCTION public.cinegeek_game_access(p_user uuid,p_game uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.cinegeek_games WHERE id=p_game AND user_id=p_user AND status='playing' AND expires_at>now());
$$;
CREATE FUNCTION public.claim_cinegeek_win(p_user uuid,p_game uuid,p_proof jsonb,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.cinegeek_games;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO g FROM public.cinegeek_games WHERE id=p_game AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR p_token IS NULL OR jsonb_typeof(p_proof) IS DISTINCT FROM 'array' OR jsonb_array_length(p_proof) NOT BETWEEN 3 AND 21 THEN RAISE EXCEPTION 'Invalid game'; END IF;
  IF g.proof IS NOT NULL AND g.proof IS DISTINCT FROM p_proof THEN RAISE EXCEPTION 'Submitted path cannot change'; END IF;
  IF g.status IN ('won','lost') THEN RETURN to_jsonb(g)-'verification_token'; END IF;
  IF g.status='playing' AND now()>g.expires_at THEN RAISE EXCEPTION 'Game has ended'; END IF;
  IF g.status='verifying' AND g.verification_until>now() THEN RAISE EXCEPTION 'Checking your win'; END IF;
  UPDATE public.cinegeek_games SET status='verifying',proof=p_proof,submitted_at=coalesce(submitted_at,now()),
    verification_token=p_token,verification_until=now()+interval '45 seconds' WHERE id=g.id RETURNING * INTO g;
  RETURN to_jsonb(g)-'verification_token';
END;
$$;
CREATE FUNCTION public.finish_cinegeek_win(p_user uuid,p_game uuid,p_token uuid,p_valid boolean)
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
  UPDATE public.cinegeek_games SET status=CASE WHEN p_valid THEN 'won' ELSE 'lost' END,awarded=award WHERE id=p_game;
  IF p_valid THEN
    UPDATE public.cinegeek_xp SET available=available+award,lifetime=lifetime+award,daily_earned=daily_earned+award,
      spin_earned_day=CASE WHEN public.cinegeek_plan(p_user)<>'free' THEN today ELSE spin_earned_day END WHERE user_id=p_user;
    INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details) VALUES(p_game,p_user,'game_win',award,jsonb_build_object('gameId',p_game));
  END IF;
  RETURN jsonb_build_object('won',p_valid,'xp',award);
END;
$$;

CREATE FUNCTION public.spin_cinegeek_reward()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); today date:=(now() AT TIME ZONE 'UTC')::date; w public.cinegeek_xp;
  n double precision; prize jsonb; award integer:=0; pack uuid; badge text;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  SELECT * INTO w FROM public.cinegeek_xp WHERE user_id=u;
  IF public.cinegeek_plan(u)='free' THEN RAISE EXCEPTION 'Daily spins are a Pro benefit'; END IF;
  IF w.spin_used_day=today THEN
    SELECT details INTO prize FROM public.cinegeek_xp_events WHERE user_id=u AND kind='daily_spin'
      AND details->>'day'=today::text ORDER BY created_at DESC LIMIT 1;
    RETURN prize;
  END IF;
  IF w.spin_earned_day IS DISTINCT FROM today THEN RAISE EXCEPTION 'Win your first game today to earn a spin'; END IF;
  -- Published probabilities: 50% XP, 20% actor pack, 20% director pack, 10% badge.
  n:=random();
  IF n<0.5 THEN
    award:=least(25,225-w.daily_earned); prize:=jsonb_build_object('kind','xp','xp',award);
  ELSIF n<0.9 THEN
    INSERT INTO public.user_packs(user_id,pack_type,pack_tier) VALUES(u,CASE WHEN n<0.7 THEN 'actor' ELSE 'director' END,'standard') RETURNING id INTO pack;
    prize:=jsonb_build_object('kind','pack','packType',CASE WHEN n<0.7 THEN 'actor' ELSE 'director' END,'packId',pack);
  ELSE
    badge:=(ARRAY['film_buff','scene_spotter','cast_expert'])[1+floor(random()*3)::integer];
    INSERT INTO public.cinegeek_unlocks(user_id,item,kind) VALUES(u,badge,'badge') ON CONFLICT DO NOTHING;
    prize:=jsonb_build_object('kind','badge','badge',badge);
  END IF;
  prize:=prize||jsonb_build_object('day',today);
  UPDATE public.cinegeek_xp SET available=available+award,lifetime=lifetime+award,daily_earned=daily_earned+award,spin_used_day=today WHERE user_id=u;
  INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details) VALUES(gen_random_uuid(),u,'daily_spin',award,prize);
  RETURN prize;
END;
$$;

CREATE FUNCTION public.claim_cinegeek_pack(p_user uuid,p_pack uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pack public.user_packs;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO pack FROM public.user_packs WHERE id=p_pack AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR pack.is_opened OR p_token IS NULL THEN RAISE EXCEPTION 'Pack unavailable'; END IF;
  IF pack.revealed_person IS NOT NULL THEN RETURN jsonb_build_object('person',pack.revealed_person,'packType',pack.pack_type); END IF;
  IF pack.reveal_until>now() THEN RAISE EXCEPTION 'Your pack is opening'; END IF;
  UPDATE public.user_packs SET reveal_token=p_token,reveal_until=now()+interval '45 seconds' WHERE id=p_pack;
  RETURN jsonb_build_object('packType',pack.pack_type);
END;
$$;
CREATE FUNCTION public.store_cinegeek_reveal(p_user uuid,p_pack uuid,p_token uuid,p_person jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pack public.user_packs;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO pack FROM public.user_packs WHERE id=p_pack AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR pack.is_opened THEN RAISE EXCEPTION 'Pack unavailable'; END IF;
  IF pack.revealed_person IS NOT NULL THEN RETURN jsonb_build_object('person',pack.revealed_person,'packType',pack.pack_type); END IF;
  IF pack.reveal_token IS DISTINCT FROM p_token OR pack.reveal_until<=now() THEN RAISE EXCEPTION 'Pack opening expired'; END IF;
  IF jsonb_typeof(p_person) IS DISTINCT FROM 'object' OR (p_person->>'id')::integer<=0 OR coalesce(length(p_person->>'name'),0) NOT BETWEEN 1 AND 200
    OR (p_person->>'id') IS NULL OR (coalesce(p_person->>'profile_path','')<>'' AND p_person->>'profile_path' !~ '^/[A-Za-z0-9_-]+\.(jpg|png)$') THEN RAISE EXCEPTION 'Invalid card'; END IF;
  UPDATE public.user_packs SET revealed_person=jsonb_build_object('id',(p_person->>'id')::integer,'name',p_person->>'name',
    'profile_path',coalesce(p_person->>'profile_path',''),'known_for_department',CASE WHEN pack.pack_type='actor' THEN 'Acting' ELSE 'Directing' END),
    reveal_until=null WHERE id=p_pack RETURNING * INTO pack;
  RETURN jsonb_build_object('person',pack.revealed_person,'packType',pack.pack_type);
END;
$$;
CREATE FUNCTION public.decide_cinegeek_pack(p_pack uuid,p_keep boolean,p_replace uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); pack public.user_packs; count_cards integer; old public.user_collection; result text;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  SELECT * INTO pack FROM public.user_packs WHERE id=p_pack AND user_id=u FOR UPDATE;
  IF NOT FOUND OR p_keep IS NULL OR pack.revealed_person IS NULL THEN RAISE EXCEPTION 'Reveal this pack first'; END IF;
  result:=CASE WHEN p_keep THEN 'kept' ELSE 'skipped' END;
  IF pack.is_opened THEN
    IF pack.decision IS DISTINCT FROM result OR pack.replaced_card_id IS DISTINCT FROM p_replace THEN RAISE EXCEPTION 'Pack already decided'; END IF;
    RETURN jsonb_build_object('decision',pack.decision);
  END IF;
  IF NOT p_keep AND p_replace IS NOT NULL THEN RAISE EXCEPTION 'Invalid replacement'; END IF;
  IF p_keep THEN
    IF EXISTS(SELECT 1 FROM public.user_collection WHERE user_id=u AND person_id=(pack.revealed_person->>'id')::integer) THEN RAISE EXCEPTION 'This person is already in your collection'; END IF;
    SELECT count(*) INTO count_cards FROM public.user_collection WHERE user_id=u AND person_type=pack.pack_type;
    IF p_replace IS NOT NULL THEN
      SELECT * INTO old FROM public.user_collection WHERE id=p_replace AND user_id=u AND person_type=pack.pack_type;
      IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your own cards from this collection'; END IF;
      DELETE FROM public.user_collection WHERE id=old.id;
    ELSIF count_cards>=5 THEN RAISE EXCEPTION 'Choose a card to replace; this collection holds five'; END IF;
    INSERT INTO public.user_collection(user_id,person_id,person_name,person_type,profile_path)
      VALUES(u,(pack.revealed_person->>'id')::integer,pack.revealed_person->>'name',pack.pack_type,pack.revealed_person->>'profile_path');
  END IF;
  UPDATE public.user_packs SET is_opened=true,opened_at=now(),decision=result,replaced_card_id=p_replace WHERE id=p_pack;
  -- Keeping, skipping and replacing never credit XP or money.
  RETURN jsonb_build_object('decision',result);
END;
$$;
CREATE OR REPLACE FUNCTION public.check_collection_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.cinegeek_lock_wallet(NEW.user_id);
  IF NEW.person_type NOT IN ('actor','director') THEN RAISE EXCEPTION 'Invalid collection'; END IF;
  IF (SELECT count(*) FROM public.user_collection WHERE user_id=NEW.user_id AND person_type=NEW.person_type AND id<>NEW.id)>=5 THEN
    RAISE EXCEPTION 'Collection limit exceeded: choose a card to replace';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_collection_limit_trigger ON public.user_collection;
DROP TRIGGER IF EXISTS enforce_collection_limit ON public.user_collection;
CREATE TRIGGER enforce_collection_limit BEFORE INSERT OR UPDATE ON public.user_collection
  FOR EACH ROW EXECUTE FUNCTION public.check_collection_limit();

CREATE FUNCTION public.end_cinegeek_game(p_game uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.cinegeek_lock_wallet(auth.uid());
  UPDATE public.cinegeek_games SET status='lost' WHERE id=p_game AND user_id=auth.uid() AND status='playing';
END;
$$;
REVOKE ALL ON FUNCTION public.end_cinegeek_game(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.end_cinegeek_game(uuid) TO authenticated;

-- Gate cached Smart List replies too, before the old free-provider reservation.
ALTER FUNCTION public.reserve_smart_list_interpretation(uuid,text,uuid) RENAME TO reserve_smart_list_interpretation_legacy;
CREATE FUNCTION public.reserve_smart_list_interpretation(p_user uuid,p_hash text,p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.cinegeek_plan(p_user)='free' THEN RETURN jsonb_build_object('status','pro_required'); END IF;
  RETURN public.reserve_smart_list_interpretation_legacy(p_user,p_hash,p_call);
END;
$$;

REVOKE ALL ON FUNCTION public.cinegeek_plan(uuid),public.cinegeek_lock_wallet(uuid),public.get_cinegeek_access(),
  public.redeem_cinegeek_xp(uuid,text),public.start_cinegeek_game(uuid,integer,integer),public.cinegeek_game_access(uuid,uuid),
  public.claim_cinegeek_win(uuid,uuid,jsonb,uuid),public.finish_cinegeek_win(uuid,uuid,uuid,boolean),public.spin_cinegeek_reward(),
  public.claim_cinegeek_pack(uuid,uuid,uuid),public.store_cinegeek_reveal(uuid,uuid,uuid,jsonb),public.decide_cinegeek_pack(uuid,boolean,uuid),
  public.reserve_smart_list_interpretation_legacy(uuid,text,uuid),public.reserve_smart_list_interpretation(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_cinegeek_access(),public.redeem_cinegeek_xp(uuid,text),
  public.start_cinegeek_game(uuid,integer,integer),public.spin_cinegeek_reward(),public.decide_cinegeek_pack(uuid,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cinegeek_plan(uuid),public.cinegeek_game_access(uuid,uuid),public.claim_cinegeek_win(uuid,uuid,jsonb,uuid),
  public.finish_cinegeek_win(uuid,uuid,uuid,boolean),public.claim_cinegeek_pack(uuid,uuid,uuid),public.store_cinegeek_reveal(uuid,uuid,uuid,jsonb),
  public.reserve_smart_list_interpretation(uuid,text,uuid) TO service_role;
COMMIT;
