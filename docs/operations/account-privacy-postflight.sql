-- Read-only postflight. Contains no account IDs, messages or credentials.
SELECT public.cinegeek_account_privacy_ready() AS privacy_revision;
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname='public' AND tablename='cinegeek_ai_permissions';
SELECT role_name,
 has_table_privilege(role_name,'public.cinegeek_ai_permissions','SELECT,INSERT,UPDATE,DELETE') AS direct_table_access,
 has_function_privilege(role_name,'public.get_ai_privacy_choices()','EXECUTE') AS own_choices,
 has_function_privilege(role_name,'public.set_ai_privacy_choice(text,boolean,text)','EXECUTE') AS own_update,
 has_function_privilege(role_name,'public.cinegeek_ai_allowed(uuid,text,text)','EXECUTE') AS service_permission,
 has_function_privilege(role_name,'public.cinegeek_account_privacy_ready()','EXECUTE') AS deletion_readiness
 FROM unnest(ARRAY['anon','authenticated','service_role']) AS role_name;
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid='auth.users'::regclass AND tgname='cinegeek_erase_purchase_details';
SELECT conrelid::regclass AS child_table, conname, confdeltype, convalidated
 FROM pg_constraint WHERE contype='f' AND
 (conname LIKE '%_privacy_owner_fk' OR conname IN ('companion_question_requests_user_id_fkey',
 'companion_question_calls_call_id_fkey','companion_question_calls_request_id_fkey'))
 ORDER BY conrelid::regclass::text, conname;
SELECT count(*) AS permission_rows FROM public.cinegeek_ai_permissions;
SELECT * FROM public.companion_usage_policy;
SELECT enabled,limit_micro_usd,committed_micro_usd,halted_reason
 FROM public.companion_sol_budget WHERE id='sol-beta';
