-- Independently reviewed visual facts, never client-authored plot memory.
-- Caption anchors bind the edition; the separate review establishes visibility.
-- No source text or approved notes are bundled in this migration.
CREATE TABLE public.companion_visual_notes (
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
  CHECK (note->'review'->>'basis' IS NOT DISTINCT FROM 'scene_prefix'),
  CHECK (jsonb_typeof(note->'source_file_id') IS NOT DISTINCT FROM 'number' AND (note->>'source_file_id')::bigint > 0),
  CHECK (jsonb_typeof(note->'scene_review') IS NOT DISTINCT FROM 'object'),
  CHECK (note->'scene_review'->>'knowledge' IS NOT NULL AND note->'scene_review'->>'knowledge' IN ('established','unresolved')),
  CHECK (jsonb_typeof(note->'scene_review'->'reviewed_through_seconds') IS NOT DISTINCT FROM 'number'
    AND (note->'scene_review'->>'reviewed_through_seconds')::double precision >= reveal_seconds),
  CHECK (jsonb_typeof(note->'scene_review'->'references') IS NOT DISTINCT FROM 'array'
    AND jsonb_array_length(note->'scene_review'->'references') > 0),
  CHECK (note->'scene_review'->>'knowledge' <> 'unresolved' OR
    (note->>'coverage' IS NOT DISTINCT FROM 'limited' AND jsonb_typeof(note->'valid_until_seconds') IS NOT DISTINCT FROM 'number'
      AND (note->>'valid_until_seconds')::double precision >= reveal_seconds
      AND (note->>'valid_until_seconds')::double precision <= (note->'scene_review'->>'reviewed_through_seconds')::double precision))
);
CREATE INDEX companion_visual_notes_position ON public.companion_visual_notes
  (tmdb_id, media_type, season_number, episode_number, reveal_seconds);
ALTER TABLE public.companion_visual_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_visual_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_visual_notes TO service_role;
