import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
const pg=new PGlite({extensions:{vector}});
const migration=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
let user:string;
beforeAll(async()=>{
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  for(const name of ['20251212124452_183e3a1b-1ce7-4ad2-8dbb-70a84d83a492',
    '20251213142548_7e9c4478-2109-4f16-87b1-4f6a23b79ec3','20251220225804_a0e95db5-205f-42ba-afb7-2dd5f16412a4',
    '20251212113943_64b727ba-fc83-47eb-9a6c-12ef18c454a4','20251115180934_afff8406-1d21-440e-ba6b-35c0cc4852f5']) await pg.exec(migration(name));
  await pg.exec(migration('20251122155759_92f1d8ce-3bf2-4992-ba51-366d73fa76f8').split('-- Migration 2:')[0]);
  for(const name of ['20261013120000_companion_evidence_and_memory','20261015153000_caption_context_revision',
    '20261015195500_companion_answer_revision','20261106093000_quarantine_subtitle_editions','20261106163000_shared_cut_revision',
    '20261105170000_companion_sol_budget','20261113190000_companion_monthly_allowance']) await pg.exec(migration(name));
  for(const name of ['20251114214139_cac7e901-0afa-4a2d-9233-df3d7be49a29','20251114215942_67f42c53-f7a7-40eb-9c4c-76f082338a1b',
    '20251126204536_add_pack_tier','20261112160000_smart_list_interpreter','20261113200000_pro_xp_collections',
    '20261114120000_companion_spending_safeguards'])await pg.exec(migration(name));
});

afterAll(()=>pg.close());
beforeEach(async()=>{user=randomUUID();await pg.query('INSERT INTO auth.users VALUES($1)',[user]);});
async function call(name:string,args:unknown[]=[],role='authenticated',owner=user){return pg.transaction(async tx=>{
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.exec(`SET LOCAL ROLE ${role}`);
  return (await tx.query<{result:any}>(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
});}
const access=()=>call('get_cinegeek_access');
async function pro(plan='monthly'){await pg.query(`INSERT INTO companion_pro_entitlements(user_id,plan,anchor,valid_until,verified_transaction_id) VALUES($1,$2,now()-interval '1 day',now()+interval '1 year',$3)`,[user,plan,randomUUID()]);}
async function wallet(xp=1000){await pg.query('INSERT INTO cinegeek_xp(user_id,available,lifetime) VALUES($1,$2,$2) ON CONFLICT(user_id) DO UPDATE SET available=$2,lifetime=$2',[user,xp]);}
async function pack(type='actor',person=123){const {rows}=await pg.query<{id:string}>('INSERT INTO user_packs(user_id,pack_type) VALUES($1,$2) RETURNING id',[user,type]);const id=rows[0].id,token=randomUUID();await call('claim_cinegeek_pack',[user,id,token],'service_role');await call('store_cinegeek_reveal',[user,id,token,JSON.stringify({id:person,name:'Person '+person,profile_path:'/test.jpg'})],'service_role');return id;}
async function card(id:number,type='actor',owner=user){await pg.query('INSERT INTO auth.users VALUES($1) ON CONFLICT DO NOTHING',[owner]);return (await pg.query<{id:string}>("INSERT INTO user_collection(user_id,person_id,person_name,person_type,profile_path) VALUES($1,$2,'Person',$3,'') RETURNING id",[owner,id,type])).rows[0].id;}
async function win(id=randomUUID()){
 await call('start_cinegeek_game',[id,1,2]);const token=randomUUID(),proof=[{type:'actor',id:1},{type:'movie',id:3},{type:'actor',id:2}];
 await call('claim_cinegeek_win',[user,id,JSON.stringify(proof),token],'service_role');
 return {id,token,result:await call('finish_cinegeek_win',[user,id,token,true],'service_role')};
}
it.each(['free','monthly','annual'])('enforces %s without enabling payments or granting questions for XP',async plan=>{
 if(plan!=='free')await pro(plan);await wallet();const a=await access();
 expect(a).toMatchObject({plan,purchasesEnabled:false,focusGeek:true,smartLists:plan!=='free',allSkins:plan==='annual',xp:1000,xpDailyCap:225,gamesRemaining:plan==='free'?1:null});
 await expect(call('redeem_cinegeek_xp',[randomUUID(),'questions:5'])).rejects.toThrow('XP cannot buy');
 expect((await access()).xp).toBe(1000);
});
it('revoked and expired subscriptions return to default Free without deleting skins',async()=>{
 await pro();await wallet(2000);await call('redeem_cinegeek_xp',[randomUUID(),'skin:jedi']);
 await pg.query('UPDATE companion_pro_entitlements SET revoked=true WHERE user_id=$1',[user]);
 expect(await access()).toMatchObject({plan:'free',smartLists:false,unlockedSkins:['jedi']});
 await pg.query("UPDATE companion_pro_entitlements SET revoked=false,anchor=now()-interval '2 days',valid_until=now()-interval '1 day' WHERE user_id=$1",[user]);
 expect((await access()).plan).toBe('free');
});
it('redemption retries charge once and cannot redeem for another user',async()=>{
 await wallet();const id=randomUUID();const a=await call('redeem_cinegeek_xp',[id,'pack:actor']);
 expect(await call('redeem_cinegeek_xp',[id,'pack:actor'])).toEqual(a);expect((await access()).xp).toBe(850);expect((await access()).lifetimeXp).toBe(1000);
 await expect(call('redeem_cinegeek_xp',[id,'pack:director'])).rejects.toThrow();
 await expect(call('redeem_cinegeek_xp',[id,'pack:actor'],'authenticated',randomUUID())).rejects.toThrow();
});
it.each(['free','annual'])('%s cannot spend XP on a skin',async plan=>{if(plan==='annual')await pro(plan);await wallet(2000);await expect(call('redeem_cinegeek_xp',[randomUUID(),'skin:jedi'])).rejects.toThrow();});
it('insufficient XP leaves both inventory and balance unchanged',async()=>{await wallet(149);await expect(call('redeem_cinegeek_xp',[randomUUID(),'pack:actor'])).rejects.toThrow('Not enough');expect((await access()).xp).toBe(149);});
it('Free gets one game start per UTC day even after abandon; a retry does not consume twice',async()=>{
 const id=randomUUID();await call('start_cinegeek_game',[id,1,2]);await call('start_cinegeek_game',[id,1,2]);expect((await access()).gamesRemaining).toBe(0);
 await call('end_cinegeek_game',[id]);await expect(call('start_cinegeek_game',[randomUUID(),1,2])).rejects.toThrow('free game');
 await pg.query("UPDATE cinegeek_games SET started_at=now()-interval '1 day' WHERE id=$1",[id]);expect((await access()).gamesRemaining).toBe(1);
});
it.each(['monthly','annual'])('%s wins are verified, idempotent, capped and earn only one daily spin',async plan=>{
 await pro(plan);const first=await win();expect(first.result).toEqual({won:true,xp:75});
 expect(await call('finish_cinegeek_win',[user,first.id,first.token,true],'service_role')).toEqual(first.result);
 await win();await win();expect((await win()).result.xp).toBe(0);expect(await access()).toMatchObject({xp:225,xpToday:225,spinAvailable:true});
 const prize=await call('spin_cinegeek_reward');expect(await call('spin_cinegeek_reward')).toEqual(prize);expect((await access()).spinAvailable).toBe(false);expect((await access()).xpToday).toBeLessThanOrEqual(225);
});
it('Free cannot spin or self-report a rewarded win',async()=>{await win();await expect(call('spin_cinegeek_reward')).rejects.toThrow();await expect(call('finish_cinegeek_win',[user,randomUUID(),randomUUID(),true])).rejects.toThrow('permission');});
it('late and forged paths cannot claim rewards; submitted proof cannot change',async()=>{
 await pro();const id=randomUUID();await call('start_cinegeek_game',[id,1,2]);await pg.query("UPDATE cinegeek_games SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
 await expect(call('claim_cinegeek_win',[user,id,'[1,2,3]',randomUUID()],'service_role')).rejects.toThrow('ended');
 const next=randomUUID(),token=randomUUID();await call('start_cinegeek_game',[next,1,2]);await call('claim_cinegeek_win',[user,next,'[1,2,3]',token],'service_role');
 await expect(call('claim_cinegeek_win',[user,next,'[2,3,4]',randomUUID()],'service_role')).rejects.toThrow('cannot change');
 expect(await call('finish_cinegeek_win',[user,next,token,false],'service_role')).toEqual({won:false,xp:0});expect((await access()).xp).toBe(0);
});
it('a reveal stays fixed on retries and does not add a card before acceptance',async()=>{
 const id=await pack(),token=randomUUID();expect((await call('claim_cinegeek_pack',[user,id,token],'service_role')).person.id).toBe(123);
 expect((await call('store_cinegeek_reveal',[user,id,token,JSON.stringify({id:999,name:'Other'})],'service_role')).person.id).toBe(123);
 expect((await pg.query('SELECT * FROM user_collection WHERE user_id=$1',[user])).rows).toHaveLength(0);
 await call('decide_cinegeek_pack',[id,true]);await call('decide_cinegeek_pack',[id,true]);
 expect((await pg.query('SELECT * FROM user_collection WHERE user_id=$1',[user])).rows).toHaveLength(1);
 await expect(call('decide_cinegeek_pack',[id,false])).rejects.toThrow('already decided');
});
it('five actors and five directors are independent caps; replacement is atomic with no refund',async()=>{
 await wallet();let old='';for(let i=1;i<=5;i++){old=await card(i);await card(10+i,'director');}
 const id=await pack('actor',123);await expect(call('decide_cinegeek_pack',[id,true])).rejects.toThrow('five');
 await call('decide_cinegeek_pack',[id,true,old]);expect((await pg.query('SELECT * FROM user_collection WHERE user_id=$1',[user])).rows).toHaveLength(10);expect((await access()).xp).toBe(1000);
});
it('skipping gives no refund and consumes the pack; duplicate acceptance is refused',async()=>{
 await wallet(1000);await card(123);const id=await pack();await expect(call('decide_cinegeek_pack',[id,true])).rejects.toThrow('already in');
 await call('decide_cinegeek_pack',[id,false]);await expect(call('claim_cinegeek_pack',[user,id,randomUUID()],'service_role')).rejects.toThrow('unavailable');expect((await access()).xp).toBe(1000);
});
it('replacement cannot delete another user’s card or the other collection',async()=>{
 const other=await card(99,'actor',randomUUID()),director=await card(100,'director');const id=await pack();
 await expect(call('decide_cinegeek_pack',[id,true,other])).rejects.toThrow('own cards');await expect(call('decide_cinegeek_pack',[id,true,director])).rejects.toThrow('own cards');
 expect((await pg.query('SELECT * FROM user_collection WHERE id=ANY($1::uuid[])',[[other,director]])).rows).toHaveLength(2);
});
it('two keep requests cannot make a sixth card',async()=>{
 for(let i=1;i<=4;i++)await card(i);const a=await pack('actor',98),b=await pack('actor',99);
 const results=await Promise.allSettled([call('decide_cinegeek_pack',[a,true]),call('decide_cinegeek_pack',[b,true])]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await pg.query('SELECT * FROM user_collection WHERE user_id=$1',[user])).rows).toHaveLength(5);
});
it('browser clients cannot mint balances, cards, packs or bypass server validation',async()=>{
 for(const table of ['cinegeek_xp','cinegeek_xp_events','cinegeek_unlocks','cinegeek_games','user_stats','user_collection','user_packs']){
   const {rows}=await pg.query<{allowed:boolean}>("SELECT has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') allowed",[table]);expect(rows[0].allowed).toBe(false);
 }
 for(const fn of ['finish_cinegeek_win(uuid,uuid,uuid,boolean)','claim_cinegeek_pack(uuid,uuid,uuid)','store_cinegeek_reveal(uuid,uuid,uuid,jsonb)'])expect((await pg.query<{allowed:boolean}>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed",[fn])).rows[0].allowed).toBe(false);
});
it('Smart Lists refuse Free even when a cached interpretation exists; both paid plans can reserve',async()=>{
 const hash='a'.repeat(64);expect(await call('reserve_smart_list_interpretation',[user,hash,randomUUID()],'service_role')).toEqual({status:'pro_required'});
 await pro();expect(await call('reserve_smart_list_interpretation',[user,hash,randomUUID()],'service_role')).toEqual({status:'reserved'});
 await pg.query(`UPDATE smart_list_interpretations SET result='{"kind":"clarify","reason":"vague"}' WHERE user_id=$1`,[user]);
 await pg.query('UPDATE companion_pro_entitlements SET revoked=true WHERE user_id=$1',[user]);expect(await call('reserve_smart_list_interpretation',[user,hash,randomUUID()],'service_role')).toEqual({status:'pro_required'});
 await pg.query("UPDATE companion_pro_entitlements SET revoked=false,plan='annual' WHERE user_id=$1",[user]);expect((await call('reserve_smart_list_interpretation',[user,hash,randomUUID()],'service_role')).status).toBe('cached');
});
