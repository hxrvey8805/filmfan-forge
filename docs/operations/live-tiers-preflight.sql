-- Read-only. Stop on any unexpected result before changing live data.
SELECT version FROM supabase_migrations.schema_migrations WHERE version IN
 ('20261113190000','20261113200000','20261114120000','20261116100000') ORDER BY version;
SELECT to_regclass('public.companion_usage_policy') AS usage_policy,
 obj_description(to_regprocedure('public.get_cinegeek_access()'),'pg_proc') AS access_revision,
 obj_description(to_regprocedure('public.get_companion_allowance()'),'pg_proc') AS allowance_revision;
SELECT enabled,limit_micro_usd,committed_micro_usd,halted_reason FROM public.companion_sol_budget WHERE id='sol-beta';
SELECT count(*) AS unresolved FROM public.companion_sol_calls WHERE status<>'settled';
SELECT user_id,person_type,count(*) FROM public.user_collection GROUP BY user_id,person_type HAVING count(*)>5;
SELECT count(*) AS unopened_premium FROM public.user_packs WHERE NOT is_opened AND pack_tier<>'standard';
SELECT user_id,starts_at,expires_at,revoked,reason FROM public.cinegeek_private_monthly_grants;
SELECT count(*) AS wallets,sum(greatest(0,coins)) AS coins FROM public.user_stats;
SELECT count(*) AS packs FROM public.user_packs;
SELECT count(*) AS cards FROM public.user_collection;
