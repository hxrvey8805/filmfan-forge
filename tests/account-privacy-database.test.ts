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
  await pg.exec(migration('20251029164936_a2d53dd6-a1fb-4f87-9cfb-8a492bf2fa6b'));
  await pg.exec(migration('20261117160000_account_privacy'));
  await pg.exec(readFileSync(new URL('../docs/operations/account-privacy-postflight.sql',import.meta.url),'utf8'));
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM apple_review_policy')).rows[0].enabled).toBe(false);
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM companion_usage_policy')).rows[0].enabled).toBe(false);
  // EXCLUSIVELY inside this disposable PostgreSQL fixture. Never configure a
  // real policy, grant a real plan, call a provider or alter the beta cap.
  await pg.exec(`UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000;
    UPDATE apple_production_policy SET enabled=true; UPDATE apple_review_policy SET enabled=true,sales_enabled=true;
    UPDATE companion_sol_budget SET limit_micro_usd=5000000;`);
});
afterAll(()=>pg.close());
beforeEach(async()=>{user=randomUUID();now=Date.now()-5000;await pg.query('INSERT INTO auth.users VALUES($1)',[user]);await pg.query("INSERT INTO apple_review_testers(user_id,expires_at) VALUES($1,now()+interval '7 days')",[user]);});
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


it('starts with no permission and separates purpose, version and account',async()=>{
 expect(await call('get_ai_privacy_choices',[],'authenticated')).toEqual({});
 expect(await call('cinegeek_ai_allowed',[user,'companion','2026-11-17'])).toBe(false);
 expect(await call('set_ai_privacy_choice',['companion',true,'2026-11-17'],'authenticated')).toEqual({companion:true});
 expect(await call('cinegeek_ai_allowed',[user,'companion','2026-11-17'])).toBe(true);
 expect(await call('cinegeek_ai_allowed',[user,'smart_lists','2026-11-17'])).toBe(false);
 expect(await call('cinegeek_ai_allowed',[user,'companion','old-version'])).toBe(false);
 expect(await call('get_ai_privacy_choices',[],'authenticated',randomUUID())).toEqual({});
 await call('set_ai_privacy_choice',['companion',false,'2026-11-17'],'authenticated');
 expect(await call('cinegeek_ai_allowed',[user,'companion','2026-11-17'])).toBe(false);
 await expect(call('set_ai_privacy_choice',['companion',true,'other-version'],'authenticated')).rejects.toThrow('Invalid');
});
it.each(['anon','authenticated'])('keeps deletion readiness and service checks private from %s',async role=>{
 await expect(call('cinegeek_account_privacy_ready',[],role)).rejects.toThrow('permission denied');
 await expect(call('cinegeek_ai_allowed',[user,'companion','2026-11-17'],role)).rejects.toThrow('permission denied');
});
it('erases the account records, blocks late writes and keeps actual AI spending and other users',async()=>{
 const other=randomUUID();await pg.query('INSERT INTO auth.users VALUES($1)',[other]);
 for(const id of [user,other]){
  await pg.query('INSERT INTO user_stats(user_id) VALUES($1)',[id]);
  await pg.query('INSERT INTO cinegeek_xp(user_id) VALUES($1)',[id]);
  await pg.query("INSERT INTO user_titles(user_id,title_id,title,type,list_type,poster_path) VALUES($1,1,'A film','movie','watchlist','')",[id]);
  await pg.query("INSERT INTO ai_conversations(user_id,title_id,media_type,question,answer,context) VALUES($1,1,'movie','Private question','Private answer','Private context')",[id]);
  await call('set_ai_privacy_choice',['companion',true,'2026-11-17'],'authenticated',id);
 }
 const r=receipt();await deliver(r);await useIncluded();
 await pg.query('UPDATE companion_sol_budget SET committed_micro_usd=123456');
 const before=(await pg.query('SELECT * FROM companion_sol_budget')).rows;
 await pg.query('DELETE FROM auth.users WHERE id=$1',[user]);
 for(const t of ['user_stats','cinegeek_xp','user_titles','ai_conversations','cinegeek_ai_permissions','companion_usage_accounts','companion_question_requests','apple_review_entitlements','apple_review_testers'])expect((await pg.query(`SELECT * FROM ${t} WHERE user_id=$1`,[user])).rows).toHaveLength(0);
 for(const t of ['user_stats','cinegeek_xp','user_titles','ai_conversations','cinegeek_ai_permissions'])expect((await pg.query(`SELECT * FROM ${t} WHERE user_id=$1`,[other])).rows).toHaveLength(1);
 expect((await pg.query('SELECT * FROM companion_sol_budget')).rows).toEqual(before);
 expect((await pg.query('SELECT * FROM apple_review_transactions WHERE original_id=$1',[r.transaction.originalId])).rows).toHaveLength(0);
 const owner=(await pg.query<{user_id:string|null;account_token:string}>('SELECT * FROM apple_review_owners WHERE original_id=$1',[r.transaction.originalId])).rows[0];
 expect(owner.user_id).toBeNull();expect(owner.account_token).not.toBe(user);
 await expect(call('set_ai_privacy_choice',['companion',true,'2026-11-17'],'authenticated')).rejects.toThrow('Sign in');
 await expect(pg.query('INSERT INTO user_stats(user_id) VALUES($1)',[user])).rejects.toThrow('foreign key');
 expect(await call('cinegeek_ai_allowed',[user,'companion','2026-11-17'])).toBe(false);
 await pg.query("INSERT INTO apple_review_testers(user_id,expires_at) VALUES($1,now()+interval '7 days')",[other]);
 await expect(deliver({...r,transaction:{...r.transaction,accountToken:other}},null,other)).rejects.toThrow('another account');
});
it('has cascade ownership for every user data table apart from intentionally retained purchase owners',async()=>{
 const missing=await pg.query(`SELECT c.table_name FROM information_schema.columns c WHERE c.table_schema='public' AND c.column_name='user_id' AND EXISTS(SELECT 1 FROM information_schema.tables t WHERE t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE')
 AND c.table_name NOT IN ('apple_production_owners','apple_review_owners') AND NOT EXISTS (
 SELECT 1 FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(k.conkey)
 WHERE t.relname=c.table_name AND k.contype='f' AND k.confdeltype='c' AND a.attname='user_id')`);
 expect(missing.rows).toEqual([]);
});
