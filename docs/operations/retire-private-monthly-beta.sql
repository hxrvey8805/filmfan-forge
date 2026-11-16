-- Run in the same deployment transaction immediately BEFORE the full tier migrations.
-- Preserve all unrelated RPCs and grants. Never run against the completed tier system.
DO $retire$ BEGIN
  IF obj_description(to_regprocedure('public.get_cinegeek_access()'),'pg_proc')='cinegeek-private-monthly-bridge-v1'
    AND obj_description(to_regprocedure('public.get_companion_allowance()'),'pg_proc')='cinegeek-private-monthly-bridge-v1' THEN
    DROP FUNCTION public.get_cinegeek_access();
    DROP FUNCTION public.get_companion_allowance();
  ELSIF to_regprocedure('public.get_cinegeek_access()') IS NOT NULL
    OR to_regprocedure('public.get_companion_allowance()') IS NOT NULL THEN
    RAISE EXCEPTION 'Full or unexpected access RPCs exist; do not replace them';
  END IF;
END $retire$;
