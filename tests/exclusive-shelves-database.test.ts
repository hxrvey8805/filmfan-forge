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
const move = (from:string|null, to:string, type='movie', user=owner, data:Record<string,unknown>={}) => pg.transaction(async tx => {
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
  await tx.exec('SET LOCAL ROLE authenticated');
  return (await tx.query<{result:{id:string}}>('SELECT move_cinegeek_library_title($1,$2,$3) AS result',
    [JSON.stringify({id:1,type,title:'A title',posterPath:'',...data}),to,from])).rows[0].result;
});
it.each([
  ['watchlist','watching'],['watching','watchlist'],['watchlist','watched'],['watched','watchlist'],
  ['watchlist','favourite'],['favourite','watchlist'],['watching','watched'],['watched','watching'],
])('blocks normal additions from %s to %s without changing any existing row', async (from,to) => {
  await add(from,42); const before=await rows();
  await expect(add(to)).rejects.toThrow('duplicate key');
  expect(await rows()).toEqual(before);
});
it('allows adding elsewhere only after removal, without an implicit move', async () => {
  await add('watchlist');
  await pg.query('DELETE FROM user_titles WHERE user_id=$1',[owner]);
  await add('watching'); expect(await shelves()).toEqual(['watching']);
});
it('explicit moves preserve progress and Favourites, are retry safe and allow a return to Watchlist', async () => {
  await add('watchlist',42);
  const first=await move('watchlist','watching');
  expect(await move('watchlist','watching')).toEqual(first);
  expect(await shelves()).toEqual(['watching']);
  await add('favourite');
  await move('watching','watched');
  expect(await shelves()).toEqual(['favourite','watched']);
  expect((await rows()).find(row=>row.list_type==='watched')?.progress).toBe(42);
  await move('favourite','watchlist');
  expect(await shelves()).toEqual(['watchlist']); expect((await rows())[0].progress).toBe(42);
});
it('allows Favourites alongside Watching or Watched, but not duplicate copies on one shelf', async () => {
  await add('watching',0); await add('favourite');
  for(const shelf of ['watching','favourite'])await expect(add(shelf)).rejects.toThrow('duplicate key');
  expect(await shelves()).toEqual(['favourite','watching']);
  await move('watching','watched');
  expect(await shelves()).toEqual(['favourite','watched']);
  expect((await rows()).find(row=>row.list_type==='watched')?.progress).toBe(0);
});
it('keeps movie/TV IDs separate and leaves other accounts untouched', async () => {
  const other=randomUUID();await pg.query('INSERT INTO auth.users VALUES($1)',[other]);
  await add('watchlist',7);await add('watching',13,'tv');await add('watchlist',20,'movie',other);
  await move('watchlist','watching');
  expect((await rows()).map(row=>[row.type,row.list_type,row.progress])).toEqual([
    ['movie','watching',7],['tv','watching',13],
  ]);
  expect(await shelves(other)).toEqual(['watchlist']);
});
it('uses authenticated ownership, rejects missing source records, invalid destinations and anonymous moves', async () => {
  await add('watchlist',25);
  const other=randomUUID();await pg.query('INSERT INTO auth.users VALUES($1)',[other]);
  await expect(move('watchlist','watching','movie',other)).rejects.toThrow('changed elsewhere');
  await expect(move('watchlist','invalid')).rejects.toThrow('Invalid library shelf');
  await expect(pg.transaction(async tx=>{
    await tx.exec('SET LOCAL ROLE anon');
    return tx.query("SELECT move_cinegeek_library_title($1,'watching','watchlist')",[JSON.stringify({id:1,type:'movie'})]);
  })).rejects.toThrow('permission denied');
  expect(await shelves()).toEqual(['watchlist']);
  await expect(pg.transaction(async tx=>{
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[other]);await tx.exec('SET LOCAL ROLE authenticated');
    return tx.query("INSERT INTO user_titles(user_id,title_id,title,type,poster_path,list_type) VALUES($1,2,'Other','movie','','watchlist')",[owner]);
  })).rejects.toThrow('row-level security');
});
it('moves an explicitly selected custom-list title without requiring a server-side source row', async () => {
  await move(null,'watching'); expect(await shelves()).toEqual(['watching']);
  await move(null,'favourite'); expect(await shelves()).toEqual(['favourite','watching']);
});
it('rolls back removal if an explicit move cannot finish', async () => {
  await add('watchlist',60); const before=await rows();
  await pg.exec("ALTER TABLE user_titles ADD CONSTRAINT fixture_reject_watching CHECK (list_type <> 'watching') NOT VALID");
  try {await expect(move('watchlist','watching')).rejects.toThrow('fixture_reject_watching');expect(await rows()).toEqual(before);}
  finally {await pg.exec('ALTER TABLE user_titles DROP CONSTRAINT fixture_reject_watching');}
});
