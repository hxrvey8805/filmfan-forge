-- Read-only proof; no questions, grants, paid calls or test purchases.
SELECT * FROM public.companion_usage_policy;
SELECT enabled,limit_micro_usd,committed_micro_usd,halted_reason FROM public.companion_sol_budget WHERE id='sol-beta';
SELECT count(*) AS unresolved FROM public.companion_sol_calls WHERE status<>'settled';
SELECT count(*) AS bad_wallets FROM public.user_stats s LEFT JOIN public.cinegeek_xp x ON x.user_id=s.user_id
 WHERE x.user_id IS NULL OR x.lifetime<>greatest(0,s.coins);
SELECT count(*) AS packs FROM public.user_packs;
SELECT count(*) AS cards FROM public.user_collection;
SELECT user_id,starts_at,expires_at,revoked FROM public.cinegeek_private_monthly_grants;
SELECT obj_description(to_regprocedure('public.get_cinegeek_access()'),'pg_proc') AS access_revision,
 obj_description(to_regprocedure('public.get_companion_allowance()'),'pg_proc') AS allowance_revision;
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND
 (tablename LIKE 'cinegeek_%' OR tablename LIKE 'companion_question_%' OR tablename LIKE 'companion_usage_%');
SELECT role_name,has_table_privilege(role_name,'public.cinegeek_private_monthly_grants','SELECT,INSERT,UPDATE,DELETE') AS private_grants,
 has_table_privilege(role_name,'public.companion_usage_policy','UPDATE') AS policy_write,
 has_function_privilege(role_name,'public.begin_companion_question_before_spending(uuid,uuid,uuid,jsonb)','EXECUTE') AS legacy_bypass
 FROM unnest(ARRAY['anon','authenticated','service_role']) role_name;
