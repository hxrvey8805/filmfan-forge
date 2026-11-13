-- A short-lived negative cache lets bounded episode preparation advance past
-- genuinely unavailable files. Never cache quota/provider errors as absence.
CREATE TABLE public.companion_subtitle_unavailability (
  tmdb_id integer NOT NULL CHECK (tmdb_id > 0),
  season_number integer NOT NULL CHECK (season_number > 0),
  episode_number integer NOT NULL CHECK (episode_number > 0),
  ingestion_version integer NOT NULL,
  retry_after timestamptz NOT NULL,
  PRIMARY KEY (tmdb_id, season_number, episode_number, ingestion_version)
);
ALTER TABLE public.companion_subtitle_unavailability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_subtitle_unavailability FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_subtitle_unavailability TO service_role;
