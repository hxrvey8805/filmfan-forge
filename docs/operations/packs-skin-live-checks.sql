-- Disposable, rollback-only checks. No existing user's XP, cards, packs or plan is changed.
CREATE OR REPLACE FUNCTION pg_temp.cinegeek_pack_skin_verify() RETURNS jsonb LANGUAGE plpgsql AS $check$
DECLARE
 u uuid:=gen_random_uuid(); free_u uuid:=gen_random_uuid(); annual_u uuid:=gen_random_uuid(); full_u uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); pack_id uuid; lease uuid; r jsonb; replay jsonb; version text; pick jsonb; person jsonb;
 checks text[]:='{}'; n integer; old_card uuid; second_card uuid;
BEGIN
 BEGIN
  INSERT INTO auth.users(id) VALUES(u),(free_u),(annual_u),(full_u);
  INSERT INTO public.cinegeek_xp(user_id,available,lifetime) VALUES(u,1250,1250),(free_u,2000,2000),(annual_u,2000,2000),(full_u,2000,2000);
  INSERT INTO public.companion_pro_entitlements(user_id,plan,anchor,valid_until,verified_transaction_id)
  VALUES(u,'monthly',now()-interval '1 day',now()+interval '1 day',gen_random_uuid()::text),
        (annual_u,'annual',now()-interval '1 day',now()+interval '1 day',gen_random_uuid()::text),
        (full_u,'monthly',now()-interval '1 day',now()+interval '1 day',gen_random_uuid()::text);
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  SET LOCAL ROLE authenticated;
  r:=public.redeem_cinegeek_xp(request_id,'skin:random');
  replay:=public.redeem_cinegeek_xp(request_id,'skin:random');
  IF r IS DISTINCT FROM replay OR r->>'item'<>'skin:random' OR (r->>'xpBalance')::int<>500 OR coalesce(r->>'skin','')='' THEN RAISE EXCEPTION 'FAIL random receipt/debit/replay'; END IF;
  RESET ROLE;
  IF (SELECT count(*) FROM public.cinegeek_unlocks WHERE user_id=u AND kind='skin' AND item=r->>'skin')<>1 OR (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<>500 THEN RAISE EXCEPTION 'FAIL random unlock'; END IF;
  checks:=array_append(checks,'Monthly random unlock: one skin, 750 XP once, receipt replay stable');
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.redeem_cinegeek_xp(gen_random_uuid(),'skin:random'); RAISE EXCEPTION 'FAIL insufficient XP accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Not enough XP%' THEN RAISE; END IF; END;
  BEGIN
   PERFORM public.redeem_cinegeek_xp(gen_random_uuid(),'skin:jedi'); RAISE EXCEPTION 'FAIL specific skin accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%only be unlocked at random%' THEN RAISE; END IF; END;
  RESET ROLE;
  IF (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<>500 THEN RAISE EXCEPTION 'FAIL rejected purchase charged'; END IF;
  checks:=array_append(checks,'Insufficient XP and specific-skin requests rejected without debit');
  PERFORM set_config('request.jwt.claim.sub',free_u::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.redeem_cinegeek_xp(gen_random_uuid(),'skin:random'); RAISE EXCEPTION 'FAIL Free skin accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Monthly Pro%' THEN RAISE; END IF; END;
  BEGIN
   PERFORM public.redeem_cinegeek_xp(request_id,'skin:random'); RAISE EXCEPTION 'FAIL cross-account receipt';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Request already used%' THEN RAISE; END IF; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',annual_u::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.redeem_cinegeek_xp(gen_random_uuid(),'skin:random'); RAISE EXCEPTION 'FAIL Annual skin accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Monthly Pro%' THEN RAISE; END IF; END;
  RESET ROLE;
  INSERT INTO public.cinegeek_unlocks(user_id,item,kind)
  SELECT full_u,item,'skin' FROM unnest(ARRAY['breaking','stranger','trek','matrix','jurassic','jedi','chucky','karate','mha','peaky','spider','hogwarts','thrones','pulp','social','squid','dune','scar','gladiator','wolf']) item;
  PERFORM set_config('request.jwt.claim.sub',full_u::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.redeem_cinegeek_xp(gen_random_uuid(),'skin:random'); RAISE EXCEPTION 'FAIL full wardrobe charged';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Every skin is already unlocked%' THEN RAISE; END IF; END;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM public.cinegeek_xp WHERE user_id IN(free_u,annual_u,full_u) AND available<>2000) THEN RAISE EXCEPTION 'FAIL denial debited wallet'; END IF;
  checks:=array_append(checks,'Free, Annual, full wardrobe and cross-account receipt denied; no debit');
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  FOREACH version IN ARRAY ARRAY['cinegeek-cast-1','cinegeek-cast-2'] LOOP
   lease:=gen_random_uuid();
   pick:=jsonb_build_object('name',CASE WHEN version='cinegeek-cast-1' THEN 'Emma Stone' ELSE 'Joseph Zada' END,'packType','actor','rarity','star','version',version);
   person:=jsonb_build_object('id',CASE WHEN version='cinegeek-cast-1' THEN 54693 ELSE 4744857 END,'name',pick->>'name','rarity','star','catalogue_version',version,'profile_path',null);
   INSERT INTO public.user_packs(user_id,pack_type) VALUES(u,'actor') RETURNING id INTO pack_id;
   SET LOCAL ROLE service_role;
   PERFORM public.claim_cinegeek_pack(u,pack_id,lease);
   r:=public.store_cinegeek_pack_pick(u,pack_id,lease,pick);
   replay:=public.store_cinegeek_pack_pick(u,pack_id,lease,pick||'{"name":"Changed"}'::jsonb);
   IF r IS DISTINCT FROM pick OR replay IS DISTINCT FROM pick THEN RAISE EXCEPTION 'FAIL saved draw rerolled'; END IF;
   PERFORM public.store_cinegeek_reveal(u,pack_id,lease,person);
   RESET ROLE;
   SET LOCAL ROLE authenticated;
   r:=public.decide_cinegeek_pack(pack_id,true);
   IF public.decide_cinegeek_pack(pack_id,true) IS DISTINCT FROM r THEN RAISE EXCEPTION 'FAIL keep replay'; END IF;
   RESET ROLE;
  END LOOP;
  SELECT count(*) INTO n FROM public.user_collection WHERE user_id=u AND catalogue_version IN ('cinegeek-cast-1','cinegeek-cast-2');
  IF n<>2 THEN RAISE EXCEPTION 'FAIL preserved versioned cards'; END IF;
  checks:=array_append(checks,'v1 and v2 saved draws, reveals, keep and retries preserved');
  -- Full shelf: no standalone removal, and old clients cannot trigger an undisclosed charge.
  INSERT INTO public.user_collection(user_id,person_id,person_name,person_type,profile_path)
    SELECT u,i,'Fixture '||i,'actor','' FROM generate_series(1001,1004) i;
  SELECT id INTO old_card FROM public.user_collection WHERE user_id=u AND person_id=1001;
  SELECT id INTO second_card FROM public.user_collection WHERE user_id=u AND person_id=1002;
  INSERT INTO public.user_packs(user_id,pack_type,revealed_person)
    VALUES(u,'actor','{"id":1005,"name":"Replacement fixture","profile_path":""}'::jsonb) RETURNING id INTO pack_id;
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.decide_cinegeek_pack(pack_id,true,old_card); RAISE EXCEPTION 'FAIL free replacement accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%confirm the 450%' THEN RAISE; END IF; END;
  r:=public.decide_cinegeek_pack_v2(pack_id,true,old_card,450);
  IF r IS DISTINCT FROM public.decide_cinegeek_pack_v2(pack_id,true,old_card,450)
    OR r->>'decision'<>'kept' OR (r->>'replacementXp')::int<>450 THEN RAISE EXCEPTION 'FAIL replacement receipt'; END IF;
  RESET ROLE;
  IF (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<>50
    OR (SELECT count(*) FROM public.user_collection WHERE user_id=u)<>6
    OR EXISTS(SELECT 1 FROM public.user_collection WHERE id=old_card)
    OR (SELECT count(*) FROM public.cinegeek_xp_events WHERE user_id=u AND kind='card_replacement' AND amount=-450)<>1
    THEN RAISE EXCEPTION 'FAIL replacement debit or collection'; END IF;
  checks:=array_append(checks,'450 XP full-shelf swap charged once; legacy free-swap request refused');
  INSERT INTO public.user_packs(user_id,pack_type,revealed_person)
    VALUES(u,'actor','{"id":1006,"name":"Pending fixture","profile_path":""}'::jsonb) RETURNING id INTO pack_id;
  SET LOCAL ROLE authenticated;
  BEGIN
   PERFORM public.decide_cinegeek_pack_v2(pack_id,true,second_card,450); RAISE EXCEPTION 'FAIL insufficient replacement accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%need 450 XP%' THEN RAISE; END IF; END;
  RESET ROLE;
  IF (SELECT available FROM public.cinegeek_xp WHERE user_id=u)<>50
    OR NOT EXISTS(SELECT 1 FROM public.user_collection WHERE id=second_card)
    OR NOT EXISTS(SELECT 1 FROM public.user_packs WHERE id=pack_id AND NOT is_opened)
    OR has_table_privilege('authenticated','public.user_collection','INSERT,UPDATE,DELETE')
    OR has_function_privilege('anon','public.decide_cinegeek_pack_v2(uuid,boolean,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.decide_cinegeek_pack_v2(uuid,boolean,uuid,integer)','EXECUTE')
    THEN RAISE EXCEPTION 'FAIL replacement safeguards'; END IF;
  checks:=array_append(checks,'Insufficient XP preserves reveal and card; direct edits and unauthenticated swaps denied');
  IF has_function_privilege('authenticated','public.store_cinegeek_pack_pick(uuid,uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.redeem_cinegeek_xp(uuid,text)','EXECUTE') OR has_function_privilege('service_role','public.redeem_cinegeek_xp(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'FAIL private RPC permissions'; END IF;
  checks:=array_append(checks,'Service-only draw and authenticated-only XP redemption permissions');
  RAISE EXCEPTION USING ERRCODE='ZC039',MESSAGE='Rollback disposable pack and skin fixtures';
 EXCEPTION WHEN SQLSTATE 'ZC039' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id IN(u,free_u,annual_u,full_u)) THEN RAISE EXCEPTION 'FAIL disposable fixtures remained'; END IF;
 RETURN jsonb_build_object('passed',true,'checks',to_jsonb(checks),'fixtures_rolled_back',true,'checked_at',clock_timestamp());
END $check$;
SELECT pg_temp.cinegeek_pack_skin_verify() AS receipt;
