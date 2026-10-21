import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reviewedSourceImport, type ReviewedSourceManifest } from '../scripts/lib/reviewed-source-import';
import { subtitleCacheRows } from '../supabase/functions/_shared/subtitle-cache';
import { permittedCues, type SubtitleRecord } from '../supabase/functions/_shared/companion';
import { permittedSceneNotes, type ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';

const pg = new PGlite();
const bytes = new TextEncoder().encode('1\n00:00:10,000 --> 00:00:12,500\n[Mira] We wait here.\n\n2\n00:02:00,000 --> 00:02:02,000\nFUTURE_EVENT\n');
const note: ReviewedSceneNote = { id: 'wait', tmdb_id: 10, media_type: 'movie', season_number: null, episode_number: null,
  source_file_id: 123, start_seconds: 10, reveal_seconds: 12.5, summary: 'Mira says to wait here.',
  uses: ['explanation'], topics: ['Mira'], anchors: [{ start: 10, end: 12.5, text: '[Mira] We wait here.' }],
  review: { status: 'reviewed', basis: 'caption_prefix', reference: 'Synthetic fixture', reviewed_at: '2026-10-21T12:00:00Z' } };
let manifest: ReviewedSourceManifest;
beforeAll(async () => {
  manifest = { position: { tmdbId: 10, mediaType: 'movie' }, source_file_id: 123, source_reference: 'Synthetic complete fixture',
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''), complete_file: true };
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE subtitle_chunks(id uuid DEFAULT gen_random_uuid(), tmdb_id integer, media_type text,
      season_number integer, episode_number integer, source_file_id bigint, ingestion_version integer,
      cues jsonb, chunk_index integer, start_seconds numeric, end_seconds numeric, content text,
      cache_key text UNIQUE, embedding jsonb,
      UNIQUE(tmdb_id,media_type,season_number,episode_number,chunk_index));`);
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261019160000_reviewed_scene_notes.sql', import.meta.url), 'utf8'));
});
beforeEach(() => pg.exec('ROLLBACK; TRUNCATE subtitle_chunks, companion_scene_notes'));
afterAll(() => pg.close());

describe('complete reviewed-source preparation', () => {
  it('imports the parsed file and its notes together and can be applied idempotently', async () => {
    const bundle = await reviewedSourceImport(manifest, bytes, [note]);
    await pg.exec(bundle.sql);
    await pg.exec(bundle.sql);
    const { rows } = await pg.query<SubtitleRecord>('SELECT * FROM subtitle_chunks ORDER BY chunk_index');
    expect(rows).toHaveLength(2);
    expect(permittedSceneNotes([note], rows, { ...manifest.position, seconds: 12.5 })).toHaveLength(1);
    expect(rows.flatMap(row => permittedCues(row, { ...manifest.position, seconds: 12.5 }))).toEqual(note.anchors);
    expect(rows.flatMap(row => permittedCues(row, { ...manifest.position, seconds: 12.499 }))).toEqual([]);
    expect(bundle.manifest).toMatchObject({ cue_count: 2, chunk_count: 2, applied: false });
  });

  it('replaces legacy TV indices without turning a legacy tail or another episode into current context', async () => {
    const tv = { ...manifest, position: { tmdbId: 10, mediaType: 'tv' as const, seasonNumber: 1, episodeNumber: 2 } };
    const tvNote = { ...note, media_type: 'tv' as const, season_number: 1, episode_number: 2 };
    await pg.exec(`INSERT INTO subtitle_chunks (tmdb_id,media_type,season_number,episode_number,chunk_index,ingestion_version,cues)
      VALUES (10,'tv',1,2,0,2,'[]'),(10,'tv',1,2,20,2,'[]'),(10,'tv',1,3,0,3,'[]');`);
    const bundle = await reviewedSourceImport(tv, bytes, [tvNote]);
    await pg.exec(bundle.sql);
    await pg.exec(bundle.sql);
    const { rows } = await pg.query<SubtitleRecord>('SELECT * FROM subtitle_chunks');
    expect(rows.filter(row => row.episode_number === 2 && row.ingestion_version === 3)).toHaveLength(2);
    expect(rows.filter(row => row.episode_number === 2 && row.ingestion_version === 2)).toHaveLength(1);
    expect(rows.flatMap(row => permittedCues(row, { ...tv.position, episodeNumber: 1, seconds: 300 }))).toEqual([]);
  });

  it('refuses a changed or partial current cache without modifying either source or notes', async () => {
    const bundle = await reviewedSourceImport(manifest, bytes, [note]);
    await pg.exec(bundle.sql);
    await pg.exec("UPDATE subtitle_chunks SET source_file_id=999; TRUNCATE companion_scene_notes;");
    await expect(pg.exec(bundle.sql)).rejects.toThrow('different or incomplete');
    await pg.exec('ROLLBACK');
    expect((await pg.query('SELECT DISTINCT source_file_id FROM subtitle_chunks')).rows).toEqual([{ source_file_id: 999 }]);
    expect((await pg.query('SELECT * FROM companion_scene_notes')).rows).toEqual([]);
  });

  it('rolls back caption publication when the guarded note import fails', async () => {
    const bundle = await reviewedSourceImport(manifest, bytes, [note]);
    await pg.exec(`CREATE FUNCTION alter_caption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      NEW.cues := '[]'::jsonb; RETURN NEW; END $$;
      CREATE TRIGGER change_source BEFORE INSERT ON subtitle_chunks FOR EACH ROW EXECUTE FUNCTION alter_caption();`);
    try {
      await expect(pg.exec(bundle.sql)).rejects.toThrow('Reviewed source mismatch');
      await pg.exec('ROLLBACK');
      expect((await pg.query('SELECT * FROM subtitle_chunks')).rows).toEqual([]);
      expect((await pg.query('SELECT * FROM companion_scene_notes')).rows).toEqual([]);
    } finally { await pg.exec('DROP TRIGGER change_source ON subtitle_chunks; DROP FUNCTION alter_caption()'); }
  });

  it('rejects a wrong hash, unknown completeness, cross-title notes and missing source identity', async () => {
    await expect(reviewedSourceImport({ ...manifest, sha256: '0'.repeat(64) }, bytes, [note])).rejects.toThrow('hash');
    await expect(reviewedSourceImport({ ...manifest, complete_file: false } as unknown as ReviewedSourceManifest, bytes, [note])).rejects.toThrow('manifest');
    await expect(reviewedSourceImport(manifest, bytes, [{ ...note, tmdb_id: 11 }])).rejects.toThrow('does not match');
    await expect(reviewedSourceImport({ ...manifest, source_file_id: null }, bytes, [note])).rejects.toThrow('does not match');
  });

  it('supports an explicitly unknown provider file ID without inventing one', async () => {
    const bundle = await reviewedSourceImport({ ...manifest, source_file_id: null }, bytes, [{ ...note, source_file_id: null }]);
    await pg.exec(bundle.sql);
    expect((await pg.query('SELECT DISTINCT source_file_id FROM subtitle_chunks')).rows).toEqual([{ source_file_id: null }]);
  });

  it('uses the ASS parser for complete event files', async () => {
    const source = new TextEncoder().encode('[Script Info]\nTitle: fixture\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:10.00,0:00:12.50,Default,,0,0,0,,[Mira] We wait here.\n');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source)), byte => byte.toString(16).padStart(2, '0')).join('');
    const bundle = await reviewedSourceImport({ ...manifest, sha256: hash }, source, [note]);
    await pg.exec(bundle.sql);
    expect(bundle.records[0].cues).toEqual(note.anchors);
  });

  it('rejects invalid scope, file IDs and malformed timestamps before creating rows', () => {
    for (const position of [{ tmdbId: 0, mediaType: 'movie' }, { tmdbId: 10, mediaType: 'tv' },
      { tmdbId: 10, mediaType: 'movie', episodeNumber: 1 }]) {
      expect(() => subtitleCacheRows(position as ReviewedSourceManifest['position'], 123, note.anchors)).toThrow();
    }
    expect(() => subtitleCacheRows(manifest.position, -1, note.anchors)).toThrow();
    expect(() => subtitleCacheRows(manifest.position, 123, [{ start: 12, end: 11, text: 'bad' }])).toThrow();
  });
});
