import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Run the actual migrations and RPCs in PostgreSQL, including pgvector and RLS.
const pg = new PGlite({ extensions: { vector } });
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const user = randomUUID();
const otherUser = randomUUID();
const embedding = JSON.stringify([1, ...Array(1535).fill(0)]);

beforeAll(async () => {
  await pg.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
  `);
  for (const name of [
    '20251212124452_183e3a1b-1ce7-4ad2-8dbb-70a84d83a492',
    '20251213142548_7e9c4478-2109-4f16-87b1-4f6a23b79ec3',
    '20251220225804_a0e95db5-205f-42ba-afb7-2dd5f16412a4',
    '20251212113943_64b727ba-fc83-47eb-9a6c-12ef18c454a4',
    '20251115180934_afff8406-1d21-440e-ba6b-35c0cc4852f5',
  ]) await pg.exec(migration(name));
  await pg.exec(migration('20251122155759_92f1d8ce-3bf2-4992-ba51-366d73fa76f8').split('-- Migration 2:')[0]);
  await pg.exec(migration('20261013120000_companion_evidence_and_memory'));
  await pg.exec(migration('20261015153000_caption_context_revision'));
  await pg.exec(migration('20261015195500_companion_answer_revision'));
  await pg.exec('GRANT SELECT, INSERT ON public.ai_conversations TO authenticated');
  const fixtures = [
    ['tv', 1, 1, 800, 810, 'previous', 3],
    ['tv', 1, 2, 10, 20, 'safe', 3],
    ['tv', 1, 2, 25, 30, 'exact', 3],
    ['tv', 1, 2, 29, 30.001, 'crossing', 3],
    ['tv', 1, 2, 40, 45, 'future', 3],
    ['tv', 1, 3, 0, 5, 'nextEpisode', 3],
    ['tv', 2, 1, 0, 5, 'nextSeason', 3],
    ['tv', 1, 2, 1, 2, 'legacy', 1],
    ['tv', 1, 2, 1, 2, 'oldCacheTail', 2],
    ['movie', null, null, 1, 2, 'oldMovieCache', 2],
    ['movie', null, null, 10, 20, 'movieSafe', 3],
    ['movie', null, null, 29, 30.001, 'movieCrossing', 3],
    ['movie', null, null, 40, 45, 'movieFuture', 3],
  ];
  for (const [i, [type, season, episode, start, end, label, version]] of fixtures.entries()) {
    await pg.query(`INSERT INTO subtitle_chunks(tmdb_id, media_type, season_number, episode_number,
      chunk_index, start_seconds, end_seconds, content, embedding, ingestion_version, cues)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10::jsonb)`,
    [type, season, episode, i, start, end, `letter ${label}`, embedding, version, JSON.stringify([{ start, end, text: label }])]);
  }
});
afterAll(() => pg.close());

async function search(type: string, season: number | null, episode: number | null, seconds: number, semantic = true) {
  const { rows } = await pg.query<{ content: string }>(
    'SELECT content FROM match_companion_chunks(1,$1,$2,$3,$4,$5,$6::vector)',
    [type, season, episode, seconds, 'letter', semantic ? embedding : null]);
  return rows.map(row => row.content.replace('letter ', '')).sort();
}
const answer = (overrides = {}) => ({ id: randomUUID(), title_id: 1, media_type: 'tv', season_number: 1,
  episode_number: 2, position_seconds: 30, timestamp: '00:00:30', question: 'Why the letter?',
  answer: 'The letter is sealed.', context: 'S1E2 @ 00:00:30', evidence: [], answer_status: 'answered', companion_version: 3, ...overrides });
async function save(payload = answer(), charge = true, owner = user) {
  const { rows } = await pg.query<{ result: { usedCoins: number; remainingFreeQuestions: number; conversation: { id: string; answer: string } } }>(
    'SELECT record_companion_answer($1,$2::jsonb,$3) AS result', [owner, JSON.stringify(payload), charge]);
  return rows[0].result;
}

describe('database evidence retrieval', () => {
  it('filters future cues, episodes, seasons, and legacy chunks before keyword or vector ranking', async () => {
    expect(await search('tv', 1, 2, 30)).toEqual(['exact', 'previous', 'safe']);
    expect(await search('tv', 1, 2, 30, false)).toEqual(['exact', 'previous', 'safe']);
    expect(await search('tv', 1, 2, 15)).toEqual(['previous']);
  });
  it('rewinding or going back an episode shrinks the permitted evidence', async () => {
    expect(await search('tv', 1, 2, 45)).toContain('future');
    expect(await search('tv', 1, 2, 0)).toEqual(['previous']);
    expect(await search('tv', 1, 1, 30)).toEqual([]);
    expect(await search('tv', 1, 1, 810)).toEqual(['previous']);
  });
  it('finds movie evidence with null episode fields and excludes crossing chunks', async () => {
    expect(await search('movie', null, null, 30)).toEqual(['movieSafe']);
    expect(await search('movie', null, null, 0)).toEqual([]);
  });
  it('also applies the boundary to the older RPC', async () => {
    const { rows } = await pg.query<{ content: string }>(
      "SELECT content FROM match_subtitle_chunks($1::vector,1,'movie',NULL,NULL,30,100)", [embedding]);
    expect(rows.map(row => row.content)).toEqual(['letter movieSafe']);
  });
});

describe('saved answers, payment and ownership', () => {
  it('refuses an older in-flight writer before creating usage or charging', async () => {
    const owner = randomUUID();
    for (const companion_version of [undefined, 2]) {
      const payload = answer({ companion_version });
      await expect(save(payload, true, owner)).rejects.toThrow('Companion upgrade required');
      expect((await pg.query('SELECT id FROM ai_conversations WHERE id=$1', [payload.id])).rows).toEqual([]);
    }
    expect((await pg.query('SELECT user_id FROM user_ai_usage WHERE user_id=$1', [owner])).rows).toEqual([]);
  });
  it('preserves retired answers but never replays or charges for their request IDs', async () => {
    const owner = randomUUID(), payload = answer({ answer: 'UNVERIFIED_OLD_ANSWER' });
    await save(payload, false, owner);
    await pg.query('UPDATE ai_conversations SET companion_version=2 WHERE id=$1', [payload.id]);
    await expect(save(payload, true, owner)).rejects.toThrow('older companion version');
    expect((await pg.query('SELECT answer,companion_version FROM ai_conversations WHERE id=$1', [payload.id])).rows)
      .toEqual([{ answer: 'UNVERIFIED_OLD_ANSWER', companion_version: 2 }]);
    expect((await pg.query('SELECT questions_today FROM user_ai_usage WHERE user_id=$1', [owner])).rows).toEqual([{ questions_today: 0 }]);
    const fresh = answer();
    await save(fresh, false, owner);
    expect((await pg.query('SELECT companion_version FROM ai_conversations WHERE id=$1', [fresh.id])).rows)
      .toEqual([{ companion_version: 3 }]);
  });
  it('charges once, returns the original answer on retry, and rejects ID reuse at a new position', async () => {
    await pg.query('INSERT INTO user_ai_usage(user_id,questions_today,last_reset_date) VALUES ($1,5,(now() AT TIME ZONE \'UTC\')::date)', [user]);
    await pg.query('INSERT INTO user_stats(user_id,coins) VALUES ($1,150)', [user]);
    const payload = answer();
    expect((await save(payload)).usedCoins).toBe(150);
    const retry = await save({ ...payload, answer: 'A newly generated answer must not replace the saved one.' });
    expect(retry.usedCoins).toBe(0);
    expect(retry.conversation.answer).toBe(payload.answer);
    await expect(save({ ...payload, position_seconds: 10 })).rejects.toThrow('different question');
    const { rows } = await pg.query('SELECT coins,questions_today FROM user_stats JOIN user_ai_usage USING(user_id) WHERE user_id=$1', [user]);
    expect(rows).toEqual([{ coins: 0, questions_today: 6 }]);
  });
  it('does not charge abstentions and rolls back failed paid answers', async () => {
    const payload = answer({ answer_status: 'insufficient_evidence' });
    expect((await save(payload, false)).usedCoins).toBe(0);
    const rejected = answer();
    await expect(save(rejected)).rejects.toThrow('Insufficient coins');
    expect((await pg.query('SELECT id FROM ai_conversations WHERE id=$1', [rejected.id])).rows).toEqual([]);
    expect((await pg.query('SELECT questions_today FROM user_ai_usage WHERE user_id=$1', [user])).rows).toEqual([{ questions_today: 6 }]);
  });
  it('loads only this user, title, episode, version and viewing point from saved history', async () => {
    const owner = randomUUID();
    const safe = answer({ position_seconds: 10 });
    await save(safe, false, owner);
    await save(answer({ position_seconds: 50 }), false, owner);
    await save(answer({ episode_number: 3, position_seconds: 5 }), false, owner);
    await save(answer({ title_id: 2, position_seconds: 5 }), false, owner);
    await save(answer({ position_seconds: 5 }), false, otherUser);
    const retired = answer({ position_seconds: 5 });
    await save(retired, false, owner);
    await pg.query('UPDATE ai_conversations SET companion_version=2 WHERE id=$1', [retired.id]);
    await pg.query('SELECT set_config(\'request.jwt.claim.sub\',$1,false)', [owner]);
    await pg.exec('SET ROLE authenticated');
    try {
      const { rows } = await pg.query(`SELECT id FROM ai_conversations WHERE title_id=1 AND media_type='tv'
        AND season_number=1 AND episode_number=2 AND companion_version=3 AND position_seconds <= 30`);
      expect(rows).toEqual([{ id: safe.id }]);
    } finally { await pg.exec('RESET ROLE'); }
  });
  it('prevents clients creating trusted answers or invoking privileged retrieval/payment RPCs', async () => {
    await pg.query('SELECT set_config(\'request.jwt.claim.sub\',$1,false)', [user]);
    await pg.exec('SET ROLE authenticated');
    try {
      await expect(pg.query(`INSERT INTO ai_conversations(user_id,title_id,media_type,question,answer,context,companion_version)
        VALUES ($1,1,'movie','q','FORGED_FUTURE','test',3)`, [user])).rejects.toThrow('row-level security');
      await expect(save(answer(), false)).rejects.toThrow('permission denied');
      await expect(search('tv', 1, 2, 30)).rejects.toThrow('permission denied');
    } finally { await pg.exec('RESET ROLE'); }
  });
});
