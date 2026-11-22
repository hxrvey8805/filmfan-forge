-- Six cards per collection; stable editorial pack draws with disclosed odds.
-- Existing undecided/collected cards stay valid without retrospective rarity.
BEGIN;
ALTER TABLE public.user_packs ADD COLUMN IF NOT EXISTS reveal_pick jsonb;
ALTER TABLE public.user_collection ADD COLUMN IF NOT EXISTS card_rarity text
  CHECK (card_rarity IN ('established','star','icon'));
ALTER TABLE public.user_collection ADD COLUMN IF NOT EXISTS catalogue_version text;
CREATE OR REPLACE FUNCTION public.claim_cinegeek_pack(p_user uuid,p_pack uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pack public.user_packs;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO pack FROM public.user_packs WHERE id=p_pack AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR pack.is_opened OR p_token IS NULL THEN RAISE EXCEPTION 'Pack unavailable'; END IF;
  IF pack.revealed_person IS NOT NULL THEN RETURN jsonb_build_object('person',pack.revealed_person,'packType',pack.pack_type); END IF;
  IF pack.reveal_until>now() THEN RAISE EXCEPTION 'Your pack is opening'; END IF;
  UPDATE public.user_packs SET reveal_token=p_token,reveal_until=now()+interval '45 seconds' WHERE id=p_pack;
  RETURN jsonb_build_object('packType',pack.pack_type,'pick',pack.reveal_pick);
END;
$$;

CREATE OR REPLACE FUNCTION public.store_cinegeek_pack_pick(p_user uuid,p_pack uuid,p_token uuid,p_pick jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pack public.user_packs;
BEGIN
  PERFORM public.cinegeek_lock_wallet(p_user);
  SELECT * INTO pack FROM public.user_packs WHERE id=p_pack AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR pack.is_opened THEN RAISE EXCEPTION 'Pack unavailable'; END IF;
  IF pack.reveal_pick IS NOT NULL THEN RETURN pack.reveal_pick; END IF;
  IF pack.revealed_person IS NOT NULL THEN RAISE EXCEPTION 'Pack already revealed'; END IF;
  IF pack.reveal_token IS DISTINCT FROM p_token OR pack.reveal_until<=now() THEN RAISE EXCEPTION 'Pack opening expired'; END IF;
  IF jsonb_typeof(p_pick) IS DISTINCT FROM 'object' OR p_pick->>'version' IS DISTINCT FROM 'cinegeek-cast-1'
    OR p_pick->>'packType' IS DISTINCT FROM pack.pack_type
    OR coalesce(p_pick->>'rarity','') NOT IN ('established','star','icon')
    OR coalesce(length(p_pick->>'name'),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid pack draw'; END IF;
  UPDATE public.user_packs SET reveal_pick=jsonb_build_object('name',p_pick->>'name','rarity',p_pick->>'rarity',
    'packType',pack.pack_type,'version',p_pick->>'version') WHERE id=p_pack RETURNING * INTO pack;
  RETURN pack.reveal_pick;
END;
$$;
REVOKE ALL ON FUNCTION public.store_cinegeek_pack_pick(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_cinegeek_pack_pick(uuid,uuid,uuid,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.store_cinegeek_reveal(p_user uuid,p_pack uuid,p_token uuid,p_person jsonb)
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
  IF pack.reveal_pick IS NOT NULL AND (p_person->>'name' IS DISTINCT FROM pack.reveal_pick->>'name'
    OR p_person->>'rarity' IS DISTINCT FROM pack.reveal_pick->>'rarity'
    OR p_person->>'catalogue_version' IS DISTINCT FROM pack.reveal_pick->>'version') THEN RAISE EXCEPTION 'Reveal does not match the saved draw'; END IF;
  UPDATE public.user_packs SET revealed_person=jsonb_build_object('id',(p_person->>'id')::integer,'name',p_person->>'name',
    'rarity',CASE WHEN pack.reveal_pick IS NOT NULL THEN p_person->>'rarity' END,
    'catalogue_version',CASE WHEN pack.reveal_pick IS NOT NULL THEN p_person->>'catalogue_version' END,
    'profile_path',coalesce(p_person->>'profile_path',''),'known_for_department',CASE WHEN pack.pack_type='actor' THEN 'Acting' ELSE 'Directing' END),
    reveal_until=null WHERE id=p_pack RETURNING * INTO pack;
  RETURN jsonb_build_object('person',pack.revealed_person,'packType',pack.pack_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_cinegeek_pack(p_pack uuid,p_keep boolean,p_replace uuid DEFAULT NULL)
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
    ELSIF count_cards>=6 THEN RAISE EXCEPTION 'Choose a card to replace; this collection holds six'; END IF;
    INSERT INTO public.user_collection(user_id,person_id,person_name,person_type,profile_path,card_rarity,catalogue_version)
      VALUES(u,(pack.revealed_person->>'id')::integer,pack.revealed_person->>'name',pack.pack_type,pack.revealed_person->>'profile_path',pack.revealed_person->>'rarity',pack.revealed_person->>'catalogue_version');
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
  IF (SELECT count(*) FROM public.user_collection WHERE user_id=NEW.user_id AND person_type=NEW.person_type AND id<>NEW.id)>=6 THEN
    RAISE EXCEPTION 'Collection limit exceeded: choose a card to replace';
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
