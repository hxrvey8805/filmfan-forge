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
    kind:='skin'; price:=1500;
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
