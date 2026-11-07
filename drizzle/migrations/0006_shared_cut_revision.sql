LOCK TABLE public.ai_conversations IN SHARE ROW EXCLUSIVE MODE;
-- Replays and old clients must never restore an answer from just the faster cut.
UPDATE public.ai_conversations SET companion_version = 2
WHERE title_id=66573 AND media_type='tv' AND season_number=1 AND episode_number=1 AND companion_version>=3;
CREATE OR REPLACE FUNCTION public.companion_answer_revision(title integer, media text, season integer, episode integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN media='tv' AND title=66573 AND season=1 AND episode=1 THEN 5
              WHEN media='movie' AND title=329865 THEN 4 ELSE 3 END;
$$;

-- Shared editorial cache: generated exclusively from completed episode evidence,
-- never from user questions, watch history or the current episode's full plot.
CREATE TABLE public.companion_episode_recaps (
  tmdb_id integer NOT NULL, season_number integer NOT NULL, episode_number integer NOT NULL,
  revision text NOT NULL, chapter jsonb NOT NULL, prepared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, season_number, episode_number, revision)
);
ALTER TABLE public.companion_episode_recaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_episode_recaps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.companion_episode_recaps TO service_role;
CREATE FUNCTION public.store_companion_episode_recap(p_title integer, p_season integer, p_episode integer, p_revision text, p_chapter jsonb)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  INSERT INTO public.companion_episode_recaps AS saved(tmdb_id,season_number,episode_number,revision,chapter)
  VALUES(p_title,p_season,p_episode,p_revision,p_chapter)
  ON CONFLICT(tmdb_id,season_number,episode_number,revision) DO UPDATE
    SET chapter=excluded.chapter, prepared_at=now()
    WHERE saved.chapter->>'limited'='true';
$$;
REVOKE ALL ON FUNCTION public.store_companion_episode_recap(integer,integer,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_companion_episode_recap(integer,integer,integer,text,jsonb) TO service_role;