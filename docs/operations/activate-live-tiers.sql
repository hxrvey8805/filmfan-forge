-- PROPOSED private-beta values. Execute ONLY after the owner approves these
-- values, the exact source is deployed, and the rollback-only checks pass.
-- No key changes, purchases, automatic renewal, top-ups or global cap increase.
BEGIN;
SELECT 1 FROM public.companion_sol_budget WHERE id='sol-beta' FOR UPDATE;
SELECT 1 FROM public.companion_usage_policy WHERE id FOR UPDATE;
DO $gate$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_sol_budget WHERE id='sol-beta'
   AND limit_micro_usd=5000000 AND halted_reason IS NULL) THEN
   RAISE EXCEPTION 'Unexpected global budget or existing halt'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_sol_calls WHERE status<>'settled') THEN
   RAISE EXCEPTION 'Reconcile unresolved provider calls before activation'; END IF;
 IF obj_description(to_regprocedure('public.get_cinegeek_access()'),'pg_proc') IS DISTINCT FROM 'cinegeek-live-tiers-v1'
   OR to_regprocedure('public.reserve_companion_question_call(uuid,uuid,uuid,uuid,bigint)') IS NULL THEN
   RAISE EXCEPTION 'Matching tier/spending migrations are not installed'; END IF;
END $gate$;
UPDATE public.companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,
 user_month_limit_micro_usd=3000000,user_day_limit_micro_usd=NULL,question_call_limit=64 WHERE id;
-- Re-enable only after the coordinated function rollout has passed. Any prior
-- provider halt is guarded above and must never be cleared by this script.
UPDATE public.companion_sol_budget SET enabled=true WHERE id='sol-beta';
COMMIT;
NOTIFY pgrst,'reload schema';
