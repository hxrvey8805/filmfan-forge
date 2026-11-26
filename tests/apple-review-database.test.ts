import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import type {VerifiedSandboxPurchase} from '../supabase/functions/_shared/apple-purchase-verification';
import {readProAccess,canWear} from '../src/lib/pro-access';

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
  await pg.exec(migration('20261122120000_private_test_plan_grants'));
  for(const name of ['20261125120000_companion_work_checkpoints','20261126160000_companion_diagnostics','20261126180000_private_companion_test_budget','20261126220000_ten_question_subscription_budget'])await pg.exec(migration(name));
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM apple_review_policy')).rows[0].enabled).toBe(false);
  expect((await pg.query<{enabled:boolean}>('SELECT enabled FROM companion_usage_policy')).rows[0].enabled).toBe(false);
  // EXCLUSIVELY inside this disposable PostgreSQL fixture. Never configure a
  // real policy, grant a real plan, call a provider or alter the beta cap.
  await pg.exec(`UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,user_month_limit_micro_usd=4000000;
    UPDATE apple_production_policy SET enabled=true; UPDATE apple_review_policy SET enabled=true,sales_enabled=true;
    UPDATE companion_sol_budget SET limit_micro_usd=5000000;`);
});
afterAll(()=>pg.close());
beforeEach(async()=>{user=randomUUID();now=Date.now()-5000;await enrol(user);});
it('reads the public-release preflight without changing policies or caps',async()=>{
  const before=(await pg.query('SELECT to_jsonb(p) AS policy FROM companion_usage_policy p')).rows;
  const results=await pg.exec(readFileSync(new URL('../supabase/release/public-release-preflight.sql',import.meta.url),'utf8'));
  const record=results.flatMap(r=>r.rows).find(r=>'release_configuration' in r)?.release_configuration;
  expect(record).toMatchObject({production_verification_enabled:true,production_sales_enabled:false,
    review_verification_enabled:true,review_sales_enabled:true,
    question_policy:{question_limit_micro_usd:350000,user_month_limit_micro_usd:4000000},
    global_ai_budget:{limit_micro_usd:5000000}});
  expect((await pg.query('SELECT to_jsonb(p) AS policy FROM companion_usage_policy p')).rows).toEqual(before);
});
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
async function recordIncluded(){await pg.query('INSERT INTO companion_usage_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);await pg.query(`INSERT INTO companion_question_requests(id,user_id,scope,source,period_start,period_end,status,attempt,lease_until,budget_month)
  SELECT $1,$2,'{}','monthly',w.period_start,w.period_end,'charged',$3,now(),CURRENT_DATE FROM active_companion_entitlement($2) e,
  LATERAL companion_month_window(e.anchor,now()) w`,[randomUUID(),user,randomUUID()]);}

it.each(['monthly','annual'])('grants verified Sandbox %s only in review storage',async plan=>{
  await deliver(receipt({productId:plan==='annual'?annual:monthly}));
  expect(await access()).toMatchObject({plan,smartLists:true,allSkins:plan==='annual',purchasesEnabled:false});
  expect(await allowance()).toMatchObject({plan,included:10,limit:10});
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
  const r=receipt();await deliver(r);await recordIncluded();await deliver(r);
  await deliver({...r,verifiedAt:now+2,transaction:{...r.transaction,id:String(++counter),productId:annual,purchasedAt:now-100,signedAt:now+2}});
  expect(await allowance()).toMatchObject({plan:'annual',included:9});
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

async function privateTestPlan(plan='monthly') {
  await pg.query(`INSERT INTO cinegeek_private_test_grants(user_id,plan,starts_at,reason)
    VALUES($1,$2,now()-interval '1 day','Disposable fixture only')
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan`,[user,plan]);
}
it.each(['monthly','annual'])('keeps private %s access without expiry, a purchase or added allowance',async plan=>{
  const policyBefore=(await pg.query('SELECT * FROM companion_usage_policy')).rows;
  const budgetBefore=(await pg.query('SELECT * FROM companion_sol_budget')).rows;
  await privateTestPlan(plan);
  const a=readProAccess(await access());
  expect(a).toMatchObject({plan,expiresAt:null,purchasesEnabled:false,smartLists:true,gamesRemaining:null});
  expect(canWear(a,'jedi')).toBe(plan==='annual');
  expect(await allowance()).toMatchObject({plan,included:10,limit:10});
  expect(Number.isFinite(Date.parse(String((await allowance()).renewsAt)))).toBe(true);
  expect((await pg.query('SELECT * FROM companion_pro_entitlements WHERE user_id=$1',[user])).rows).toHaveLength(0);
  expect((await pg.query('SELECT * FROM apple_review_entitlements WHERE user_id=$1',[user])).rows).toHaveLength(0);
  expect((await pg.query('SELECT * FROM companion_usage_policy')).rows).toEqual(policyBefore);
  expect((await pg.query('SELECT * FROM companion_sol_budget')).rows).toEqual(budgetBefore);
  expect((await pg.query('SELECT sales_enabled FROM apple_production_policy')).rows[0]).toEqual({sales_enabled:false});
});
it('keeps the private plan when Sandbox receipts expire or are revoked',async()=>{
  const r=receipt({productId:annual});await deliver(r);await privateTestPlan('monthly');
  expect(await access()).toMatchObject({plan:'monthly'});
  await deliver({...r,status:5,verifiedAt:now+10,transaction:{...r.transaction,signedAt:now+10,revokedAt:now}});
  await pg.query("UPDATE apple_review_testers SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=$1",[user]);
  expect(await access()).toMatchObject({plan:'monthly',expiresAt:null});
  expect((await pg.query('SELECT * FROM active_companion_entitlement($1)',[user])).rows).toHaveLength(1);
  await pg.query('UPDATE cinegeek_private_test_grants SET revoked=true WHERE user_id=$1',[user]);
  expect(await access()).toMatchObject({plan:'free'});
});
it('preserves a private grant anchor and spent questions across plan changes and repeated reads',async()=>{
  await privateTestPlan();await recordIncluded();
  const anchor=(await pg.query('SELECT starts_at FROM cinegeek_private_test_grants WHERE user_id=$1',[user])).rows;
  await privateTestPlan('annual');
  expect((await pg.query('SELECT starts_at FROM cinegeek_private_test_grants WHERE user_id=$1',[user])).rows).toEqual(anchor);
  expect(await allowance()).toMatchObject({plan:'annual',included:9,limit:10});
  expect(await access()).toMatchObject({plan:'annual'});
  expect(await allowance()).toMatchObject({included:9});
});
it('reserves, retries and releases questions for a permanent grant without bypassing revocation',async()=>{
  await privateTestPlan('annual');
  const request=randomUUID(),attempt=randomUUID();
  expect(await call('begin_companion_question',[user,request,attempt,{}])).toMatchObject({mode:'monthly',source:'monthly'});
  expect(await allowance()).toMatchObject({included:9});
  await call('end_companion_question_attempt',[user,request,attempt,true]);
  const retry=randomUUID();
  expect(await call('begin_companion_question',[user,request,retry,{}])).toMatchObject({mode:'monthly',source:'monthly'});
  expect(await allowance()).toMatchObject({included:9});
  await call('end_companion_question_attempt',[user,request,retry,true]);
  await pg.query('UPDATE cinegeek_private_test_grants SET revoked=true WHERE user_id=$1',[user]);
  expect(await call('begin_companion_question',[user,request,randomUUID(),{}])).toMatchObject({error:'questions_exhausted'});
  expect((await pg.query('SELECT status FROM companion_question_requests WHERE id=$1',[request])).rows[0].status).toBe('released');
});
it('still prevents an ordinary refunded purchase from resurrecting the legacy private Monthly grant',async()=>{
  await pg.query("INSERT INTO cinegeek_private_monthly_grants VALUES($1,now()-interval '1 day',now()+interval '1 month',false,'Legacy fixture')",[user]);
  await pg.query(`INSERT INTO companion_pro_entitlements(user_id,plan,anchor,valid_until,verified_transaction_id)
    VALUES($1,'annual',now()-interval '1 day',now()+interval '1 year','ordinary-test-receipt')`,[user]);
  expect(await access()).toMatchObject({plan:'annual'});
  await pg.query('UPDATE companion_pro_entitlements SET revoked=true WHERE user_id=$1',[user]);
  expect(await access()).toMatchObject({plan:'free'});
});
it('honours optional test expiry and cleans up grants with account deletion',async()=>{
  await privateTestPlan();
  await pg.query("UPDATE cinegeek_private_test_grants SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=$1",[user]);
  expect(await access()).toMatchObject({plan:'free'});
  await pg.query('DELETE FROM auth.users WHERE id=$1',[user]);
  expect((await pg.query('SELECT * FROM cinegeek_private_test_grants WHERE user_id=$1',[user])).rows).toHaveLength(0);
});
it.each(['anon','authenticated','service_role'])('prevents %s from reading or assigning private test plans',async role=>{
  await privateTestPlan();
  for(const sql of ['SELECT * FROM cinegeek_private_test_grants',
    "UPDATE cinegeek_private_test_grants SET plan='annual'",'DELETE FROM cinegeek_private_test_grants',
    `INSERT INTO cinegeek_private_test_grants(user_id,plan,starts_at,reason) VALUES('${user}','annual',now(),'Self grant')`,
    `SELECT * FROM active_companion_entitlement('${user}')`]) {
    await expect(pg.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec(sql);})).rejects.toThrow('permission');
  }
});

// Accounting-only tests: real SQL/RPCs, synthetic receipts and numerical bills.
// No provider traffic, captions, Apple purchases or real funds.
describe('ten-question subscription budget',()=>{
  beforeEach(async()=>{
    await pg.exec(`UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=350000,
      user_month_limit_micro_usd=4000000,user_day_limit_micro_usd=NULL,question_call_limit=64,
      subscription_budget_started_at=now()-interval '2 years';
      UPDATE companion_sol_budget SET enabled=true,committed_micro_usd=0,halted_reason=NULL;`);
  });
  const window=async()=> (await pg.query<{period_start:Date;period_end:Date}>(
    'SELECT * FROM companion_account_spending_window($1)',[user])).rows[0];
  const begin=async()=>{
    const id=randomUUID(),attempt=randomUUID();
    const result=await call('begin_companion_question',[user,id,attempt,{}]);
    return {id,attempt,result};
  };
  const reserve=(q:Awaited<ReturnType<typeof begin>>,amount:number,parallel=false)=>
    call(parallel?'try_reserve_companion_question_call':'reserve_companion_question_call',[randomUUID(),user,q.id,q.attempt,amount]);
  const seed=async(amount:number,time:string|Date=new Date(),status='settled')=>{
    await pg.query(`INSERT INTO companion_sol_calls(id,user_id,request_id,reserved_micro_usd,actual_micro_usd,status,created_at)
      VALUES($1,$2,$3,$4::bigint,CASE WHEN $5='settled' THEN $4::bigint ELSE NULL END,$5,$6)`,
      [randomUUID(),user,randomUUID(),amount,status,time]);
  };
  it.each(['monthly','annual'])('enforces exactly ten questions and the four-dollar cap for %s',async plan=>{
    await deliver(receipt({productId:plan==='annual'?annual:monthly}));
    expect(await allowance()).toMatchObject({included:10,limit:10});
    for(let n=0;n<10;n++)await recordIncluded();
    expect((await begin()).result).toMatchObject({error:'questions_exhausted'});
    expect(await allowance()).toMatchObject({included:0,limit:10});
    expect((await pg.query('SELECT user_month_limit_micro_usd FROM companion_usage_policy')).rows[0].user_month_limit_micro_usd).toBe(4000000);
  });
  it('clamps an existing account that already used more than ten without erasing its history',async()=>{
    await deliver(receipt());for(let n=0;n<13;n++)await recordIncluded();
    expect(await allowance()).toMatchObject({included:0,limit:10});
    expect((await pg.query('SELECT count(*)::int n FROM companion_question_requests WHERE user_id=$1',[user])).rows[0].n).toBe(13);
  });
  it.each([false,true])('admits the final micro-dollar and refuses overspending (parallel %s)',async parallel=>{
    await deliver(receipt());await seed(3999999);const q=await begin();
    expect(await reserve(q,1,parallel)).toBe(parallel?'reserved':true);
    // A pending own reservation may produce wait; settle it before testing hard denial.
    await pg.query("UPDATE companion_sol_calls SET status='settled',actual_micro_usd=reserved_micro_usd WHERE user_id=$1",[user]);
    expect(await reserve(q,1,parallel)).toBe(parallel?'denied':false);
    await call('end_companion_question_attempt',[user,q.id,q.attempt,false]);
    expect(await allowance()).toMatchObject({included:10});
  });
  it('fits ten worst-case $0.35 answers plus $0.50 of failed work inside $4',async()=>{
    await deliver(receipt());await seed(500000);
    for(let n=0;n<10;n++){
      const q=await begin();expect(await reserve(q,350000)).toBe(true);
      await pg.query("UPDATE companion_sol_calls SET status='settled',actual_micro_usd=reserved_micro_usd WHERE user_id=$1",[user]);
      await call('end_companion_question_attempt',[user,q.id,q.attempt,false]);await recordIncluded();
    }
    expect(await allowance()).toMatchObject({included:0});
    expect((await pg.query('SELECT sum(coalesce(actual_micro_usd,reserved_micro_usd))::bigint total FROM companion_sol_calls WHERE user_id=$1',[user])).rows[0].total).toBe(4000000);
  });
  it.each(['reserved','unknown'])('counts %s costs at their full reservation',async status=>{
    await deliver(receipt());await seed(4000000,new Date(),status);
    expect(await reserve(await begin(),1)).toBe(false);
    expect((await pg.query('SELECT actual_micro_usd FROM companion_sol_calls WHERE user_id=$1',[user])).rows[0].actual_micro_usd).toBeNull();
  });
  it('keeps the original $0.35 question cap and $5 global cap',async()=>{
    await deliver(receipt());const q=await begin();expect(await reserve(q,350001)).toBe(false);
    await call('end_companion_question_attempt',[user,q.id,q.attempt,false]);
    await pg.exec('UPDATE companion_sol_budget SET committed_micro_usd=5000000');
    expect(await reserve(await begin(),1)).toBe(false);
    expect((await pg.query('SELECT limit_micro_usd FROM companion_sol_budget')).rows[0].limit_micro_usd).toBe(5000000);
  });
  it('uses the same anniversary as the question allowance for Monthly and Annual',async()=>{
    const r=receipt();await pg.query("UPDATE apple_review_testers SET expires_at=starts_at+interval '30 days' WHERE user_id=$1",[user]);await deliver(r);const first=await window();
    expect(first.period_end.toISOString()).toBe(new Date((await allowance()).renewsAt as string).toISOString());
    await recordIncluded();await deliver({...r,verifiedAt:now+1,transaction:{...r.transaction,id:String(++counter),productId:annual,signedAt:now+1}});
    expect(await window()).toEqual(first);expect(await allowance()).toMatchObject({included:9});
  });
  it('counts costs on the anniversary boundary, not the calendar boundary',async()=>{
    await deliver(receipt());const w=await window();
    await seed(4000000,new Date(w.period_start.getTime()-1));
    const q=await begin();expect(await reserve(q,1)).toBe(true);
    await call('end_companion_question_attempt',[user,q.id,q.attempt,false]);
    await seed(4000000,w.period_start);expect(await reserve(await begin(),1)).toBe(false);
  });
  it('counts earlier calendar-month costs during the first migrated period',async()=>{
    await deliver(receipt());const original=await window();
    await pg.exec('UPDATE companion_usage_policy SET subscription_budget_started_at=now()');
    const cutover=await window();expect(cutover.period_start.getTime()).toBeLessThanOrEqual(original.period_start.getTime());
    await seed(4000000,cutover.period_start);expect(await reserve(await begin(),1)).toBe(false);
  });
  it('does not lose daily costs when the subscription period begins partway through today',async()=>{
    const anchor=now-1000;
    await deliver(receipt({originalPurchasedAt:anchor,purchasedAt:anchor}));
    await pg.exec('UPDATE companion_usage_policy SET user_day_limit_micro_usd=350000');
    await seed(350000,new Date(anchor-1000));
    expect(await reserve(await begin(),1)).toBe(false);
  });
  it('preserves the former $3+$2 test ceiling when the base becomes $4',async()=>{
    await deliver(receipt());const q=await begin();
    await pg.query(`INSERT INTO companion_private_test_budget_grants(user_id,month_start,additional_micro_usd,starts_at,expires_at,reason)
      VALUES($1,date_trunc('month',now() AT TIME ZONE 'UTC')::date,2000000,now(),now()+interval '1 hour','fixture')`,[user]);
    expect((await pg.query('SELECT companion_account_spending_limit($1,4000000) n',[user])).rows[0].n).toBe(5000000);
    await seed(5000000);expect(await reserve(q,1)).toBe(false);
    await pg.query('UPDATE companion_private_test_budget_grants SET revoked=true WHERE user_id=$1',[user]);
    expect((await pg.query('SELECT companion_account_spending_limit($1,4000000) n',[user])).rows[0].n).toBe(4000000);
  });
  it.each([false,true])('stops a worker after its subscription expires (parallel %s)',async parallel=>{
    const r=receipt();await deliver(r);const q=await begin();
    await deliver({...r,status:5,verifiedAt:now+10,transaction:{...r.transaction,signedAt:now+10,revokedAt:now}});
    expect(await reserve(q,1,parallel)).toBe(parallel?'denied':false);
    expect(await allowance()).toMatchObject({plan:'free',included:0});
  });
  it.each(['anon','authenticated','service_role'])('prevents %s editing or reading private budget controls',async role=>{
    for(const sql of ['UPDATE companion_usage_policy SET user_month_limit_micro_usd=5000000',
      'UPDATE companion_private_test_budget_grants SET approved_base_micro_usd=5000000',
      `SELECT companion_account_spending_window('${user}')`,
      `SELECT companion_account_spending_limit('${user}',5000000)`])
      await expect(pg.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec(sql);})).rejects.toThrow(/permission/);
  });
});
