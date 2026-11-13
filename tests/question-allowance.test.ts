import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { beginQuestionAllowance } from '../supabase/functions/_shared/question-allowance';
import type { BudgetRpc } from '../supabase/functions/_shared/sol-budget';

const pg = new PGlite({extensions:{vector}});
const migration=(name:string)=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
let user:string;
beforeAll(async()=>{
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  for(const name of ['20251212124452_183e3a1b-1ce7-4ad2-8dbb-70a84d83a492',
    '20251213142548_7e9c4478-2109-4f16-87b1-4f6a23b79ec3','20251220225804_a0e95db5-205f-42ba-afb7-2dd5f16412a4',
    '20251212113943_64b727ba-fc83-47eb-9a6c-12ef18c454a4','20251115180934_afff8406-1d21-440e-ba6b-35c0cc4852f5']) await pg.exec(migration(name));
  await pg.exec(migration('20251122155759_92f1d8ce-3bf2-4992-ba51-366d73fa76f8').split('-- Migration 2:')[0]);
  for(const name of ['20261013120000_companion_evidence_and_memory','20261015153000_caption_context_revision',
    '20261015195500_companion_answer_revision','20261106093000_quarantine_subtitle_editions','20261106163000_shared_cut_revision',
    '20261105170000_companion_sol_budget','20261113190000_companion_monthly_allowance']) await pg.exec(migration(name));
});
afterAll(()=>pg.close());
beforeEach(async()=>{
  user=randomUUID();
  await pg.exec(`TRUNCATE companion_question_calls,companion_question_requests,companion_usage_accounts,companion_question_packs,
    companion_pro_entitlements,companion_sol_calls,ai_conversations;
    UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=500000,user_month_limit_micro_usd=2000000;
    UPDATE companion_sol_budget SET enabled=true,limit_micro_usd=5000000,committed_micro_usd=0,halted_reason=null;`);
});
const rpc:BudgetRpc=async(name,args)=>{
  try {
    const data=await pg.transaction(async tx=>{
      await tx.exec('SET LOCAL ROLE service_role');
      const keys=Object.keys(args);
      const result=await tx.query<{value:unknown}>(`SELECT ${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) AS value`,Object.values(args));
      return result.rows[0].value;
    });
    return {data,error:null};
  } catch(error){return {data:null,error};}
};
const scope={title_id:1,media_type:'tv',season_number:1,episode_number:2,position_seconds:30,question:'Why?',companion_version:3};
const answer=(id:string,s=scope)=>({...s,id,timestamp:'00:30',answer:'A verified answer.',context:'S1E2 @ 00:30',evidence:[],answer_status:'answered'});
const begin=(id=randomUUID(),s=scope)=>beginQuestionAllowance(rpc,user,id,s,'openrouter-sol');
const allowance=async()=>(await pg.query<{a:Record<string,unknown>}>('SELECT companion_allowance_for($1) a',[user])).rows[0].a;
async function pro(plan='monthly'){
  await pg.query(`INSERT INTO companion_pro_entitlements(user_id,plan,anchor,valid_until,verified_transaction_id)
    VALUES($1,$2,now()-interval '1 day',now()+interval '1 year',$3)`,[user,plan,randomUUID()]);
}
async function pack(count=5,transaction=randomUUID(),owner=user){
  const result=await rpc('grant_companion_question_pack',{p_user_id:owner,p_transaction_id:transaction,p_questions:count});
  if(result.error)throw result.error;
  return result.data;
}
async function complete(charge=true){const id=randomUUID();const gate=await begin(id);const result=await gate.finish(answer(id),charge);if(result.error)throw result.error;return result;}

describe('monthly question policy and purchased balances',()=>{
  it('stages without changing the beta cap or enabling purchases',async()=>{
    await pg.exec('UPDATE companion_usage_policy SET enabled=false,question_limit_micro_usd=0,user_month_limit_micro_usd=0');
    const id=randomUUID(),gate=await begin(id);
    expect(gate.active).toBe(false);
    expect(await gate.budget.reserve(randomUUID(),100)).toBe(true);
    expect((await gate.finish(answer(id),true)).error).toBeNull();
    expect((await pg.query('SELECT limit_micro_usd FROM companion_sol_budget')).rows[0]).toEqual({limit_micro_usd:5000000});
    await expect(pg.exec('UPDATE companion_usage_policy SET enabled=true')).rejects.toThrow();
  });
  it('gives Free zero included questions; verified packs do not grant Pro',async()=>{
    expect(await allowance()).toMatchObject({plan:'free',included:0,purchased:0,limit:0});
    await expect(begin()).rejects.toMatchObject({code:'questions_exhausted'});
    await pack(2);await complete();
    expect(await allowance()).toMatchObject({plan:'free',included:0,purchased:1});
    expect((await pg.query('SELECT count(*)::int n FROM companion_pro_entitlements')).rows[0].n).toBe(0);
  });
  it.each(['monthly','annual'])('allows exactly 15 included questions for %s',async plan=>{
    await pro(plan);
    for(let i=0;i<15;i++)await complete();
    expect(await allowance()).toMatchObject({included:0,limit:15,purchased:0});
    await expect(begin()).rejects.toMatchObject({code:'questions_exhausted'});
  });
  it('uses included questions first; pack credits persist after entitlement expiry',async()=>{
    await pro();await pack(3);await complete();
    expect(await allowance()).toMatchObject({included:14,purchased:3});
    await pg.query("UPDATE companion_pro_entitlements SET revoked=true WHERE user_id=$1",[user]);
    await complete();
    expect(await allowance()).toMatchObject({plan:'free',included:0,purchased:2});
  });
  it('does not charge errors, unanswered requests or duplicated delivery',async()=>{
    await pro();await complete(false);
    const failed=await begin();await failed.end(false);
    const id=randomUUID(),gate=await begin(id);
    await gate.finish(answer(id),true);await gate.finish(answer(id),true);
    expect(await allowance()).toMatchObject({included:14});
    expect((await pg.query('SELECT count(*)::int n FROM ai_conversations')).rows[0].n).toBe(2);
  });
  it('prevents simultaneous work and overselling the last question',async()=>{
    await pack(1);
    const results=await Promise.allSettled(Array.from({length:8},()=>begin()));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await allowance()).toMatchObject({purchased:0});
  });
  it('grants each verified purchase once and rejects another account claiming it',async()=>{
    const transaction=randomUUID();expect(await pack(5,transaction)).toBe(true);
    expect(await pack(5,transaction)).toBe(false);
    await expect(pack(5,transaction,randomUUID())).rejects.toThrow('Purchase already claimed');
    await expect(pack(50,transaction)).rejects.toThrow('Purchase already claimed');
    expect(await allowance()).toMatchObject({purchased:5});
  });
  it('handles month ends, leap years and annual monthly buckets without rollover',async()=>{
    for(const [anchor,time,start,end] of [
      ['2026-01-31T12:34:00Z','2026-02-28T12:33:59Z','2026-01-31T12:34:00Z','2026-02-28T12:34:00Z'],
      ['2026-01-31T12:34:00Z','2026-02-28T12:34:00Z','2026-02-28T12:34:00Z','2026-03-31T12:34:00Z'],
      ['2024-02-29T12:00:00Z','2025-02-28T12:00:00Z','2025-02-28T12:00:00Z','2025-03-29T12:00:00Z']]){
      const row=(await pg.query<{period_start:Date;period_end:Date}>('SELECT * FROM companion_month_window($1,$2)',[anchor,time])).rows[0];
      expect(new Date(row.period_start).toISOString()).toBe(new Date(start).toISOString());
      expect(new Date(row.period_end).toISOString()).toBe(new Date(end).toISOString());
    }
    await pro('annual');await complete();
    await pg.query("UPDATE companion_question_requests SET period_start=period_start-interval '1 month' WHERE user_id=$1",[user]);
    expect(await allowance()).toMatchObject({included:15});
  });
});

describe('request scope, retries and spending enforcement',()=>{
  it('carries spending and a single question through recap continuations',async()=>{
    await pro();const id=randomUUID(),first=await begin(id),call=randomUUID();
    expect(await first.budget.reserve(call,200000)).toBe(true);
    await first.budget.settle(call,100000,'generation',null);await first.end(true);
    const next=await begin(id);
    expect(await next.budget.reserve(randomUUID(),400001)).toBe(false);
    await expect(next.finish(answer(id),true)).rejects.toMatchObject({code:'question_budget_unavailable'});
    await next.end(false);
    expect(await allowance()).toMatchObject({included:15});
    expect((await pg.query('SELECT committed_micro_usd FROM companion_question_requests WHERE id=$1',[id])).rows[0].committed_micro_usd).toBe(100000);
  });
  it('lets a new viewing scope replace a paused recap, but never reuse its ID',async()=>{
    await pro();const id=randomUUID(),first=await begin(id);await first.end(true);
    for(const changed of [{...scope,position_seconds:29},{...scope,episode_number:3},{...scope,title_id:2}]){
      await expect(begin(id,changed)).rejects.toMatchObject({code:'request_mismatch'});
    }
    const next=await begin(randomUUID(),{...scope,episode_number:3});
    expect(await first.budget.reserve(randomUUID(),100)).toBe(false);
    await next.end(false);
    await expect(begin(id)).rejects.toMatchObject({code:'question_request_closed'});
  });
  it('retains uncertain spending and rejects a stale worker after releasing its question',async()=>{
    await pack(1);const id=randomUUID(),first=await begin(id),call=randomUUID();
    await first.budget.reserve(call,200000);
    await pg.query("UPDATE companion_question_requests SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
    const next=await begin();
    expect(await first.budget.reserve(randomUUID(),100)).toBe(false);
    expect((await first.finish(answer(id),true).catch(()=>({error:true}))).error).toBeTruthy();
    await first.budget.settle(call,null,null,'transport_error');
    expect((await pg.query('SELECT committed_micro_usd FROM companion_question_requests WHERE id=$1',[id])).rows[0].committed_micro_usd).toBe(200000);
    expect(await next.budget.reserve(randomUUID(),100)).toBe(false);
    await next.end(false);expect(await allowance()).toMatchObject({purchased:1});
  });
  it('settles once, preserves failed-answer costs and applies a user monthly ceiling across questions',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET user_month_limit_micro_usd=500000');
    const first=await begin(),call=randomUUID();
    await first.budget.reserve(call,400000);await first.budget.settle(call,300000,'gen',null);
    await first.budget.settle(call,300000,'gen',null);await first.end(false);
    const next=await begin();expect(await next.budget.reserve(randomUUID(),200001)).toBe(false);
    await next.end(false);expect(await allowance()).toMatchObject({included:15});
    expect((await pg.query('SELECT committed_micro_usd FROM companion_sol_budget')).rows[0].committed_micro_usd).toBe(300000);
  });
  it('keeps the existing global cap authoritative even when per-user funds remain',async()=>{
    await pro();await pg.exec('UPDATE companion_sol_budget SET committed_micro_usd=4999999');
    const gate=await begin();expect(await gate.budget.reserve(randomUUID(),2)).toBe(false);await gate.end(false);
    await expect(pg.exec('UPDATE companion_sol_budget SET limit_micro_usd=5000001')).rejects.toThrow();
  });
  it('does not allow a completed request to debit a different position or save old revisions',async()=>{
    await pro();const id=randomUUID(),gate=await begin(id);
    expect((await gate.finish(answer(id,{...scope,position_seconds:31}),true)).error).toBeTruthy();
    expect((await gate.finish(answer(id,{...scope,companion_version:2}),true)).error).toBeTruthy();
    await gate.end(false);expect(await allowance()).toMatchObject({included:15});
  });
  it('fails closed on an unavailable ledger or an unmetered provider',async()=>{
    await expect(beginQuestionAllowance(async()=>({data:null,error:new Error('offline')}),user,randomUUID(),scope,'openrouter-sol'))
      .rejects.toMatchObject({code:'allowance_unavailable'});
    await pro();await expect(beginQuestionAllowance(rpc,user,randomUUID(),scope,'groq')).rejects.toMatchObject({code:'question_budget_unavailable'});
    expect(await allowance()).toMatchObject({included:15});
  });
  it('fails closed if the policy row disappears instead of reverting to free beta usage',async()=>{
    await expect(pg.transaction(async tx=>{
      await tx.exec('DELETE FROM companion_usage_policy');
      await tx.query('SELECT companion_usage_enabled()');
    })).rejects.toThrow('Question policy unavailable');
    // A failed statement aborts the transaction, leaving the real policy intact.
    expect((await pg.query('SELECT count(*)::int n FROM companion_usage_policy')).rows[0].n).toBe(1);
  });
  it('denies browser balance edits, other-account reads and legacy bypass RPCs',async()=>{
    await pro();
    for(const role of ['anon','authenticated'])for(const sql of [
      'SELECT * FROM companion_pro_entitlements','UPDATE companion_usage_accounts SET pack_questions=999',
      'SELECT * FROM companion_question_requests',`SELECT companion_allowance_for('${user}')`,
      `SELECT grant_companion_question_pack('${user}','fake',999)`,
      `SELECT begin_companion_question('${user}','${randomUUID()}','${randomUUID()}','{}')`]){
      await expect(pg.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec(sql);})).rejects.toThrow(/permission denied/);
    }
    for(const sql of ['UPDATE companion_usage_policy SET enabled=false',
      `SELECT reserve_companion_sol_call_legacy('${randomUUID()}','${user}','${randomUUID()}',1)`,
      `SELECT record_companion_answer_legacy('${user}','{}',true)`]){
      await expect(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.exec(sql);})).rejects.toThrow(/permission denied/);
    }
    const bypass=await rpc('reserve_companion_sol_call',{p_call_id:randomUUID(),p_user_id:user,p_request_id:randomUUID(),p_micro_usd:1});
    expect(bypass.data).toBe(false);
    const own=await pg.transaction(async tx=>{
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await tx.exec('SET LOCAL ROLE authenticated');
      return (await tx.query('SELECT get_companion_allowance() a')).rows[0].a;
    });
    expect(own).toMatchObject({included:15});
  });
});
