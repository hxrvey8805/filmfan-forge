import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
const pg=new PGlite({extensions:{vector}});
const migration=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
let user:string;
const migratedOwner='00000000-0000-4000-8000-000000000023';
beforeAll(async()=>{
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  for(const name of ['20251212124452_183e3a1b-1ce7-4ad2-8dbb-70a84d83a492',
    '20251213142548_7e9c4478-2109-4f16-87b1-4f6a23b79ec3','20251220225804_a0e95db5-205f-42ba-afb7-2dd5f16412a4',
    '20251212113943_64b727ba-fc83-47eb-9a6c-12ef18c454a4','20251115180934_afff8406-1d21-440e-ba6b-35c0cc4852f5']) await pg.exec(migration(name));
  await pg.exec(migration('20251122155759_92f1d8ce-3bf2-4992-ba51-366d73fa76f8').split('-- Migration 2:')[0]);
  // Exercise the actual live bridge -> full tier transition, preserving the
  // original private grant and wallet; no fake Apple receipt is inserted.
  await pg.query('INSERT INTO auth.users VALUES($1)',[migratedOwner]);
  await pg.query('INSERT INTO user_stats(user_id,coins) VALUES($1,147)',[migratedOwner]);
  await pg.exec(readFileSync(new URL('../docs/operations/private-monthly-beta.sql',import.meta.url),'utf8'));
  await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '29 days',false,'Existing owner test grant')",[migratedOwner]);

  for(const name of ['20261013120000_companion_evidence_and_memory','20261015153000_caption_context_revision',
    '20261015195500_companion_answer_revision','20261106093000_quarantine_subtitle_editions','20261106163000_shared_cut_revision',
    '20261105170000_companion_sol_budget','20261113190000_companion_monthly_allowance']) await pg.exec(migration(name));
  for(const name of ['20251114214139_cac7e901-0afa-4a2d-9233-df3d7be49a29','20251114215942_67f42c53-f7a7-40eb-9c4c-76f082338a1b',
    '20251126204536_add_pack_tier','20261112160000_smart_list_interpreter','20261113200000_pro_xp_collections',
    '20261114120000_companion_spending_safeguards','20261116100000_private_grant_tier_rollout','20261121150000_game_connection_recheck'])await pg.exec(migration(name));
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


it('keeps explicit private Monthly access separate from verified Apple purchases',async()=>{
 await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '1 month',false,'Owner test')",[user]);
 expect(await access()).toMatchObject({plan:'monthly',purchasesEnabled:false,smartLists:true,allSkins:false});
 expect((await pg.query('SELECT * FROM companion_pro_entitlements WHERE user_id=$1',[user])).rows).toHaveLength(0);
 await pg.exec('UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000');
 try {
  expect(await call('get_companion_allowance')).toMatchObject({plan:'monthly',limit:15,included:15,purchased:0});
  const request=randomUUID(),attempt=randomUUID();
  expect(await call('begin_companion_question',[user,request,attempt,{}],'service_role')).toMatchObject({mode:'monthly',source:'monthly'});
  expect(await call('get_companion_allowance')).toMatchObject({included:14});
  await call('end_companion_question_attempt',[user,request,attempt,false],'service_role');
  expect(await call('get_companion_allowance')).toMatchObject({included:15});
 } finally {await pg.exec('UPDATE companion_usage_policy SET enabled=false');}
});
it('private grants expire and revoke without giving public Free accounts access',async()=>{
 await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '2 days',now()-interval '1 day',false,'Expired test')",[user]);
 expect((await access()).plan).toBe('free');
 await pg.query("UPDATE cinegeek_private_monthly_grants SET expires_at=now()+interval '1 month',revoked=true WHERE user_id=$1",[user]);
 expect((await access()).plan).toBe('free');
 await expect(call('active_companion_entitlement',[user])).rejects.toThrow('permission');
 await expect(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.exec("UPDATE cinegeek_private_monthly_grants SET revoked=false");})).rejects.toThrow('permission');
});
it('a paid Annual grant takes priority and its revocation does not restore a private test grant',async()=>{
 await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '1 month',false,'Owner test')",[user]);
 await pro('annual');expect((await access()).plan).toBe('annual');
 await pg.query('UPDATE companion_pro_entitlements SET revoked=true WHERE user_id=$1',[user]);
 expect((await access()).plan).toBe('free');
});

it('migrates the existing owner bridge without resetting its dates, funds or identity',async()=>{
 const a=await call('get_cinegeek_access',[],'authenticated',migratedOwner);
 expect(a).toMatchObject({userId:migratedOwner,plan:'monthly',purchasesEnabled:false,xp:147,lifetimeXp:147});
 const grant=(await pg.query('SELECT * FROM cinegeek_private_monthly_grants WHERE user_id=$1',[migratedOwner])).rows[0];
 expect(new Date(a.expiresAt).getTime()).toBe(new Date(grant.expires_at as string).getTime());
 expect((await pg.query('SELECT coins FROM user_stats WHERE user_id=$1',[migratedOwner])).rows[0].coins).toBe(147);
 expect((await pg.query('SELECT * FROM companion_pro_entitlements WHERE user_id=$1',[migratedOwner])).rows).toHaveLength(0);
 await expect(pg.exec(readFileSync(new URL('../docs/operations/retire-private-monthly-beta.sql',import.meta.url),'utf8'))).rejects.toThrow('Full or unexpected access RPCs');
});

it('cannot resume a private recap after the grant was revoked',async()=>{
 await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '1 month',false,'Owner test')",[user]);
 await pg.exec('UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000');
 try {
  const request=randomUUID(),attempt=randomUUID();
  await call('begin_companion_question',[user,request,attempt,{}],'service_role');
  await call('end_companion_question_attempt',[user,request,attempt,true],'service_role');
  await pg.query('UPDATE cinegeek_private_monthly_grants SET revoked=true WHERE user_id=$1',[user]);
  expect(await call('begin_companion_question',[user,request,randomUUID(),{}],'service_role')).toMatchObject({error:'questions_exhausted'});
  expect((await pg.query('SELECT status FROM companion_question_requests WHERE id=$1',[request])).rows[0].status).toBe('released');
 } finally {await pg.exec('UPDATE companion_usage_policy SET enabled=false');}
});

it('an unrelated Free account has no question allowance after activation',async()=>{
 await pg.exec('UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000');
 try {expect(await call('get_companion_allowance')).toMatchObject({plan:'free',included:0,purchased:0,limit:0});}
 finally {await pg.exec('UPDATE companion_usage_policy SET enabled=false');}
});

it('runs the exact rollback-only production smoke script without changing data or money',async()=>{
 const before=JSON.stringify((await pg.query('SELECT to_jsonb(b) budget FROM companion_sol_budget b')).rows);
 const grants=JSON.stringify((await pg.query('SELECT * FROM cinegeek_private_monthly_grants ORDER BY user_id')).rows);
 await pg.query("SELECT set_config('cinegeek.rollout_user',$1,false)",[migratedOwner]);
 await pg.exec(readFileSync(new URL('../docs/operations/check-live-tiers-rollback.sql',import.meta.url),'utf8'));
 expect(JSON.stringify((await pg.query('SELECT to_jsonb(b) budget FROM companion_sol_budget b')).rows)).toBe(before);
 expect(JSON.stringify((await pg.query('SELECT * FROM cinegeek_private_monthly_grants ORDER BY user_id')).rows)).toBe(grants);
 expect((await pg.query("SELECT count(*)::integer n FROM companion_pro_entitlements WHERE verified_transaction_id LIKE 'ROLLBACK_ONLY_%'")).rows[0].n).toBe(0);
});

it('activates the proposed private policy without funding or raising the global budget',async()=>{
 // Match the existing funded live beta; the base migration deliberately starts at zero.
 await pg.exec("UPDATE companion_sol_budget SET limit_micro_usd=5000000,enabled=false WHERE id='sol-beta'");
 const budget=(await pg.query('SELECT limit_micro_usd,committed_micro_usd FROM companion_sol_budget')).rows;
 await pg.exec(readFileSync(new URL('../docs/operations/activate-live-tiers.sql',import.meta.url),'utf8'));
 expect((await pg.query('SELECT limit_micro_usd,committed_micro_usd FROM companion_sol_budget')).rows).toEqual(budget);
 expect((await pg.query('SELECT enabled,question_limit_micro_usd,user_month_limit_micro_usd,question_call_limit,user_day_limit_micro_usd FROM companion_usage_policy')).rows[0])
  .toMatchObject({enabled:true,question_limit_micro_usd:350000,user_month_limit_micro_usd:3000000,question_call_limit:64,user_day_limit_micro_usd:null});
});
it('rechecks an old on-time rejection once, awards once, and preserves the frozen proof and deadline',async()=>{
 await pro();const id=randomUUID(),token=randomUUID(),proof=JSON.stringify([{type:'actor',id:1},{type:'movie',id:10},{type:'actor',id:3},{type:'movie',id:10},{type:'actor',id:2}]);
 await call('start_cinegeek_game',[id,1,2]);
 await pg.query("UPDATE cinegeek_games SET status='lost',proof=$2::jsonb,started_at=now()-interval '10 minutes',submitted_at=now()-interval '9 minutes',expires_at=now()-interval '8 minutes',verification_version=1 WHERE id=$1",[id,proof]);
 expect((await call('claim_cinegeek_win',[user,id,proof,token],'service_role')).status).toBe('verifying');
 await expect(call('claim_cinegeek_win',[user,id,proof,randomUUID()],'service_role')).rejects.toThrow('Checking');
 expect(await call('finish_cinegeek_win',[user,id,token,true],'service_role')).toEqual({won:true,xp:75});
 expect((await call('claim_cinegeek_win',[user,id,proof,randomUUID()],'service_role')).status).toBe('won');
 expect(await call('finish_cinegeek_win',[user,id,token,true],'service_role')).toEqual({won:true,xp:75});
 expect((await access()).xp).toBe(75);
 await expect(call('claim_cinegeek_win',[user,id,'[1,2,3]',randomUUID()],'service_role')).rejects.toThrow('cannot change');
});
it.each(['late','missing','current'])('does not reopen a %s rejection',async scenario=>{
 const id=randomUUID(),proof='[1,2,3]';await call('start_cinegeek_game',[id,1,2]);
 await pg.query("UPDATE cinegeek_games SET status='lost',proof=$2::jsonb,submitted_at=CASE WHEN $3='missing' THEN NULL WHEN $3='late' THEN expires_at+interval '1 second' ELSE now() END,verification_version=CASE WHEN $3='current' THEN 2 ELSE 1 END WHERE id=$1",[id,proof,scenario]);
 expect((await call('claim_cinegeek_win',[user,id,proof,randomUUID()],'service_role')).status).toBe('lost');
 expect((await access()).xp).toBe(0);
});
