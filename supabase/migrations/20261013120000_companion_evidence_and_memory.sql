-- Legacy chunks may contain collapsed timing or guessed speakers. Only new raw
-- cue records are eligible for the companion; no existing user data is deleted.
ALTER TABLE public.subtitle_chunks
  ADD COLUMN ingestion_version integer NOT NULL DEFAULT 1,
  ADD COLUMN cues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN cache_key text UNIQUE,
  ADD COLUMN source_file_id bigint;

ALTER TABLE public.ai_conversations
  ADD COLUMN companion_version integer NOT NULL DEFAULT 1,
  ADD COLUMN position_seconds integer CHECK (position_seconds BETWEEN 0 AND 43200),
  ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN answer_status text,
  ADD COLUMN used_coins integer NOT NULL DEFAULT 0;

CREATE INDEX ai_conversations_safe_memory ON public.ai_conversations
  (user_id, title_id, media_type, companion_version, season_number, episode_number, position_seconds);
CREATE INDEX subtitle_chunks_v2_time ON public.subtitle_chunks
  (tmdb_id, media_type, season_number, episode_number, end_seconds)
  WHERE ingestion_version = 2;

-- Only the authenticated edge handler can create checked companion answers.
ALTER POLICY "Users can insert their own conversations" ON public.ai_conversations
  WITH CHECK (auth.uid() = user_id AND companion_version = 1);

-- Also close the old RPC's movie and timestamp holes for compatibility.
CREATE OR REPLACE FUNCTION public.match_subtitle_chunks(
  query_embedding vector, p_tmdb_id integer, p_media_type text,
  p_current_season integer, p_current_episode integer, p_max_seconds numeric,
  match_count integer DEFAULT 100
) RETURNS TABLE(id uuid, tmdb_id integer, media_type text, season_number integer,
  episode_number integer, chunk_index integer, start_seconds numeric,
  end_seconds numeric, content text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sc.id, sc.tmdb_id, sc.media_type, sc.season_number, sc.episode_number,
    sc.chunk_index, sc.start_seconds, sc.end_seconds, sc.content,
    1 - (sc.embedding <=> query_embedding)
  FROM public.subtitle_chunks sc
  WHERE sc.tmdb_id = p_tmdb_id AND sc.media_type = p_media_type
    AND sc.ingestion_version = 2 AND sc.embedding IS NOT NULL
    AND ((p_media_type = 'movie' AND sc.end_seconds <= p_max_seconds)
      OR (p_media_type = 'tv' AND (sc.season_number < p_current_season
        OR (sc.season_number = p_current_season AND sc.episode_number < p_current_episode)
        OR (sc.season_number = p_current_season AND sc.episode_number = p_current_episode
          AND sc.end_seconds <= p_max_seconds))))
  ORDER BY sc.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 0), 60);
$$;

-- Keyword + vector search over complete, permitted chunks. A partially watched
-- chunk is retrieved separately and clipped to its completed individual cues.
CREATE FUNCTION public.match_companion_chunks(
  p_tmdb_id integer, p_media_type text, p_current_season integer,
  p_current_episode integer, p_max_seconds numeric, p_question text,
  p_embedding vector DEFAULT NULL
) RETURNS SETOF public.subtitle_chunks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH permitted AS MATERIALIZED (
    SELECT sc.* FROM public.subtitle_chunks sc
    WHERE sc.tmdb_id = p_tmdb_id AND sc.media_type = p_media_type
      AND sc.ingestion_version = 2
      AND ((p_media_type = 'movie' AND sc.end_seconds <= p_max_seconds)
        OR (p_media_type = 'tv' AND (sc.season_number < p_current_season
          OR (sc.season_number = p_current_season AND sc.episode_number < p_current_episode)
          OR (sc.season_number = p_current_season AND sc.episode_number = p_current_episode
            AND sc.end_seconds <= p_max_seconds))))
  ), lexical AS (
    SELECT id, row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', content),
      websearch_to_tsquery('simple', p_question)) DESC) AS rank
    FROM permitted WHERE to_tsvector('simple', content) @@ websearch_to_tsquery('simple', p_question)
    LIMIT 40
  ), semantic AS (
    SELECT id, row_number() OVER (ORDER BY embedding <=> p_embedding) AS rank
    FROM permitted WHERE embedding IS NOT NULL AND p_embedding IS NOT NULL
    ORDER BY embedding <=> p_embedding LIMIT 40
  ), ranked AS (
    SELECT coalesce(l.id, s.id) AS id,
      coalesce(1.0 / (60 + l.rank), 0) + coalesce(1.0 / (60 + s.rank), 0) AS score
    FROM lexical l FULL JOIN semantic s ON l.id = s.id
  ) SELECT p.* FROM permitted p JOIN ranked r ON r.id = p.id
    ORDER BY r.score DESC, p.end_seconds DESC LIMIT 12;
$$;
REVOKE ALL ON FUNCTION public.match_companion_chunks(integer,text,integer,integer,numeric,text,vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_companion_chunks(integer,text,integer,integer,numeric,text,vector) TO service_role;

-- Saving a checked answer and paying for it are one transaction. A retry with
-- the same request ID cannot charge twice; abstentions do not cost a question.
CREATE FUNCTION public.record_companion_answer(p_user_id uuid, p_conversation jsonb, p_charge boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  usage_row public.user_ai_usage;
  saved public.ai_conversations;
  balance integer;
  charged integer := 0;
  today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
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
    (p_conversation->>'position_seconds')::integer, 2, p_conversation->'evidence',
    p_conversation->>'answer_status', charged)
  RETURNING * INTO saved;
  RETURN jsonb_build_object('conversation', to_jsonb(saved), 'remainingFreeQuestions',
    greatest(0, 5 - usage_row.questions_today), 'usedCoins', charged);
END;
$$;
REVOKE ALL ON FUNCTION public.record_companion_answer(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_companion_answer(uuid,jsonb,boolean) TO service_role;
