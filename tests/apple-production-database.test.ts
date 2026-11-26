import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import type {VerifiedSandboxPurchase} from '../supabase/functions/_shared/apple-purchase-verification';
import {companionReleaseFor} from '../supabase/functions/_shared/companion-provider';
import {beginQuestionAllowance} from '../supabase/functions/_shared/question-allowance';

const pg=new PGlite({extensions:{vector}});
const migration=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const monthly='app.cinegeek.mobile.pro.monthly',annual='app.cinegeek.mobile.pro.annual',pack='app.cinegeek.mobile.test.questions5';
let user:string,now:number,counter=1000;
beforeAll(async()=>{
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  for(const name of ['20251212124452_183e3a1b-1ce7-4ad2-8dbb-70a84d83a492',
    '20251213142548_7e9c4478-2109-4f16-87b1-4f6a23b79ec3','20251220225804_a0e95db5-205f-42ba-afb7-2dd5f16412a4',
    '20251212113943_64b727ba-fc83-47eb-9a6c-12ef18c454a4','20251115180934_afff8406-1d21-440e-ba6b-35c0cc4852f5'])await pg.exec(migration(name));
  await pg.exec(migration('20251122155759_92f1d8ce-3bf2-4992-ba51-366d73fa76f8').split('-- Migration 2:')[0]);
  for(const name of ['20261013120000_companion_evidence_and_memory','20261015153000_caption_context_revision',
    '20261015195500_companion_answer_revision','20261106093000_quarantine_subtitle_editions','20261106163000_shared_cut_revision',
    '20261105170000_companion_sol_budget','20261113190000_companion_monthly_allowance',
    '20251114214139_cac7e901-0afa-4a2d-9233-df3d7be49a29','20251114215942_67f42c53-f7a7-40eb-9c4c-76f082338a1b',
    '20251126204536_add_pack_tier','20261112160000_smart_list_interpreter','20261113200000_pro_xp_collections',
    '20261114120000_companion_spending_safeguards','20261116100000_private_grant_tier_rollout'])await pg.exec(migration(name));
  await pg.exec(readFileSync(new URL('../supabase/release/apple-production.sql',import.meta.url),'utf8'));
  for(const name of ['20261125120000_companion_work_checkpoints','20261126160000_companion_diagnostics','20261126180000_private_companion_test_budget','20261126220000_ten_question_subscription_budget'])await pg.exec(migration(name));
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM apple_production_policy')).rows[0].enabled).toBe(false);
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM companion_usage_policy')).rows[0].enabled).toBe(false);
  // EXCLUSIVELY inside this disposable PostgreSQL fixture. Never configure a
  // real policy, grant a real plan, call a provider or alter the beta cap.
  await pg.exec(`UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=4000000;
    UPDATE apple_production_policy SET enabled=true;
    UPDATE companion_sol_budget SET limit_micro_usd=5000000;`);
});
afterAll(()=>pg.close());
beforeEach(async()=>{user=randomUUID();now=Date.now()-5000;await enrol(user);});
async function enrol(id:string){await pg.query('INSERT INTO auth.users VALUES($1)',[id]);}
async function call<T=Record<string,unknown>>(name:string,args:unknown[]=[],role='service_role',owner=user){return pg.transaction(async tx=>{
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.exec(`SET LOCAL ROLE ${role}`);
  return (await tx.query<{result:T}>(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
});}
function receipt(overrides:Partial<VerifiedSandboxPurchase['transaction']>={},status:number|null=1):VerifiedSandboxPurchase {
  const id=String(++counter);return {status,active:true,verifiedAt:now,transaction:{id,originalId:id,productId:monthly,
    accountToken:user,environment:'Production',purchasedAt:now-86400000,originalPurchasedAt:now-86400000,
    signedAt:now,expiresAt:now+86400000*40,revokedAt:null,upgraded:false,...overrides}};
}
const deliver=(r:VerifiedSandboxPurchase,event:string|null=null,owner=user)=>call('apple_production_deliver',[owner,JSON.stringify(r),event]);
const access=()=>call('get_cinegeek_access',[],'authenticated');
const allowance=()=>call('get_companion_allowance',[],'authenticated');
async function useIncluded(){await pg.query('INSERT INTO companion_usage_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);await pg.query(`INSERT INTO companion_question_requests(id,user_id,scope,source,period_start,period_end,status,attempt,lease_until,budget_month)
  SELECT $1,$2,'{}','monthly',w.period_start,w.period_end,'charged',$3,now(),CURRENT_DATE FROM active_companion_entitlement($2) e,
  LATERAL companion_month_window(e.anchor,now()) w`,[randomUUID(),user,randomUUID()]);}

it.each(['free','monthly','annual'])('connects %s to live access and allowance RPCs without enabling sales',async plan=>{
  if(plan!=='free')await deliver(receipt({productId:plan==='annual'?annual:monthly}));
  expect(await access()).toMatchObject({plan,purchasesEnabled:false,smartLists:plan!=='free',allSkins:plan==='annual'});
  expect(await allowance()).toMatchObject({plan,included:plan==='free'?0:10,purchased:0});
  expect(await call('get_apple_purchase_configuration',[],'authenticated')).toEqual({environment:'Production',salesEnabled:false,restoreEnabled:true});
});
it.each(['free','monthly','annual'])('keeps the public companion entitlement gate for a new %s account',async plan=>{
  if(plan!=='free')await deliver(receipt({productId:plan==='annual'?annual:monthly}));
  const release=companionReleaseFor({app_metadata:{}},name=>({
    COMPANION_AI_PROVIDER:'openrouter-sol',COMPANION_PUBLIC_RELEASE_ENABLED:'true',
  }[name]));
  expect(release.answerOptions.captionDiscussion).toBe(true);
  const before=(await pg.query('SELECT * FROM companion_sol_budget')).rows;
  const request=randomUUID();
  const gate=beginQuestionAllowance(async(name,args)=>{
    try{return {data:await call(name,Object.values(args??{})),error:null};}
    catch(error){return {data:null,error};}
  },user,request,{question:'Explain this scene',title_id:1396,media_type:'tv',
    season_number:1,episode_number:2,position_seconds:1200,companion_version:'fixture'},
    'openrouter-sol',release.answerOptions.captionDiscussion);
  if(plan==='free')await expect(gate).rejects.toMatchObject({code:'questions_exhausted'});
  else {const allowed=await gate;expect(allowed.active).toBe(true);await allowed.end(false);}
  expect((await allowance()).included).toBe(plan==='free'?0:10);
  expect((await pg.query('SELECT * FROM companion_sol_budget')).rows).toEqual(before);
  expect(await call('get_apple_purchase_configuration',[],'authenticated')).toEqual({
    environment:'Production',salesEnabled:false,restoreEnabled:true,
  });
});
it('blocks receipt delivery while verification is off',async()=>{
  await pg.exec('UPDATE apple_production_policy SET enabled=false');
  try { await expect(deliver(receipt())).rejects.toThrow('disabled'); }
  finally {await pg.exec('UPDATE apple_production_policy SET enabled=true');}
});
it.each(['Sandbox','Xcode'])('rejects %s receipts even with a matching user and product',async environment=>{
  const r=receipt();Object.assign(r.transaction,{environment});await expect(deliver(r)).rejects.toThrow('Invalid');
  expect((await access()).plan).toBe('free');
});
it('rejects the unapproved test question pack',async()=>{
  await expect(deliver(receipt({productId:pack,expiresAt:null},null))).rejects.toThrow('Invalid');
  expect((await allowance()).purchased).toBe(0);
});
it.each(['anon','authenticated'])('denies %s all server delivery and recovery RPCs',async role=>{
  await expect(call('apple_production_deliver',[user,JSON.stringify(receipt()),null],role)).rejects.toThrow('permission');
  await expect(call('apple_production_claim_recovery',[],role)).rejects.toThrow('permission');
});
it('prevents the verifier role from changing policy, direct entitlements or balances',async()=>{
  for(const sql of ['UPDATE apple_production_policy SET sales_enabled=true',
    "UPDATE companion_pro_entitlements SET revoked=false",'SELECT * FROM apple_production_transactions',
    'UPDATE apple_production_recovery SET cursor=\'999\'']) {
    await expect(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.exec(sql);})).rejects.toThrow('permission');
  }
  await expect(call('grant_companion_question_pack',[user,'bypass',100])).rejects.toThrow('permission');
});
it('restores and upgrades without resetting the monthly allowance',async()=>{
  const r=receipt();await deliver(r);await useIncluded();await deliver(r);
  await deliver({...r,verifiedAt:now+2,transaction:{...r.transaction,id:String(++counter),productId:annual,purchasedAt:now-100,signedAt:now+2,expiresAt:now+86400000*365}});
  expect(await allowance()).toMatchObject({plan:'annual',included:9,limit:10});
});
it('preserves used private-beta questions when the account first subscribes',async()=>{
  const anchor=now-86400000*3;
  await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,to_timestamp($2/1000.0),now()+interval '30 days',false,'fixture')",[user,anchor]);
  await useIncluded();await deliver(receipt());expect(await allowance()).toMatchObject({plan:'monthly',included:9});
  const e=(await pg.query<{anchor:Date}>('SELECT anchor FROM companion_pro_entitlements WHERE user_id=$1',[user])).rows[0];
  expect(e.anchor.toISOString()).toBe(new Date(anchor).toISOString());
});
it('does not resurrect the private grant after a paid refund',async()=>{
  await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '30 days',false,'fixture')",[user]);
  const r=receipt();await deliver(r);await deliver({...r,status:5,verifiedAt:now+10,transaction:{...r.transaction,signedAt:now+10,revokedAt:now}});
  expect(await allowance()).toMatchObject({plan:'free',included:0});
});
it.each([2,3,4,5])('returns to Free for unentitled status %s and retains owned skins',async status=>{
  const r=receipt();await deliver(r);await pg.query("INSERT INTO cinegeek_unlocks(user_id,item,kind) VALUES($1,'jedi','skin')",[user]);
  await deliver({...r,status,verifiedAt:now+10});expect(await access()).toMatchObject({plan:'free',unlockedSkins:['jedi']});
});
it('a delayed old snapshot cannot undo a refund',async()=>{
  const r=receipt();await deliver(r);await deliver({...r,status:5,verifiedAt:now+10,transaction:{...r.transaction,signedAt:now+10,revokedAt:now}});
  await deliver(r);expect((await access()).plan).toBe('free');
});
it('cannot transfer a lineage to another account',async()=>{
  const r=receipt();await deliver(r);const other=randomUUID();await enrol(other);
  await expect(deliver({...r,transaction:{...r.transaction,accountToken:other}},null,other)).rejects.toThrow('another account');
});
it('retains a purchase tombstone after account deletion',async()=>{
  const r=receipt();await deliver(r);await pg.query('DELETE FROM auth.users WHERE id=$1',[user]);
  const other=randomUUID();await enrol(other);
  await expect(deliver({...r,transaction:{...r.transaction,accountToken:other}},null,other)).rejects.toThrow('another account');
  expect((await pg.query<{user_id:string|null}>('SELECT user_id FROM apple_production_owners WHERE original_id=$1',[r.transaction.originalId])).rows[0].user_id).toBeNull();
});
it('persists renewal recovery cursor, rejects competing and expired workers',async()=>{
  await pg.exec("UPDATE apple_production_recovery SET cursor='',lease=NULL,lease_until=NULL");
  const a=await call<{lease:string;cursor:string}>('apple_production_claim_recovery');
  expect(a.cursor).toBe('');expect(await call('apple_production_claim_recovery')).toBeNull();
  expect(await call('apple_production_finish_recovery',[randomUUID(),'','100',false,true])).toBe(false);
  expect(await call('apple_production_finish_recovery',[a.lease,'','100',false,true])).toBe(true);
  const b=await call<{lease:string;cursor:string}>('apple_production_claim_recovery');expect(b.cursor).toBe('100');
  await pg.exec("UPDATE apple_production_recovery SET lease_until=now()-interval '1 second'");
  const c=await call<{lease:string;cursor:string}>('apple_production_claim_recovery');
  expect(await call('apple_production_finish_recovery',[b.lease,'100','200',false,true])).toBe(false);
  expect(await call('apple_production_finish_recovery',[c.lease,'100','200',true,true])).toBe(true);
  expect((await pg.query<{cursor:string}>('SELECT cursor FROM apple_production_recovery')).rows[0].cursor).toBe('');
});
it('leaves AI spending limits unchanged',async()=>{
  await deliver(receipt());
  expect((await pg.query('SELECT question_limit_micro_usd,user_month_limit_micro_usd FROM companion_usage_policy')).rows[0]).toEqual({question_limit_micro_usd:350000,user_month_limit_micro_usd:4000000});
  expect((await pg.query('SELECT limit_micro_usd FROM companion_sol_budget')).rows[0]).toEqual({limit_micro_usd:5000000});
});
