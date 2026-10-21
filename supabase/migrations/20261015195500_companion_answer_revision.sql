-- Preserve previous conversations as records, but do not reuse them under the
-- new evidence/verification contract. No historical row is modified or deleted.
CREATE OR REPLACE FUNCTION public.record_companion_answer(p_user_id uuid, p_conversation jsonb, p_charge boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  usage_row public.user_ai_usage;
  saved public.ai_conversations;
  balance integer;
  charged integer := 0;
  today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Reject old in-flight function versions during rollout, before any charging.
  IF p_conversation->>'companion_version' IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'Companion upgrade required';
  END IF;
  INSERT INTO public.user_ai_usage(user_id, last_reset_date) VALUES (p_user_id, today)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO usage_row FROM public.user_ai_usage WHERE user_id = p_user_id FOR UPDATE;
  IF usage_row.last_reset_date <> today THEN
    UPDATE public.user_ai_usage SET questions_today = 0, last_reset_date = today
      WHERE user_id = p_user_id RETURNING * INTO usage_row;
  END IF;
  SELECT * INTO saved FROM public.ai_conversations
    WHERE id = (p_conversation->>'id')::uuid AND user_id = p_user_id;
  IF FOUND THEN
    IF saved.companion_version IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'Request ID belongs to an older companion version';
    END IF;
    IF saved.title_id IS DISTINCT FROM (p_conversation->>'title_id')::integer
      OR saved.media_type IS DISTINCT FROM p_conversation->>'media_type'
      OR saved.season_number IS DISTINCT FROM (p_conversation->>'season_number')::integer
      OR saved.episode_number IS DISTINCT FROM (p_conversation->>'episode_number')::integer
      OR saved.position_seconds IS DISTINCT FROM (p_conversation->>'position_seconds')::integer
      OR saved.question IS DISTINCT FROM p_conversation->>'question' THEN
      RAISE EXCEPTION 'Request ID already used for a different question';
    END IF;
    RETURN jsonb_build_object('conversation', to_jsonb(saved), 'remainingFreeQuestions',
      greatest(0, 5 - usage_row.questions_today), 'usedCoins', 0);
  END IF;
  IF p_charge AND usage_row.questions_today >= 5 THEN
    INSERT INTO public.user_stats(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT coins INTO balance FROM public.user_stats WHERE user_id = p_user_id FOR UPDATE;
    IF balance < 150 THEN RAISE EXCEPTION 'Insufficient coins' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.user_stats SET coins = coins - 150 WHERE user_id = p_user_id;
    charged := 150;
  END IF;
  IF p_charge THEN
    UPDATE public.user_ai_usage SET questions_today = questions_today + 1, total_questions = total_questions + 1
      WHERE user_id = p_user_id RETURNING * INTO usage_row;
  END IF;
  INSERT INTO public.ai_conversations(id, user_id, title_id, media_type, question, answer,
    context, season_number, episode_number, timestamp, position_seconds, companion_version,
    evidence, answer_status, used_coins)
  VALUES ((p_conversation->>'id')::uuid, p_user_id, (p_conversation->>'title_id')::integer,
    p_conversation->>'media_type', p_conversation->>'question', p_conversation->>'answer',
    p_conversation->>'context', (p_conversation->>'season_number')::integer,
    (p_conversation->>'episode_number')::integer, p_conversation->>'timestamp',
    (p_conversation->>'position_seconds')::integer, 3, p_conversation->'evidence',
    p_conversation->>'answer_status', charged)
  RETURNING * INTO saved;
  RETURN jsonb_build_object('conversation', to_jsonb(saved), 'remainingFreeQuestions',
    greatest(0, 5 - usage_row.questions_today), 'usedCoins', charged);
END;
$$;
REVOKE ALL ON FUNCTION public.record_companion_answer(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_companion_answer(uuid,jsonb,boolean) TO service_role;
