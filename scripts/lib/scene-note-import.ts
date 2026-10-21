import { permittedSceneNotes, type ReviewedSceneNote } from '../../supabase/functions/_shared/reviewed-scenes.ts';
import { SUBTITLE_VERSION, type SubtitleRecord, type ViewingPosition } from '../../supabase/functions/_shared/companion.ts';

// Prepare privately, then apply through an authorized database administrator.
// This never contacts a database, approves new prose, or imports subtitle files.
export function sceneNoteImport(notes: ReviewedSceneNote[], records: SubtitleRecord[]): string {
  if (!Array.isArray(notes) || !notes.length || notes.length > 500 || !Array.isArray(records)) {
    throw new Error('Provide 1–500 reviewed notes and a subtitle-record export.');
  }
  for (const note of notes) {
    if (!note || typeof note !== 'object') throw new Error('Invalid reviewed note.');
    const position: ViewingPosition = { tmdbId: note.tmdb_id, mediaType: note.media_type, seconds: note.reveal_seconds,
      ...(note.media_type === 'tv' ? { seasonNumber: note.season_number!, episodeNumber: note.episode_number! } : {}) };
    if (!Number.isInteger(position.tmdbId) || position.tmdbId <= 0 ||
        !['tv', 'movie'].includes(position.mediaType) || !Number.isFinite(position.seconds) || position.seconds > 43200 ||
        (position.mediaType === 'tv' && (!Number.isInteger(position.seasonNumber) || position.seasonNumber! < 0 ||
          !Number.isInteger(position.episodeNumber) || position.episodeNumber! < 1)) ||
        !permittedSceneNotes(notes, records, position).some(item => item.id === note.id)) {
      throw new Error('A note is invalid, lacks required context, or does not match its reviewed caption export. No import prepared.');
    }
  }
  // Project only the review contract, never unrelated source metadata.
  const payload = notes.map(note => ({ id: note.id, tmdb_id: note.tmdb_id, media_type: note.media_type,
    season_number: note.season_number, episode_number: note.episode_number, source_file_id: note.source_file_id,
    start_seconds: note.start_seconds, reveal_seconds: note.reveal_seconds, summary: note.summary,
    uses: note.uses, topics: note.topics, context_ids: note.context_ids,
    coverage: note.coverage, valid_until_seconds: note.valid_until_seconds,
    anchors: note.anchors.map(({ start, end, text }) => ({ start, end, text })),
    review: { status: note.review.status, basis: note.review.basis, reference: note.review.reference, reviewed_at: note.review.reviewed_at } }));
  const encoded = btoa(Array.from(new TextEncoder().encode(JSON.stringify(payload)), byte => String.fromCharCode(byte)).join(''));
  // Base64 cannot terminate the SQL literal or the DO block. Encoding is not
  // encryption: the generated file contains private source text; keep out of Git.
  return `-- PRIVATE reviewed source import. Do not commit or publish this file.
-- All notes are checked against the current database before any write survives.
DO $cinegeek_reviewed_import$
DECLARE
  candidate jsonb;
  expected jsonb;
  actual jsonb;
BEGIN
  LOCK TABLE public.subtitle_chunks IN SHARE MODE;
  LOCK TABLE public.companion_scene_notes IN SHARE ROW EXCLUSIVE MODE;
  FOR candidate IN SELECT value FROM jsonb_array_elements(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)
  LOOP
    SELECT coalesce(jsonb_agg(cue ORDER BY cue->'start', cue->'end', cue->>'text'), '[]'::jsonb)
      INTO expected FROM (SELECT DISTINCT value AS cue FROM jsonb_array_elements(candidate->'anchors')) anchors;
    SELECT coalesce(jsonb_agg(cue ORDER BY cue->'start', cue->'end', cue->>'text'), '[]'::jsonb)
      INTO actual FROM (
        SELECT DISTINCT jsonb_build_object('start', c->'start', 'end', c->'end', 'text', c->'text') AS cue
        FROM public.subtitle_chunks sc CROSS JOIN LATERAL jsonb_array_elements(sc.cues) c
        WHERE sc.tmdb_id = (candidate->>'tmdb_id')::integer AND sc.media_type = candidate->>'media_type'
          AND sc.season_number IS NOT DISTINCT FROM (candidate->>'season_number')::integer
          AND sc.episode_number IS NOT DISTINCT FROM (candidate->>'episode_number')::integer
          AND sc.ingestion_version = ${SUBTITLE_VERSION}
          AND ((candidate->>'source_file_id') IS NULL OR sc.source_file_id = (candidate->>'source_file_id')::bigint)
          AND jsonb_typeof(c->'start') = 'number' AND jsonb_typeof(c->'end') = 'number' AND jsonb_typeof(c->'text') = 'string'
          AND (c->>'start')::numeric >= 0 AND (c->>'end')::numeric >= (c->>'start')::numeric
          AND length(btrim(c->>'text')) > 0
          AND (c->>'end')::numeric <= (candidate->>'reveal_seconds')::numeric
          AND (c->>'end')::numeric >= (candidate->>'start_seconds')::numeric
          AND (c->>'start')::numeric <= (candidate->>'reveal_seconds')::numeric
      ) source_cues;
    IF expected <> actual THEN
      RAISE EXCEPTION 'Reviewed source mismatch for note %. No notes imported.', candidate->>'id';
    END IF;
    INSERT INTO public.companion_scene_notes(id, note) VALUES (candidate->>'id', candidate)
      ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note;
  END LOOP;
END;
$cinegeek_reviewed_import$;
`;
}
