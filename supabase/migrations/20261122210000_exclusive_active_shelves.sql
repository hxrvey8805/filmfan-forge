-- One viewing status: Watchlist, Watching or Watched. Favourites may accompany
-- Watching/Watched, but never Watchlist. Personal My Lists are separate.
BEGIN;
LOCK TABLE public.user_titles IN SHARE ROW EXCLUSIVE MODE;

-- Legacy conflicts: preserve Watching over Watched, and either existing status
-- or Favourites over Watchlist. Retain recorded progress before removing copies.
WITH recovered AS (
  SELECT DISTINCT ON (keeper.id) keeper.id, other.progress
  FROM public.user_titles AS keeper JOIN public.user_titles AS other
    ON other.user_id = keeper.user_id AND other.type = keeper.type AND other.title_id = keeper.title_id
  WHERE keeper.progress IS NULL AND other.progress IS NOT NULL
    AND ((keeper.list_type = 'watching' AND other.list_type IN ('watched','watchlist'))
      OR (keeper.list_type IN ('watched','favourite') AND other.list_type = 'watchlist'))
  ORDER BY keeper.id, CASE other.list_type WHEN 'watched' THEN 1 ELSE 2 END
)
UPDATE public.user_titles AS keeper SET progress = recovered.progress
FROM recovered WHERE keeper.id = recovered.id;
DELETE FROM public.user_titles AS removed
USING public.user_titles AS kept
WHERE removed.user_id = kept.user_id AND removed.type = kept.type
  AND removed.title_id = kept.title_id
  AND ((removed.list_type = 'watchlist' AND kept.list_type IN ('watching','watched','favourite'))
    OR (removed.list_type = 'watched' AND kept.list_type = 'watching'));

-- Movie and TV IDs belong to separate catalogues.
ALTER TABLE public.user_titles
  DROP CONSTRAINT IF EXISTS user_titles_user_id_title_id_list_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_titles_media_shelf_unique
  ON public.user_titles(user_id, type, title_id, list_type);
CREATE UNIQUE INDEX IF NOT EXISTS user_titles_active_shelf_unique
  ON public.user_titles(user_id, type, title_id)
  WHERE list_type IN ('watchlist', 'watching', 'watched');
CREATE UNIQUE INDEX IF NOT EXISTS user_titles_watchlist_favourite_unique
  ON public.user_titles(user_id, type, title_id)
  WHERE list_type IN ('watchlist', 'favourite');

-- Ordinary inserts never remove an existing title. Only the explicit Move
-- action uses this atomic operation; conflicting additions hit the indexes.
DROP TRIGGER IF EXISTS user_titles_exclusive_active_shelf ON public.user_titles;
DROP FUNCTION IF EXISTS public.enforce_exclusive_active_shelf();
CREATE OR REPLACE FUNCTION public.move_cinegeek_library_title(
  p_title jsonb, p_destination text, p_source text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  owner uuid := auth.uid();
  media_id integer;
  media_type text;
  item public.user_titles%ROWTYPE;
  existing_id uuid;
  other_progress integer;
  conflicts text[];
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Sign in to move a title'; END IF;
  IF p_destination IS NULL OR p_destination NOT IN ('watchlist','watching','watched','favourite')
    OR (p_source IS NOT NULL AND p_source NOT IN ('watchlist','watching','watched','favourite')) THEN
    RAISE EXCEPTION 'Invalid library shelf';
  END IF;
  media_id := (p_title->>'id')::integer;
  media_type := p_title->>'type';
  IF media_id IS NULL OR media_id <= 0 OR media_type IS NULL OR media_type NOT IN ('movie','tv') THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;
  conflicts := CASE p_destination
    WHEN 'watchlist' THEN ARRAY['watching','watched','favourite']
    WHEN 'watching' THEN ARRAY['watchlist','watched']
    WHEN 'watched' THEN ARRAY['watchlist','watching']
    WHEN 'favourite' THEN ARRAY['watchlist']
    ELSE ARRAY[]::text[] END;
  -- Serialize explicit moves. The indexes also guard competing normal adds.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    owner::text || ':' || media_type || ':' || media_id::text, 0));
  SELECT id INTO existing_id FROM public.user_titles
    WHERE user_id = owner AND type = media_type AND title_id = media_id AND list_type = p_destination;
  IF FOUND THEN RETURN jsonb_build_object('id',existing_id); END IF;

  -- Shelf moves require a real source owned by the signed-in viewer. A null
  -- source is an explicit move from a device-local My List.
  SELECT * INTO item FROM public.user_titles
  WHERE user_id = owner AND type = media_type AND title_id = media_id
    AND (p_source IS NULL OR list_type = p_source)
  ORDER BY CASE list_type WHEN 'watching' THEN 1 WHEN 'watched' THEN 2
    WHEN 'watchlist' THEN 3 ELSE 4 END LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    IF p_source IS NOT NULL THEN RAISE EXCEPTION 'This title changed elsewhere. Reopen your library.'; END IF;
    IF COALESCE(length(btrim(p_title->>'title')),0) = 0 THEN RAISE EXCEPTION 'Invalid title'; END IF;
    item.user_id := owner;
    item.title_id := media_id;
    item.type := media_type;
    item.title := p_title->>'title';
    item.poster_path := COALESCE(p_title->>'posterPath','');
    item.year := (p_title->>'year')::integer;
    item.created_at := now();
  END IF;
  SELECT progress INTO other_progress FROM public.user_titles
  WHERE user_id = owner AND type = media_type AND title_id = media_id
    AND list_type = ANY(conflicts) AND progress IS NOT NULL
  ORDER BY CASE list_type WHEN 'watching' THEN 1 WHEN 'watched' THEN 2
    WHEN 'watchlist' THEN 3 ELSE 4 END LIMIT 1;
  item.progress := COALESCE(other_progress,item.progress);
  DELETE FROM public.user_titles
    WHERE user_id = owner AND type = media_type AND title_id = media_id AND list_type = ANY(conflicts);
  item.id := gen_random_uuid();
  item.list_type := p_destination;
  INSERT INTO public.user_titles SELECT (item).*;
  RETURN jsonb_build_object('id',item.id);
END;
$$;
REVOKE ALL ON FUNCTION public.move_cinegeek_library_title(jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_cinegeek_library_title(jsonb,text,text) TO authenticated;
COMMIT;
