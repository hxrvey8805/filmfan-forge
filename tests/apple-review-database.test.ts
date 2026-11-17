import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import type {VerifiedSandboxPurchase} from '../supabase/functions/_shared/apple-purchase-verification';

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
  await pg.exec(readFileSync(new URL('../supabase/release/apple-review.sql',import.meta.url),'utf8'));
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM apple_review_policy')).rows[0].enabled).toBe(false);
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM companion_usage_policy')).rows[0].enabled).toBe(false);
  // EXCLUSIVELY inside this disposable PostgreSQL fixture. Never configure a
  // real policy, grant a real plan, call a provider or alter the beta cap.
  await pg.exec(`UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000;
    UPDATE apple_production_policy SET enabled=true; UPDATE apple_review_policy SET enabled=true,sales_enabled=true;
    UPDATE companion_sol_budget SET limit_micro_usd=5000000;`);
});
afterAll(()=>pg.close());
beforeEach(async()=>{user=randomUUID();now=Date.now()-5000;await enrol(user);});
async function enrol(id:string){await pg.query('INSERT INTO auth.users VALUES($1)',[id]);await pg.query("INSERT INTO apple_review_testers(user_id,expires_at) VALUES($1,now()+interval '7 days')",[id]);}
async function call<T=Record<string,unknown>>(name:string,args:unknown[]=[],role='service_role',owner=user){return pg.transaction(async tx=>{
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.exec(`SET LOCAL ROLE ${role}`);
  return (await tx.query<{result:T}>(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
});}
function receipt(overrides:Partial<VerifiedSandboxPurchase['transaction']>={},status:number|null=1):VerifiedSandboxPurchase {
  const id=String(++counter);return {status,active:true,verifiedAt:now,transaction:{id,originalId:id,productId:monthly,
    accountToken:user,environment:'Sandbox',purchasedAt:now-86400000,originalPurchasedAt:now-86400000,
    signedAt:now,expiresAt:now+86400000*40,revokedAt:null,upgraded:false,...overrides}};
}
const deliver=(r:VerifiedSandboxPurchase,event:string|null=null,owner=user)=>call('apple_review_deliver',[owner,JSON.stringify(r),event]);
const access=()=>call('get_cinegeek_access',[],'authenticated');
const allowance=()=>call('get_companion_allowance',[],'authenticated');
async function useIncluded(){await pg.query('INSERT INTO companion_usage_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);await pg.query(`INSERT INTO companion_question_requests(id,user_id,scope,source,period_start,period_end,status,attempt,lease_until,budget_month)
  SELECT $1,$2,'{}','monthly',w.period_start,w.period_end,'charged',$3,now(),CURRENT_DATE FROM active_companion_entitlement($2) e,
  LATERAL companion_month_window(e.anchor,now()) w`,[randomUUID(),user,randomUUID()]);}

it.each(['monthly','annual'])('grants verified Sandbox %s only in review storage',async plan=>{
  await deliver(receipt({productId:plan==='annual'?annual:monthly}));
  expect(await access()).toMatchObject({plan,smartLists:true,allSkins:plan==='annual',purchasesEnabled:false});
  expect(await allowance()).toMatchObject({plan,included:15,limit:15});
  expect((await pg.query('SELECT * FROM companion_pro_entitlements WHERE user_id=$1',[user])).rows).toHaveLength(0);
  expect(await call('get_apple_purchase_configuration',[],'authenticated')).toMatchObject({environment:'Production',salesEnabled:false});
  expect(await call('get_apple_review_configuration',[],'authenticated')).toEqual({environment:'Sandbox',salesEnabled:true,restoreEnabled:true});
});
it('enrollment alone grants no Pro access or questions',async()=>{
  expect(await access()).toMatchObject({plan:'free',smartLists:false});
  expect(await allowance()).toMatchObject({included:0});
});
it('rejects un-enrolled users and exposes no test purchase controls',async()=>{
  await pg.query('DELETE FROM apple_review_testers WHERE user_id=$1',[user]);
  await expect(deliver(receipt())).rejects.toThrow('disabled');
  expect(await call('get_apple_review_configuration',[],'authenticated')).toMatchObject({salesEnabled:false,restoreEnabled:false});
});
it.each(['Production','Xcode'])('never accepts %s into the Sandbox ledger',async environment=>{
  await expect(deliver(receipt({environment}))).rejects.toThrow('Invalid');
  expect((await access()).plan).toBe('free');
});
it('never accepts Sandbox into the Production ledger',async()=>{
  await expect(call('apple_production_deliver',[user,JSON.stringify(receipt()),null])).rejects.toThrow('Invalid');
});
it('prevents Sandbox receipts affecting a paid subscriber',async()=>{
  await call('apple_production_deliver',[user,JSON.stringify(receipt({environment:'Production',productId:annual})),null]);
  await expect(deliver(receipt())).rejects.toThrow('disabled');
  expect((await access()).plan).toBe('annual');
});
it('cannot modify an existing private beta account',async()=>{
  await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '7 days',false,'fixture')",[user]);
  await expect(deliver(receipt({productId:annual}))).rejects.toThrow('disabled');
  expect((await access()).plan).toBe('monthly');
});
it('withdraws review access when enrollment expires without touching paid access',async()=>{
  await deliver(receipt());
  await pg.query("UPDATE apple_review_testers SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=$1",[user]);
  expect(await access()).toMatchObject({plan:'free'});
  expect(await allowance()).toMatchObject({included:0});
  await expect(deliver(receipt())).rejects.toThrow('disabled');
});
it('restores and upgrades without resetting spent included questions',async()=>{
  const r=receipt();await deliver(r);await useIncluded();await deliver(r);
  await deliver({...r,verifiedAt:now+2,transaction:{...r.transaction,id:String(++counter),productId:annual,purchasedAt:now-100,signedAt:now+2}});
  expect(await allowance()).toMatchObject({plan:'annual',included:14});
});
it('a delayed snapshot cannot reverse a refund',async()=>{
  const r=receipt();await deliver(r);await deliver({...r,status:5,verifiedAt:now+10,transaction:{...r.transaction,signedAt:now+10,revokedAt:now}});
  await deliver(r);expect(await access()).toMatchObject({plan:'free'});
});
it('does not transfer purchases across accounts or after account deletion',async()=>{
  const r=receipt();await deliver(r);const other=randomUUID();await enrol(other);
  await expect(deliver({...r,transaction:{...r.transaction,accountToken:other}},null,other)).rejects.toThrow('another account');
  await pg.query('DELETE FROM auth.users WHERE id=$1',[user]);
  await expect(deliver({...r,transaction:{...r.transaction,accountToken:other}},null,other)).rejects.toThrow('another account');
});
it.each(['anon','authenticated','service_role'])('keeps enrollment, policy and direct grants private for %s',async role=>{
  for(const sql of ['UPDATE apple_review_policy SET enabled=true',"INSERT INTO apple_review_testers(user_id,expires_at) VALUES('00000000-0000-4000-8000-000000000001',now()+interval '1 day')",'SELECT * FROM apple_review_transactions','UPDATE apple_review_entitlements SET revoked=false']) {
    await expect(pg.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec(sql);})).rejects.toThrow('permission');
  }
});
it('disables review without changing production policy or spending caps',async()=>{
  const before=(await pg.query('SELECT * FROM companion_usage_policy')).rows;
  await pg.exec('UPDATE apple_review_policy SET enabled=false,sales_enabled=false');
  try {await expect(deliver(receipt())).rejects.toThrow('disabled');}
  finally {await pg.exec('UPDATE apple_review_policy SET enabled=true,sales_enabled=true');}
  expect((await pg.query('SELECT * FROM companion_usage_policy')).rows).toEqual(before);
  expect((await pg.query('SELECT sales_enabled FROM apple_production_policy')).rows[0]).toEqual({sales_enabled:false});
});
