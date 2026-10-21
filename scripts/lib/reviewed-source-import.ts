import { parseSubtitles, type ViewingPosition } from '../../supabase/functions/_shared/companion.ts';
import { subtitleCacheRows } from '../../supabase/functions/_shared/subtitle-cache.ts';
import type { ReviewedSceneNote } from '../../supabase/functions/_shared/reviewed-scenes.ts';
import { sceneNoteImport } from './scene-note-import.ts';

export interface ReviewedSourceManifest {
  position: Omit<ViewingPosition, 'seconds'>;
  source_file_id: number | null;
  source_reference: string;
  sha256: string;
  complete_file: true;
}

// Private, offline preparation only. The caller must verify title/edition and
// completeness; a hash and matching anchors cannot prove that editorial review.
export async function reviewedSourceImport(manifest: ReviewedSourceManifest, bytes: Uint8Array, notes: ReviewedSceneNote[]) {
  if (!manifest || manifest.complete_file !== true || typeof manifest.source_reference !== 'string' ||
      !manifest.source_reference.trim() || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw new Error('Invalid complete-source manifest');
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== manifest.sha256) throw new Error('Subtitle file hash differs from reviewed manifest');
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' :
    bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  const cues = parseSubtitles(new TextDecoder(encoding, { fatal: true }).decode(bytes));
  const rows = subtitleCacheRows(manifest.position, manifest.source_file_id, cues);
  const records = rows.map(row => ({ ...row, id: row.cache_key }));
  // All notes must belong to this source and survive the runtime anchor gate.
  const noteSql = sceneNoteImport(notes, records);
  const encoded = btoa(Array.from(new TextEncoder().encode(JSON.stringify(rows)), byte => String.fromCharCode(byte)).join(''));
  const conflict = manifest.position.mediaType === 'tv'
    ? 'tmdb_id, media_type, season_number, episode_number, chunk_index' : 'cache_key';
  const columns = ['tmdb_id','media_type','season_number','episode_number','chunk_index','start_seconds','end_seconds',
    'content','cues','ingestion_version','source_file_id','cache_key'];
  const updates = columns.filter(column => !conflict.split(', ').includes(column)).map(column => `${column} = EXCLUDED.${column}`);
  const sql = `-- PRIVATE full subtitle file + reviewed notes. Do not commit this generated file.
-- Source SHA-256: ${sha256}. Prepared only; apply through an authorized database administrator.
BEGIN;
LOCK TABLE public.subtitle_chunks IN SHARE ROW EXCLUSIVE MODE;
DO $cinegeek_source_import$
DECLARE
  payload jsonb := convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb;
  scope jsonb := payload->0;
  existing jsonb;
BEGIN
  -- Do not silently overwrite a different current source or a partial cache.
  SELECT jsonb_agg(jsonb_build_object(${columns.map(column => `'${column}', sc.${column}`).join(', ')}, 'embedding', NULL)
    ORDER BY sc.chunk_index) INTO existing FROM public.subtitle_chunks sc
    WHERE sc.tmdb_id = (scope->>'tmdb_id')::integer AND sc.media_type = scope->>'media_type'
      AND sc.season_number IS NOT DISTINCT FROM (scope->>'season_number')::integer
      AND sc.episode_number IS NOT DISTINCT FROM (scope->>'episode_number')::integer
      AND sc.ingestion_version = (scope->>'ingestion_version')::integer;
  IF existing IS NOT NULL AND existing <> payload THEN
    RAISE EXCEPTION 'A different or incomplete current subtitle cache exists. No source imported.';
  END IF;
  INSERT INTO public.subtitle_chunks (${columns.join(', ')}, embedding)
    SELECT ${columns.join(', ')}, NULL FROM jsonb_to_recordset(payload) AS r(
      tmdb_id integer, media_type text, season_number integer, episode_number integer,
      chunk_index integer, start_seconds numeric, end_seconds numeric, content text, cues jsonb,
      ingestion_version integer, source_file_id bigint, cache_key text)
    ON CONFLICT (${conflict}) DO UPDATE SET ${updates.join(', ')}, embedding = NULL;
END;
$cinegeek_source_import$;
${noteSql}
COMMIT;
`;
  return { sql, records, manifest: { ...manifest, cue_count: cues.length, chunk_count: rows.length,
    first_cue: cues[0].start, last_cue: cues[cues.length - 1].end, note_ids: notes.map(note => note.id), applied: false } };
}
