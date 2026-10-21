-- Curated summaries are private source material. No client may read/write this
-- store or self-assert that its submitted plot facts have been reviewed.
-- Load reviewed notes separately; this migration contains no copyrighted text.
CREATE TABLE public.companion_scene_notes (
  id text PRIMARY KEY,
  note jsonb NOT NULL CHECK (jsonb_typeof(note) = 'object'),
  tmdb_id integer GENERATED ALWAYS AS ((note->>'tmdb_id')::integer) STORED NOT NULL,
  media_type text GENERATED ALWAYS AS (note->>'media_type') STORED NOT NULL,
  season_number integer GENERATED ALWAYS AS ((note->>'season_number')::integer) STORED,
  episode_number integer GENERATED ALWAYS AS ((note->>'episode_number')::integer) STORED,
  reveal_seconds double precision GENERATED ALWAYS AS ((note->>'reveal_seconds')::double precision) STORED NOT NULL,
  CHECK (id IS NOT DISTINCT FROM (note->>'id')),
  CHECK (tmdb_id > 0 AND reveal_seconds >= 0 AND reveal_seconds <= 43200),
  CHECK ((media_type = 'movie' AND season_number IS NULL AND episode_number IS NULL) OR
    (media_type = 'tv' AND season_number >= 0 AND episode_number >= 1 AND season_number IS NOT NULL AND episode_number IS NOT NULL)),
  CHECK (note->'review'->>'status' IS NOT DISTINCT FROM 'reviewed'),
  CHECK (note->'review'->>'basis' IS NOT DISTINCT FROM 'caption_prefix')
);
CREATE INDEX companion_scene_notes_position ON public.companion_scene_notes
  (tmdb_id, media_type, season_number, episode_number, reveal_seconds);
ALTER TABLE public.companion_scene_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_scene_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_scene_notes TO service_role;
