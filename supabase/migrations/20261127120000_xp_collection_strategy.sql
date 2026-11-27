BEGIN;
-- Prices only: no purchase enablement, entitlement, AI or budget changes.
-- A stored cost preserves historical free decisions and makes retries stable.
ALTER TABLE public.user_packs ADD COLUMN replacement_xp_cost integer NOT NULL DEFAULT 0
  CHECK (replacement_xp_cost IN (0,450));

CREATE FUNCTION public.decide_cinegeek_pack_v2(p_pack uuid,p_keep boolean,p_replace uuid,p_expected_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); pack public.user_packs; count_cards integer;
  old public.user_collection; result text; price integer:=0;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  SELECT * INTO pack FROM public.user_packs WHERE id=p_pack AND user_id=u FOR UPDATE;
  IF NOT FOUND OR p_keep IS NULL OR pack.revealed_person IS NULL THEN RAISE EXCEPTION 'Reveal this pack first'; END IF;
  result:=CASE WHEN p_keep THEN 'kept' ELSE 'skipped' END;
  IF pack.is_opened THEN
    IF pack.decision IS DISTINCT FROM result OR pack.replaced_card_id IS DISTINCT FROM p_replace
      OR pack.replacement_xp_cost IS DISTINCT FROM p_expected_cost THEN RAISE EXCEPTION 'Pack already decided'; END IF;
    RETURN jsonb_build_object('decision',pack.decision,'replacementXp',pack.replacement_xp_cost);
  END IF;
  IF NOT p_keep AND p_replace IS NOT NULL THEN RAISE EXCEPTION 'Invalid replacement'; END IF;
  IF p_keep THEN
    IF EXISTS(SELECT 1 FROM public.user_collection WHERE user_id=u AND person_id=(pack.revealed_person->>'id')::integer)
      THEN RAISE EXCEPTION 'This person is already in your collection'; END IF;
    SELECT count(*) INTO count_cards FROM public.user_collection WHERE user_id=u AND person_type=pack.pack_type;
    IF p_replace IS NOT NULL THEN
      SELECT * INTO old FROM public.user_collection WHERE id=p_replace AND user_id=u AND person_type=pack.pack_type;
      IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your own cards from this collection'; END IF;
      IF count_cards<>6 THEN RAISE EXCEPTION 'Replacement is only available when all six slots are full'; END IF;
      price:=450;
    ELSIF count_cards>=6 THEN RAISE EXCEPTION 'Choose a card to replace; this collection holds six'; END IF;
  END IF;
  -- Older clients can keep/skip, but cannot silently spend XP on a swap.
  IF p_expected_cost IS DISTINCT FROM price THEN
    RAISE EXCEPTION 'Update CineGeek and confirm the 450 XP replacement price';
  END IF;
  IF price>0 THEN
    IF (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<price THEN
      RAISE EXCEPTION 'You need 450 XP to replace a card. Your reveal is saved; earn more XP or skip it.';
    END IF;
    UPDATE public.cinegeek_xp SET available=available-price WHERE user_id=u;
    DELETE FROM public.user_collection WHERE id=old.id;
    INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details)
      VALUES(gen_random_uuid(),u,'card_replacement',-price,jsonb_build_object('packId',p_pack,'replacedCardId',p_replace));
  END IF;
  IF p_keep THEN
    INSERT INTO public.user_collection(user_id,person_id,person_name,person_type,profile_path,card_rarity,catalogue_version)
      VALUES(u,(pack.revealed_person->>'id')::integer,pack.revealed_person->>'name',pack.pack_type,
        pack.revealed_person->>'profile_path',pack.revealed_person->>'rarity',pack.revealed_person->>'catalogue_version');
  END IF;
  UPDATE public.user_packs SET is_opened=true,opened_at=now(),decision=result,replaced_card_id=p_replace,replacement_xp_cost=price WHERE id=p_pack;
  RETURN jsonb_build_object('decision',result,'replacementXp',price);
END;
$$;

-- Preserve the old response shape and old completed receipts, but not free new swaps.
CREATE OR REPLACE FUNCTION public.decide_cinegeek_pack(p_pack uuid,p_keep boolean,p_replace uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.decide_cinegeek_pack_v2(p_pack,p_keep,p_replace,0)-'replacementXp';
$$;
REVOKE ALL ON FUNCTION public.decide_cinegeek_pack_v2(uuid,boolean,uuid,integer),
  public.decide_cinegeek_pack(uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decide_cinegeek_pack_v2(uuid,boolean,uuid,integer),
  public.decide_cinegeek_pack(uuid,boolean,uuid) TO authenticated;
-- No standalone removal/selling or client-side balance/card edits.
REVOKE INSERT,UPDATE,DELETE ON public.user_collection,public.user_packs,public.cinegeek_xp,public.cinegeek_xp_events
  FROM PUBLIC,anon,authenticated;

-- Monthly-only random unowned skin; direct selection retired.
-- Existing owned skins and completed redemption receipts are preserved.
CREATE OR REPLACE FUNCTION public.redeem_cinegeek_xp(p_request uuid,p_item text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); price integer; old public.cinegeek_xp_events; pack uuid; kind text; skin text; result jsonb; balance bigint;
BEGIN
  PERFORM public.cinegeek_lock_wallet(u);
  IF p_request IS NULL OR p_item IS NULL THEN RAISE EXCEPTION 'Invalid redemption'; END IF;
  SELECT * INTO old FROM public.cinegeek_xp_events WHERE id=p_request;
  IF FOUND THEN
    IF old.user_id<>u OR old.kind<>'redeem' OR old.details->>'item' IS DISTINCT FROM p_item THEN RAISE EXCEPTION 'Request already used'; END IF;
    RETURN old.details;
  END IF;
  IF p_item IN ('pack:actor','pack:director') THEN price:=150; kind:='pack';
  ELSIF p_item='skin:random' THEN
    kind:='skin'; price:=750;
    IF public.cinegeek_plan(u)<>'monthly' THEN RAISE EXCEPTION 'Random skins are for Monthly Pro; Annual includes all skins'; END IF;
    SELECT candidate INTO skin FROM unnest(ARRAY[
      'breaking','stranger','trek','matrix','jurassic','jedi','chucky','karate','mha','peaky','spider',
      'hogwarts','thrones','pulp','social','squid','dune','scar','gladiator','wolf'
    ]) candidate
    WHERE NOT EXISTS(SELECT 1 FROM public.cinegeek_unlocks owned
      WHERE owned.user_id=u AND owned.kind='skin' AND owned.item=candidate)
    ORDER BY random() LIMIT 1;
    IF skin IS NULL THEN RAISE EXCEPTION 'Every skin is already unlocked'; END IF;
  ELSIF p_item LIKE 'skin:%' THEN
    RAISE EXCEPTION 'Skins can only be unlocked at random';
  ELSE RAISE EXCEPTION 'XP cannot buy this item'; END IF;
  IF (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<price THEN RAISE EXCEPTION 'Not enough XP'; END IF;
  UPDATE public.cinegeek_xp SET available=available-price WHERE user_id=u RETURNING available INTO balance;
  IF kind='pack' THEN
    INSERT INTO public.user_packs(user_id,pack_type,pack_tier) VALUES(u,substr(p_item,6),'standard') RETURNING id INTO pack;
  ELSE INSERT INTO public.cinegeek_unlocks(user_id,item,kind) VALUES(u,skin,'skin'); END IF;
  result:=jsonb_build_object('item',p_item,'packId',pack);
  IF kind='skin' THEN result:=result||jsonb_build_object('skin',skin,'xpBalance',balance); END IF;
  INSERT INTO public.cinegeek_xp_events(id,user_id,kind,amount,details)
    VALUES(p_request,u,'redeem',-price,result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_cinegeek_xp(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.redeem_cinegeek_xp(uuid,text) TO authenticated;

COMMIT;
