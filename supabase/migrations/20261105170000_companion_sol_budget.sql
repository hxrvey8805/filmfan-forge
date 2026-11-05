-- Staged, disabled and unfunded. Activation requires a separately approved
-- one-off beta allowance; there is no daily reset, top-up or credit purchase.
CREATE TABLE public.companion_sol_budget (
  id text PRIMARY KEY CHECK (id = 'sol-beta'),
  enabled boolean NOT NULL DEFAULT false,
  limit_micro_usd bigint NOT NULL DEFAULT 0 CHECK (limit_micro_usd BETWEEN 0 AND 5000000),
  committed_micro_usd bigint NOT NULL DEFAULT 0 CHECK (committed_micro_usd >= 0),
  halted_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.companion_sol_budget(id) VALUES ('sol-beta');

-- Cost audit only: no questions, captions, answers, credentials or model memory.
CREATE TABLE public.companion_sol_calls (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd > 0),
  actual_micro_usd bigint CHECK (actual_micro_usd >= 0),
  generation_id text,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX companion_sol_calls_request ON public.companion_sol_calls(request_id);
ALTER TABLE public.companion_sol_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_sol_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_sol_budget, public.companion_sol_calls FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.reserve_companion_sol_call(p_call_id uuid, p_user_id uuid, p_request_id uuid, p_micro_usd bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE budget public.companion_sol_budget;
BEGIN
  IF p_micro_usd IS NULL OR p_micro_usd <= 0 OR p_micro_usd > 5000000
    OR p_call_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid companion reservation';
  END IF;
  -- Serialize all users/instances against one shared allowance. Checking a
  -- balance in application memory cannot protect simultaneous requests.
  SELECT * INTO budget FROM public.companion_sol_budget WHERE id = 'sol-beta' FOR UPDATE;
  IF NOT FOUND OR NOT budget.enabled OR budget.halted_reason IS NOT NULL
    OR budget.committed_micro_usd + p_micro_usd > budget.limit_micro_usd THEN RETURN false; END IF;
  -- A repeated RPC must not authorize a second network request with one hold.
  IF EXISTS (SELECT 1 FROM public.companion_sol_calls WHERE id = p_call_id) THEN RETURN false; END IF;
  INSERT INTO public.companion_sol_calls(id, user_id, request_id, reserved_micro_usd)
    VALUES (p_call_id, p_user_id, p_request_id, p_micro_usd);
  UPDATE public.companion_sol_budget SET committed_micro_usd = committed_micro_usd + p_micro_usd,
    updated_at = now() WHERE id = 'sol-beta';
  RETURN true;
END;
$$;

CREATE FUNCTION public.settle_companion_sol_call(p_call_id uuid, p_micro_usd bigint, p_generation_id text, p_halt_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE receipt public.companion_sol_calls;
DECLARE reason text := p_halt_reason;
BEGIN
  IF p_micro_usd < 0 OR p_micro_usd > 1000000000 OR length(p_generation_id) > 200 OR length(reason) > 100 THEN
    RAISE EXCEPTION 'Invalid companion settlement';
  END IF;
  -- Same lock order as reserve; never refund an absent or ambiguous receipt.
  PERFORM 1 FROM public.companion_sol_budget WHERE id = 'sol-beta' FOR UPDATE;
  SELECT * INTO receipt FROM public.companion_sol_calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF receipt.status <> 'reserved' THEN
    RETURN receipt.actual_micro_usd IS NOT DISTINCT FROM p_micro_usd
      AND receipt.generation_id IS NOT DISTINCT FROM p_generation_id;
  END IF;
  IF p_micro_usd IS NULL THEN reason := coalesce(reason, 'unknown_cost');
  ELSIF p_micro_usd > receipt.reserved_micro_usd THEN reason := 'cost_exceeded_reservation'; END IF;
  UPDATE public.companion_sol_calls SET actual_micro_usd = p_micro_usd,
    generation_id = p_generation_id, status = CASE WHEN p_micro_usd IS NULL THEN 'unknown' ELSE 'settled' END,
    settled_at = now() WHERE id = p_call_id;
  UPDATE public.companion_sol_budget SET
    committed_micro_usd = committed_micro_usd - receipt.reserved_micro_usd + coalesce(p_micro_usd, receipt.reserved_micro_usd),
    halted_reason = coalesce(halted_reason, reason), updated_at = now()
    WHERE id = 'sol-beta';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_companion_sol_call(uuid,uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_companion_sol_call(uuid,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_companion_sol_call(uuid,uuid,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_companion_sol_call(uuid,bigint,text,text) TO service_role;
