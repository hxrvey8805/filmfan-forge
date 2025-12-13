-- Drop and recreate the match functions with 1536-dimension vectors
DROP FUNCTION IF EXISTS public.match_subtitle_chunks(vector, integer, text, integer, integer, numeric, integer);
DROP FUNCTION IF EXISTS public.match_season_summaries(vector, integer, integer, integer);

-- Alter subtitle_chunks embedding column to 1536 dimensions
-- First set all embeddings to NULL so we can alter the type
UPDATE subtitle_chunks SET embedding = NULL;
ALTER TABLE subtitle_chunks ALTER COLUMN embedding TYPE vector(1536);

-- Alter season_summaries embedding column to 1536 dimensions
UPDATE season_summaries SET embedding = NULL;
ALTER TABLE season_summaries ALTER COLUMN embedding TYPE vector(1536);

-- Recreate match_subtitle_chunks function with 1536-dimension vector
CREATE OR REPLACE FUNCTION public.match_subtitle_chunks(
  query_embedding vector(1536),
  p_tmdb_id integer,
  p_media_type text,
  p_current_season integer,
  p_current_episode integer,
  p_max_seconds numeric,
  match_count integer DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  tmdb_id integer,
  media_type text,
  season_number integer,
  episode_number integer,
  chunk_index integer,
  start_seconds numeric,
  end_seconds numeric,
  content text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.tmdb_id,
    sc.media_type,
    sc.season_number,
    sc.episode_number,
    sc.chunk_index,
    sc.start_seconds,
    sc.end_seconds,
    sc.content,
    1 - (sc.embedding <=> query_embedding) AS similarity
  FROM public.subtitle_chunks sc
  WHERE sc.tmdb_id = p_tmdb_id
    AND sc.media_type = p_media_type
    AND sc.embedding IS NOT NULL
    AND (
      (sc.season_number < p_current_season)
      OR
      (sc.season_number = p_current_season AND sc.episode_number < p_current_episode)
      OR
      (sc.season_number = p_current_season AND sc.episode_number = p_current_episode AND sc.end_seconds <= p_max_seconds)
    )
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Recreate match_season_summaries function with 1536-dimension vector
CREATE OR REPLACE FUNCTION public.match_season_summaries(
  query_embedding vector(1536),
  p_tmdb_id integer,
  p_max_season integer,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  tmdb_id integer,
  season_number integer,
  season_name text,
  overview text,
  episode_summaries jsonb,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ss.id,
    ss.tmdb_id,
    ss.season_number,
    ss.season_name,
    ss.overview,
    ss.episode_summaries,
    1 - (ss.embedding <=> query_embedding) AS similarity
  FROM public.season_summaries ss
  WHERE ss.tmdb_id = p_tmdb_id
    AND ss.season_number < p_max_season
    AND ss.embedding IS NOT NULL
  ORDER BY ss.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;