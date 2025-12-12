-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create subtitle_chunks table for global caching
CREATE TABLE public.subtitle_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('tv', 'movie')),
  season_number INTEGER,
  episode_number INTEGER,
  chunk_index INTEGER NOT NULL,
  start_seconds NUMERIC NOT NULL,
  end_seconds NUMERIC NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(384),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, media_type, season_number, episode_number, chunk_index)
);

-- Create season_summaries table for TMDB summaries cache
CREATE TABLE public.season_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL,
  season_name TEXT,
  overview TEXT,
  episode_summaries JSONB,
  embedding VECTOR(384),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, season_number)
);

-- Create indexes for fast retrieval
CREATE INDEX idx_subtitle_chunks_lookup ON public.subtitle_chunks (tmdb_id, media_type, season_number, episode_number);
CREATE INDEX idx_subtitle_chunks_spoiler_safe ON public.subtitle_chunks (tmdb_id, season_number, episode_number, end_seconds);
CREATE INDEX idx_season_summaries_lookup ON public.season_summaries (tmdb_id, season_number);

-- Create vector indexes for semantic search
CREATE INDEX idx_subtitle_chunks_embedding ON public.subtitle_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_season_summaries_embedding ON public.season_summaries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS
ALTER TABLE public.subtitle_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Read-only for authenticated users (global cache)
CREATE POLICY "Authenticated users can read subtitle chunks"
ON public.subtitle_chunks
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read season summaries"
ON public.season_summaries
FOR SELECT
TO authenticated
USING (true);

-- Create match_subtitle_chunks function for two-stage retrieval
CREATE OR REPLACE FUNCTION public.match_subtitle_chunks(
  query_embedding VECTOR(384),
  p_tmdb_id INTEGER,
  p_media_type TEXT,
  p_current_season INTEGER,
  p_current_episode INTEGER,
  p_max_seconds NUMERIC,
  match_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  tmdb_id INTEGER,
  media_type TEXT,
  season_number INTEGER,
  episode_number INTEGER,
  chunk_index INTEGER,
  start_seconds NUMERIC,
  end_seconds NUMERIC,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    AND (
      -- Previous seasons: all chunks allowed
      (sc.season_number < p_current_season)
      OR
      -- Current season, previous episodes: all chunks allowed
      (sc.season_number = p_current_season AND sc.episode_number < p_current_episode)
      OR
      -- Current episode: only chunks before timestamp (spoiler-safe)
      (sc.season_number = p_current_season AND sc.episode_number = p_current_episode AND sc.end_seconds <= p_max_seconds)
    )
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create match_season_summaries function
CREATE OR REPLACE FUNCTION public.match_season_summaries(
  query_embedding VECTOR(384),
  p_tmdb_id INTEGER,
  p_max_season INTEGER,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  tmdb_id INTEGER,
  season_number INTEGER,
  season_name TEXT,
  overview TEXT,
  episode_summaries JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  ORDER BY ss.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;