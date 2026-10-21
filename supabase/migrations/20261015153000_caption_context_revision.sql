-- Re-import generated subtitle caches with SDH preference and ASS support.
-- Keep conversation version 2: no user history is deleted by this upgrade.
-- TV upserts overwrite matching indices; old longer-file tails remain version 2
-- and are excluded everywhere. Movie cache keys already contain the revision.
CREATE INDEX subtitle_chunks_v3_time ON public.subtitle_chunks
  (tmdb_id, media_type, season_number, episode_number, end_seconds)
  WHERE ingestion_version = 3;

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
    AND sc.ingestion_version = 3 AND sc.embedding IS NOT NULL
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
CREATE OR REPLACE FUNCTION public.match_companion_chunks(
  p_tmdb_id integer, p_media_type text, p_current_season integer,
  p_current_episode integer, p_max_seconds numeric, p_question text,
  p_embedding vector DEFAULT NULL
) RETURNS SETOF public.subtitle_chunks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH permitted AS MATERIALIZED (
    SELECT sc.* FROM public.subtitle_chunks sc
    WHERE sc.tmdb_id = p_tmdb_id AND sc.media_type = p_media_type
      AND sc.ingestion_version = 3
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

