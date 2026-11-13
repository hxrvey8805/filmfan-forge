import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
const db=new PGlite();
beforeAll(async()=>{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 await db.exec(readFileSync(new URL('../supabase/migrations/20261112180000_subtitle_unavailability.sql',import.meta.url),'utf8'));
});
afterAll(()=>db.close());
it('keeps missing-source metadata private and writable only by the service',async()=>{
 for(const role of ['anon','authenticated']) {
  expect((await db.query<{allowed:boolean}>(`SELECT has_table_privilege('${role}', 'companion_subtitle_unavailability','SELECT') AS allowed`)).rows[0].allowed).toBe(false);
  expect((await db.query<{allowed:boolean}>(`SELECT has_table_privilege('${role}', 'companion_subtitle_unavailability','INSERT') AS allowed`)).rows[0].allowed).toBe(false);
 }
 await db.exec("SET ROLE service_role; INSERT INTO companion_subtitle_unavailability VALUES (289517,1,1,3,now()+interval '1 hour'); RESET ROLE;");
 expect((await db.query('SELECT * FROM companion_subtitle_unavailability')).rows).toHaveLength(1);
 expect((await db.query<{enabled:boolean}>("SELECT relrowsecurity AS enabled FROM pg_class WHERE relname='companion_subtitle_unavailability'")).rows[0].enabled).toBe(true);
});
it('separates title, episode and source-version checkpoints and lets expired entries retry',async()=>{
 await db.exec("INSERT INTO companion_subtitle_unavailability VALUES (289517,1,2,3,now()-interval '1 minute'),(289517,1,1,4,now()+interval '1 hour'),(999,1,1,3,now()+interval '1 hour');");
 const rows=(await db.query('SELECT episode_number FROM companion_subtitle_unavailability WHERE tmdb_id=289517 AND ingestion_version=3 AND retry_after>now()')).rows;
 expect(rows).toEqual([{episode_number:1}]);
});
