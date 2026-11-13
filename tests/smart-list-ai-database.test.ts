import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
const pg=new PGlite();
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const hash='a'.repeat(64);
const reserve=async(user=owner,key=hash)=> (await pg.query<{result:any}>('select reserve_smart_list_interpretation($1,$2,$3) as result',[user,key,crypto.randomUUID()])).rows[0].result;
beforeAll(async()=>{
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');`);
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261112160000_smart_list_interpreter.sql',import.meta.url),'utf8'));
});
beforeEach(()=>pg.exec('TRUNCATE smart_list_interpretations'));
afterAll(()=>pg.close());
it('caches per user and counts failures without consuming companion credits',async()=>{
  expect(await reserve()).toEqual({status:'reserved'});
  expect(await reserve()).toEqual({status:'busy'});
  const cached={kind:'clarify',reason:'vague'};
  await pg.query('UPDATE smart_list_interpretations SET result=$1',[JSON.stringify(cached)]);
  expect(await reserve()).toEqual({status:'cached',result:cached});
  expect(await reserve(other)).toEqual({status:'reserved'});
});
it('enforces the daily user cap and resets by UTC day',async()=>{
  for(let i=0;i<5;i++){
    expect(await reserve(owner,String(i).repeat(64))).toEqual({status:'reserved'});
    await pg.exec("UPDATE smart_list_interpretations SET created_at = now() - interval '31 seconds'");
  }
  expect(await reserve(owner,'f'.repeat(64))).toEqual({status:'limited'});
  await pg.exec("UPDATE smart_list_interpretations SET created_at = now() - interval '1 day'");
  expect(await reserve(owner,'f'.repeat(64))).toEqual({status:'reserved'});
});
it('caps the whole free helper across accounts',async()=>{
  await pg.exec(`INSERT INTO smart_list_interpretations SELECT gen_random_uuid(),'${other}','${hash}',now() - interval '31 seconds',NULL FROM generate_series(1,100)`);
  expect(await reserve()).toEqual({status:'limited'});
});
it('prevents client cache reads/writes and quota bypass',async()=>{
  for(const role of ['anon','authenticated']) {
    const {rows}=await pg.query<{read:boolean;write:boolean;reserve:boolean}>(`SELECT has_table_privilege($1,'smart_list_interpretations','SELECT') as read,
      has_table_privilege($1,'smart_list_interpretations','INSERT') as write,
      has_function_privilege($1,'reserve_smart_list_interpretation(uuid,text,uuid)','EXECUTE') as reserve`,[role]);
    expect(rows[0]).toEqual({read:false,write:false,reserve:false});
  }
  expect((await pg.query<{rls:boolean}>("select relrowsecurity as rls from pg_class where relname='smart_list_interpretations'")).rows[0].rls).toBe(true);
});
it('expires old interpretations and deletes cache with account',async()=>{
  await reserve();await pg.exec("UPDATE smart_list_interpretations SET created_at=now()-interval '31 days',result='{\"kind\":\"clarify\",\"reason\":\"vague\"}'");
  expect(await reserve()).toEqual({status:'reserved'});
  expect((await pg.query('select * from smart_list_interpretations')).rows).toHaveLength(1);
  await pg.query('DELETE FROM auth.users WHERE id=$1',[owner]);
  expect((await pg.query('select * from smart_list_interpretations')).rows).toHaveLength(0);
});
