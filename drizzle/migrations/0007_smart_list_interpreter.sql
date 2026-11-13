-- Separate $0-only feature; does not touch companion questions, coins or its $5 budget.
CREATE TABLE public.smart_list_interpretations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object')
);
CREATE INDEX smart_list_interpretations_user_date ON public.smart_list_interpretations(user_id, created_at DESC);
CREATE INDEX smart_list_interpretations_date ON public.smart_list_interpretations(created_at);
ALTER TABLE public.smart_list_interpretations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smart_list_interpretations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_list_interpretations TO service_role;

CREATE FUNCTION public.reserve_smart_list_interpretation(p_user uuid, p_hash text, p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved jsonb;
BEGIN
  -- Serialise cache checks/reservations across all edge instances. Failed calls count too.
  PERFORM pg_advisory_xact_lock(611121600);
  DELETE FROM public.smart_list_interpretations WHERE created_at < now() - interval '30 days';
  SELECT result INTO saved FROM public.smart_list_interpretations
    WHERE user_id = p_user AND request_hash = p_hash AND result IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  IF saved IS NOT NULL THEN RETURN jsonb_build_object('status', 'cached', 'result', saved); END IF;
  IF EXISTS (SELECT 1 FROM public.smart_list_interpretations WHERE user_id = p_user AND created_at > now() - interval '30 seconds') THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  IF (SELECT count(*) FROM public.smart_list_interpretations WHERE user_id = p_user AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') >= 5
    OR (SELECT count(*) FROM public.smart_list_interpretations WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') >= 100 THEN
    RETURN jsonb_build_object('status', 'limited');
  END IF;
  INSERT INTO public.smart_list_interpretations(id, user_id, request_hash) VALUES (p_call, p_user, p_hash);
  RETURN jsonb_build_object('status', 'reserved');
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_smart_list_interpretation(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_smart_list_interpretation(uuid, text, uuid) TO service_role;
