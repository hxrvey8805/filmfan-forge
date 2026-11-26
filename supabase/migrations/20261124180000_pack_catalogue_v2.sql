-- Add v2 draws without rewriting any existing cards, saved picks, XP or entitlements.
ALTER TABLE public.user_collection DROP CONSTRAINT IF EXISTS user_collection_card_rarity_check;
ALTER TABLE public.user_collection ADD CONSTRAINT user_collection_card_rarity_check
  CHECK (card_rarity IN ('established','discovery','featured','star','icon'));

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
  IF jsonb_typeof(p_pick) IS DISTINCT FROM 'object' OR NOT (
      (coalesce(p_pick->>'version','')='cinegeek-cast-1' AND coalesce(p_pick->>'rarity','') IN ('established','star','icon'))
      OR (coalesce(p_pick->>'version','')='cinegeek-cast-2' AND coalesce(p_pick->>'rarity','') IN ('discovery','featured','star','icon')))
    OR p_pick->>'packType' IS DISTINCT FROM pack.pack_type
    OR coalesce(length(p_pick->>'name'),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid pack draw'; END IF;
  UPDATE public.user_packs SET reveal_pick=jsonb_build_object('name',p_pick->>'name','rarity',p_pick->>'rarity',
    'packType',pack.pack_type,'version',p_pick->>'version') WHERE id=p_pack RETURNING * INTO pack;
  RETURN pack.reveal_pick;
END;
$$;
REVOKE ALL ON FUNCTION public.store_cinegeek_pack_pick(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_cinegeek_pack_pick(uuid,uuid,uuid,jsonb) TO service_role;
