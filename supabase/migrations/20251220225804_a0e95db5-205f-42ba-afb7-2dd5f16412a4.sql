-- Update match_subtitle_chunks to include current scene by using start_seconds <= p_max_seconds
-- This ensures chunks that START before or at the timestamp are included (the current scene)
CREATE OR REPLACE FUNCTION public.match_subtitle_chunks(
  query_embedding vector, 
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
AS $function$
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
      -- Previous seasons/episodes are always fair game
      (sc.season_number < p_current_season)
      OR
      -- Earlier episodes in current season
      (sc.season_number = p_current_season AND sc.episode_number < p_current_episode)
      OR
      -- Current episode: include chunks that START at or before the timestamp
      -- This ensures we get the current scene, not just chunks that ended before
      (sc.season_number = p_current_season AND sc.episode_number = p_current_episode AND sc.start_seconds <= p_max_seconds)
    )
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;