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

CREATE OR REPLACE FUNCTION public.enforce_exclusive_active_shelf()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  other_progress integer;
  conflicts text[];
BEGIN
  conflicts := CASE NEW.list_type
    WHEN 'watchlist' THEN ARRAY['watching','watched','favourite']
    WHEN 'watching' THEN ARRAY['watchlist','watched']
    WHEN 'watched' THEN ARRAY['watchlist','watching']
    WHEN 'favourite' THEN ARRAY['watchlist']
    ELSE ARRAY[]::text[] END;
  -- Serialize competing changes for this account/title; the unique index is
  -- also a hard guard against simultaneous clients and older app versions.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    NEW.user_id::text || ':' || NEW.type || ':' || NEW.title_id::text, 0));
  SELECT progress INTO other_progress FROM public.user_titles
  WHERE user_id = NEW.user_id AND type = NEW.type AND title_id = NEW.title_id
    AND list_type = ANY(conflicts) AND id <> NEW.id
  ORDER BY CASE list_type WHEN 'watching' THEN 1 WHEN 'watched' THEN 2
    WHEN 'watchlist' THEN 3 ELSE 4 END LIMIT 1;
  -- Carry active viewing progress into a newly added/moved shelf record.
  IF TG_OP = 'INSERT' THEN
    NEW.progress := COALESCE(other_progress, NEW.progress);
  ELSIF OLD.list_type NOT IN ('watchlist', 'watching') THEN
    NEW.progress := COALESCE(other_progress, NEW.progress);
  END IF;
  DELETE FROM public.user_titles
  WHERE user_id = NEW.user_id AND type = NEW.type AND title_id = NEW.title_id
    AND list_type = ANY(conflicts) AND id <> NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_exclusive_active_shelf() FROM PUBLIC;
DROP TRIGGER IF EXISTS user_titles_exclusive_active_shelf ON public.user_titles;
CREATE TRIGGER user_titles_exclusive_active_shelf
  BEFORE INSERT OR UPDATE OF user_id, type, title_id, list_type ON public.user_titles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exclusive_active_shelf();
COMMIT;
