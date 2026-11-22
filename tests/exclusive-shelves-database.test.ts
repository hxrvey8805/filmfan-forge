import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';

const pg = new PGlite();
const migration = (name: string) => readFileSync(new URL('../supabase/migrations/' + name + '.sql', import.meta.url), 'utf8');
const rule = migration('20261122210000_exclusive_active_shelves');
const legacy = randomUUID();
let owner: string;
beforeAll(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await pg.exec(migration('20251029164936_a2d53dd6-a1fb-4f87-9cfb-8a492bf2fa6b'));
  await pg.exec(migration('20251114210022_ea32c099-c594-4b12-872e-1e00b09ea65f'));
  await pg.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON user_titles TO authenticated');
  await pg.query('INSERT INTO auth.users VALUES($1)', [legacy]);
  for (const shelf of ['watchlist', 'watching', 'favourite', 'watched']) {
    await pg.query(`INSERT INTO user_titles(user_id,title_id,title,type,poster_path,list_type,progress)
      VALUES($1,1,'Legacy','movie','',$2,$3)`, [legacy, shelf, shelf === 'watching' ? null : 37]);
  }
  await pg.exec(rule);
});
afterAll(() => pg.close());
beforeEach(async () => { owner = randomUUID(); await pg.query('INSERT INTO auth.users VALUES($1)', [owner]); });
const add = (shelf: string, progress: number | null = null, type = 'movie', user = owner) =>
  pg.query(`INSERT INTO user_titles(user_id,title_id,title,type,poster_path,list_type,progress)
    VALUES($1,1,'A title',$2,'',$3,$4) RETURNING *`, [user, type, shelf, progress]);
const rows = async (user = owner) => (await pg.query<{list_type:string;type:string;progress:number|null;id:string}>(
  'SELECT * FROM user_titles WHERE user_id=$1 ORDER BY type,list_type', [user])).rows;
const shelves = async (user = owner) => (await rows(user)).map(row => row.list_type);

it('cleans legacy duplicates, keeps Watching/progress and Favourites; can rerun', async () => {
  expect(await shelves(legacy)).toEqual(['favourite','watching']);
  expect((await rows(legacy)).find(row => row.list_type === 'watching')?.progress).toBe(37);
  await pg.exec(rule);
  expect(await shelves(legacy)).toEqual(['favourite','watching']);
});
it.each([['watchlist','watching'],['watching','watchlist']])('adding to %s then %s moves the active title and retains progress', async (from,to) => {
  await add(from, 42);
  await add(to);
  expect(await shelves()).toEqual([to]);
  expect((await rows()).find(row => row.list_type === to)?.progress).toBe(42);
});
it('allows the same numerical movie and TV ID in separate active shelves and in the same shelf', async () => {
  await add('watchlist', 7, 'movie'); await add('watching', 13, 'tv');
  await add('watching', null, 'movie');
  expect((await rows()).map(row => [row.type,row.list_type,row.progress])).toEqual([
    ['movie','watching',7], ['tv','watching',13],
  ]);
});
it('supports updates from an optional shelf into Watching while removing Watched', async () => {
  await add('watched', 25); await add('favourite');
  await pg.query("UPDATE user_titles SET list_type='watching' WHERE user_id=$1 AND list_type='favourite'", [owner]);
  expect(await shelves()).toEqual(['watching']);
  expect((await rows()).find(row => row.list_type === 'watching')?.progress).toBe(25);
});
it('keeps Favourites alongside Watching, then alongside Watched, with no duplicate within either shelf', async () => {
  await add('watching', 0); await add('favourite');
  for (const shelf of ['watching','favourite']) await expect(add(shelf)).rejects.toThrow('duplicate key');
  expect(await shelves()).toEqual(['favourite','watching']);
  expect((await rows()).find(row => row.list_type === 'watching')?.progress).toBe(0);
  await add('watched');
  expect(await shelves()).toEqual(['favourite','watched']);
  await expect(add('watched')).rejects.toThrow('duplicate key');
});
it.each(['watching','watched','favourite'])('never allows Watchlist alongside %s, in either direction', async shelf => {
  await add('watchlist', 15); await add(shelf);
  expect(await shelves()).toEqual([shelf]);
  await add('watchlist');
  expect(await shelves()).toEqual(['watchlist']);
  expect((await rows())[0].progress).toBe(15);
});
it('returning to Watchlist removes both Watched and Favourites, keeping status progress', async () => {
  await add('watched',80); await add('favourite',3); await add('watchlist');
  expect(await shelves()).toEqual(['watchlist']); expect((await rows())[0].progress).toBe(80);
});
it('rolls back the entire move if the destination write fails', async () => {
  await add('watchlist', 60);
  const before = await rows();
  await expect(pg.query(`INSERT INTO user_titles(user_id,title_id,title,type,poster_path,list_type)
    VALUES($1,1,NULL,'movie','','watching')`, [owner])).rejects.toThrow('not-null');
  expect(await rows()).toEqual(before);
});
it('applies the rule under RLS and leaves other accounts untouched', async () => {
  const other = randomUUID(); await pg.query('INSERT INTO auth.users VALUES($1)', [other]);
  await add('watchlist', 10); await add('watchlist', 20, 'movie', other);
  await pg.transaction(async tx => {
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query(`INSERT INTO user_titles(user_id,title_id,title,type,poster_path,list_type)
      VALUES($1,1,'A title','movie','','watching')`, [owner]);
  });
  expect(await shelves()).toEqual(['watching']); expect(await shelves(other)).toEqual(['watchlist']);
  await expect(pg.transaction(async tx => {
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query(`INSERT INTO user_titles(user_id,title_id,title,type,poster_path,list_type)
      VALUES($1,1,'A title','movie','','watching')`, [other]);
  })).rejects.toThrow('row-level security');
  expect(await shelves(other)).toEqual(['watchlist']);
});
