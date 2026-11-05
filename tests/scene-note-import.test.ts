import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sceneNoteImport } from '../scripts/lib/scene-note-import';
import type { ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';

const pg = new PGlite();
const cues = [{ start: 10, end: 12, text: 'Mira: I might leave.' }, { start: 13, end: 14, text: 'Not yet.' }];
const records = [{ id: 'test', tmdb_id: 10, media_type: 'movie', season_number: null, episode_number: null,
  source_file_id: 123, ingestion_version: 3, cues }];
const note: ReviewedSceneNote = { id: 'reviewed-plan', tmdb_id: 10, media_type: 'movie', season_number: null,
  episode_number: null, source_file_id: 123, start_seconds: 10, reveal_seconds: 14, anchors: cues,
  summary: 'Mira’s plan isn’t complete.', uses: ['explanation'], topics: ['Mira', 'departure'],
  review: { status: 'reviewed', basis: 'caption_prefix', reference: 'Test editorial review', reviewed_at: '2026-10-21T08:00:00Z' } };

beforeAll(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE subtitle_chunks(tmdb_id integer, media_type text, season_number integer, episode_number integer,
      source_file_id bigint, ingestion_version integer, cues jsonb);`);
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261019160000_reviewed_scene_notes.sql', import.meta.url), 'utf8'));
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261105220000_reviewed_visual_notes.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await pg.exec('TRUNCATE companion_scene_notes, companion_visual_notes, subtitle_chunks');
  await pg.query("INSERT INTO subtitle_chunks VALUES (10,'movie',null,null,123,3,$1::jsonb)", [JSON.stringify(cues)]);
});

describe('private visual-note imports', () => {
  const visual: ReviewedSceneNote = { ...note, id: 'visual-event', coverage: 'limited', valid_until_seconds: 30,
    summary: 'The silent action is visible; its reason remains unresolved at the reviewed point.',
    review: { ...note.review, basis: 'scene_prefix' },
    scene_review: { kind: 'released_video', availability: 'timed_scene', reviewed_through_seconds: 30,
      knowledge: 'unresolved', references: [{ url: 'https://studio.example/scene', locator: 'Reviewed video 10–30 seconds' }] } };

  it('stores visual reviews separately, preserves provenance and strips unrelated metadata', async () => {
    const sql = sceneNoteImport([note, { ...visual, full_recap: 'FUTURE_SOURCE' } as ReviewedSceneNote], records);
    await pg.exec(sql);
    await pg.exec(sql);
    expect((await pg.query('SELECT id FROM companion_scene_notes')).rows).toEqual([{ id: note.id }]);
    const { rows } = await pg.query<{ note: ReviewedSceneNote }>('SELECT note FROM companion_visual_notes');
    expect(rows).toHaveLength(1);
    expect(rows[0].note.scene_review).toEqual(visual.scene_review);
    expect(rows[0].note.valid_until_seconds).toBe(30);
    expect(JSON.stringify(rows)).not.toContain('FUTURE_SOURCE');
  });

  it('rolls back both stores if the live edition changes', async () => {
    const second = { ...visual, source_file_id: 124 };
    const sql = sceneNoteImport([note, second], [...records, { ...records[0], source_file_id: 124 }]);
    await expect(pg.exec(sql)).rejects.toThrow('Reviewed source mismatch');
    expect((await pg.query('SELECT id FROM companion_scene_notes')).rows).toEqual([]);
    expect((await pg.query('SELECT id FROM companion_visual_notes')).rows).toEqual([]);
  });

  it('prevents browser roles reading or writing private reviewed sources', async () => {
    await pg.exec(sceneNoteImport([visual], records));
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`SET ROLE ${role}`);
      try {
        await expect(pg.query('SELECT * FROM companion_visual_notes')).rejects.toThrow('permission denied');
        await expect(pg.query('DELETE FROM companion_visual_notes')).rejects.toThrow('permission denied');
        await expect(pg.query('INSERT INTO companion_visual_notes(id,note) VALUES ($1,$2::jsonb)',
          [visual.id, JSON.stringify(visual)])).rejects.toThrow('permission denied');
      } finally { await pg.exec('RESET ROLE'); }
    }
    await pg.exec('SET ROLE service_role');
    try { expect((await pg.query('SELECT id FROM companion_visual_notes')).rows).toHaveLength(1); }
    finally { await pg.exec('RESET ROLE'); }
  });

  it('database constraints reject caption notes, unreviewed visual data and unbounded mysteries', async () => {
    for (const invalid of [note, { ...visual, scene_review: undefined }, { ...visual, source_file_id: null },
      { ...visual, review: { ...visual.review, status: 'draft' } }, { ...visual, valid_until_seconds: 31 },
      { ...visual, valid_until_seconds: undefined }]) {
      await expect(pg.query('INSERT INTO companion_visual_notes(id,note) VALUES ($1,$2::jsonb)',
        [invalid.id, JSON.stringify(invalid)])).rejects.toThrow();
    }
  });
});
afterAll(() => pg.close());

describe('reviewed-note deployment preparation', () => {
  it('imports matching reviewed data idempotently, preserving Unicode and literal SQL-like text', async () => {
    const text = "Mira’s line includes '; DROP TABLE companion_scene_notes; -- as text.";
    const sql = sceneNoteImport([{ ...note, summary: text }], records);
    await pg.exec(sql);
    await pg.exec(sql);
    const { rows } = await pg.query<{ note: ReviewedSceneNote }>('SELECT note FROM companion_scene_notes');
    expect(rows).toHaveLength(1);
    expect(rows[0].note.summary).toBe(text);
    expect(rows[0].note.anchors).toEqual(cues);
  });

  it('does not prepare invalid, duplicate, unreviewed or dependency-incomplete notes', () => {
    for (const notes of [[], [note, note], [{ ...note, context_ids: ['missing'] }],
      [{ ...note, anchors: [cues[0]] }], [{ ...note, reveal_seconds: 13 }],
      [{ ...note, review: { ...note.review, status: 'draft' } }]]) {
      expect(() => sceneNoteImport(notes as ReviewedSceneNote[], records)).toThrow();
    }
  });

  it('rechecks the live database and rolls back earlier notes if a later note mismatches', async () => {
    const later = { ...note, id: 'later', start_seconds: 20, reveal_seconds: 22,
      anchors: [{ start: 20, end: 22, text: 'We are still waiting.' }] };
    const sql = sceneNoteImport([note, later], [{ ...records[0], cues: [...cues, ...later.anchors] }]);
    // Earlier note matches; the second span is absent in the actual database.
    await expect(pg.exec(sql)).rejects.toThrow('Reviewed source mismatch');
    expect((await pg.query('SELECT id FROM companion_scene_notes')).rows).toEqual([]);
  });

  it('rejects changed text, timing and omitted overlapping dialogue', async () => {
    const sql = sceneNoteImport([note], records);
    for (const changed of [[cues[0], { ...cues[1], text: 'Yes, now.' }],
      cues.map(cue => ({ ...cue, start: cue.start + 0.1, end: cue.end + 0.1 })),
      [...cues, { start: 11, end: 12, text: 'I changed my mind.' }]]) {
      await pg.query('UPDATE subtitle_chunks SET cues=$1::jsonb', [JSON.stringify(changed)]);
      await expect(pg.exec(sql)).rejects.toThrow('Reviewed source mismatch');
      expect((await pg.query('SELECT id FROM companion_scene_notes')).rows).toEqual([]);
    }
  });

  it('rejects a different file, title, episode or ingestion revision even with identical captions', async () => {
    const sql = sceneNoteImport([note], records);
    for (const change of ['source_file_id=124', 'tmdb_id=11', 'episode_number=1', 'ingestion_version=2']) {
      await pg.exec(`UPDATE subtitle_chunks SET source_file_id=123,tmdb_id=10,episode_number=null,ingestion_version=3;
        UPDATE subtitle_chunks SET ${change}`);
      await expect(pg.exec(sql)).rejects.toThrow('Reviewed source mismatch');
    }
  });

  it('ignores future crossing cues and duplicate retrieval, exactly as the runtime gate does', async () => {
    const extended = [...cues, { start: 13.5, end: 14.001, text: 'FUTURE' }];
    await pg.query('UPDATE subtitle_chunks SET cues=$1::jsonb', [JSON.stringify(extended)]);
    await pg.exec('INSERT INTO subtitle_chunks SELECT * FROM subtitle_chunks');
    await pg.exec(sceneNoteImport([note], [{ ...records[0], cues: extended }, records[0]]));
    expect((await pg.query('SELECT id FROM companion_scene_notes')).rows).toEqual([{ id: note.id }]);
  });

  it('keeps limitations and their expiry, but excludes unrelated source metadata', async () => {
    const limited = { ...note, coverage: 'limited' as const, valid_until_seconds: 30, full_script: 'UNFILTERED_SOURCE' };
    await pg.exec(sceneNoteImport([limited], records));
    const { rows } = await pg.query<{ note: ReviewedSceneNote }>('SELECT note FROM companion_scene_notes');
    expect(rows[0].note).toMatchObject({ coverage: 'limited', valid_until_seconds: 30 });
    expect(JSON.stringify(rows)).not.toContain('UNFILTERED_SOURCE');
  });
});
