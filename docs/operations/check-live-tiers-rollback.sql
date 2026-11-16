-- No provider is contacted. All temporary grants, quota holds, synthetic money
-- reservations and policy edits are rolled back. Run with the database owner.
-- Optional session setting cinegeek.rollout_user selects an existing test owner;
-- otherwise use the sole active private grant. Never execute this with COMMIT.
BEGIN;
DO $checks$
DECLARE u uuid; result jsonb; a jsonb; request_id uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid();
 scope jsonb:='{"title_id":66573,"media_type":"tv","season_number":1,"episode_number":1,"position_seconds":659,"question":"Rollout scope check","companion_version":"rollout-check"}';
 before_money bigint; before_calls bigint; grant_count integer;
BEGIN
 u:=nullif(current_setting('cinegeek.rollout_user',true),'')::uuid;
 IF u IS NULL THEN
   SELECT count(*) INTO grant_count FROM public.cinegeek_private_monthly_grants WHERE NOT revoked AND starts_at<=now() AND expires_at>now();
   IF grant_count<>1 THEN RAISE EXCEPTION 'Choose an existing private test user explicitly'; END IF;
   SELECT user_id INTO u FROM public.cinegeek_private_monthly_grants WHERE NOT revoked AND starts_at<=now() AND expires_at>now();
 END IF;
 IF EXISTS(SELECT 1 FROM public.companion_pro_entitlements WHERE user_id=u) THEN
   RAISE EXCEPTION 'Use an existing private-only test account, not a paid subscriber'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cinegeek_private_monthly_grants WHERE user_id=u AND NOT revoked AND starts_at<=now() AND expires_at>now()) THEN
   RAISE EXCEPTION 'An active private grant is required'; END IF;
 SELECT committed_micro_usd INTO before_money FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
 SELECT count(*) INTO before_calls FROM public.companion_sol_calls;
 PERFORM 1 FROM public.companion_usage_policy WHERE id FOR UPDATE;
 UPDATE public.companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000,user_day_limit_micro_usd=NULL,question_call_limit=64 WHERE id;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 a:=public.get_cinegeek_access(); result:=public.get_companion_allowance();
 IF a->>'plan'<>'monthly' OR (a->>'purchasesEnabled')::boolean OR NOT (a->>'smartLists')::boolean
   OR (result->>'limit')::integer<>15 THEN RAISE EXCEPTION 'Monthly access mismatch'; END IF;
 UPDATE public.cinegeek_private_monthly_grants SET revoked=true WHERE user_id=u;
 a:=public.get_cinegeek_access();result:=public.get_companion_allowance();
 IF a->>'plan'<>'free' OR (a->>'smartLists')::boolean OR (result->>'included')::integer<>0 THEN RAISE EXCEPTION 'Free access mismatch'; END IF;
 IF public.begin_companion_question(u,request_id,attempt,scope)->>'error'<>'questions_exhausted' THEN RAISE EXCEPTION 'Free can start an included question'; END IF;
 UPDATE public.cinegeek_private_monthly_grants SET revoked=false WHERE user_id=u;
 -- This receipt marker never leaves this rolled-back transaction.
 INSERT INTO public.companion_pro_entitlements(user_id,plan,anchor,valid_until,verified_transaction_id)
   VALUES(u,'annual',now()-interval '1 day',now()+interval '1 year','ROLLBACK_ONLY_'||request_id);
 a:=public.get_cinegeek_access();result:=public.get_companion_allowance();
 IF a->>'plan'<>'annual' OR NOT (a->>'allSkins')::boolean OR (a->>'purchasesEnabled')::boolean
   OR (result->>'limit')::integer<>15 THEN RAISE EXCEPTION 'Annual access mismatch'; END IF;
 result:=public.begin_companion_question(u,request_id,attempt,scope);
 IF result->>'mode'<>'monthly' THEN RAISE EXCEPTION 'Quota reservation failed'; END IF;
 PERFORM public.end_companion_question_attempt(u,request_id,attempt,true);
 IF public.begin_companion_question(u,request_id,gen_random_uuid(),scope||'{"position_seconds":658}') ->>'error'<>'request_mismatch'
   OR public.begin_companion_question(u,request_id,gen_random_uuid(),scope||'{"episode_number":2}') ->>'error'<>'request_mismatch' THEN
   RAISE EXCEPTION 'Rewind/episode scope leaked'; END IF;
 attempt:=gen_random_uuid(); result:=public.begin_companion_question(u,request_id,attempt,scope);
 IF result->>'mode'<>'monthly' THEN RAISE EXCEPTION 'Original scope did not resume'; END IF;
 -- Over-limit reservation is denied before a provider call or ledger debit.
 IF public.reserve_companion_question_call(gen_random_uuid(),u,request_id,attempt,350001) THEN RAISE EXCEPTION 'Whole-question limit bypass'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companion_question_requests WHERE id=request_id AND budget_block_reason='question_limit') THEN
   RAISE EXCEPTION 'Budget denial not retained'; END IF;
 IF before_money<>(SELECT committed_micro_usd FROM public.companion_sol_budget WHERE id='sol-beta')
   OR before_calls<>(SELECT count(*) FROM public.companion_sol_calls) THEN RAISE EXCEPTION 'Denied check spent money'; END IF;
 IF has_function_privilege('authenticated','public.begin_companion_question(uuid,uuid,uuid,jsonb)','EXECUTE')
   OR has_function_privilege('service_role','public.begin_companion_question_before_spending(uuid,uuid,uuid,jsonb)','EXECUTE')
   OR has_table_privilege('authenticated','public.cinegeek_xp','INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role','public.companion_usage_policy','UPDATE') THEN RAISE EXCEPTION 'Tier/money permissions bypass'; END IF;
END $checks$;
SELECT 'PASS: Free, Monthly, Annual, purchases disabled, scope boundaries, budget denial, private permissions; no provider calls' AS result;
ROLLBACK;
