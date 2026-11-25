import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import {databaseWatchCheckpoints} from '../supabase/functions/_shared/watch-checkpoints';
import { beginQuestionAllowance } from '../supabase/functions/_shared/question-allowance';
import type { BudgetRpc } from '../supabase/functions/_shared/sol-budget';
import { solGenerator } from '../supabase/functions/_shared/openrouter-sol';
import { SOL_RESOLVED_MODEL } from '../supabase/functions/_shared/sol-budget';
import billing from './fixtures/companion-billing.json';

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
    '20261105170000_companion_sol_budget','20261113190000_companion_monthly_allowance',
    '20261114120000_companion_spending_safeguards','20261125120000_companion_work_checkpoints']) await pg.exec(migration(name));
});

describe('spending safeguards',()=>{
  const reason=async(id:string)=>(await pg.query<{budget_block_reason:string|null}>(
    'SELECT budget_block_reason FROM companion_question_requests WHERE id=$1',[id])).rows[0].budget_block_reason;
  const knownCall=async(gate:Awaited<ReturnType<typeof begin>>,amount:number)=>{
    const call=randomUUID();expect(await gate.budget.reserve(call,amount)).toBe(true);
    await gate.budget.settle(call,amount,call,null);return call;
  };
  it.each(billing.questions)('allows $case through a $0.35 example cap using saved bills, without calling AI',async sample=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=350000');
    const id=randomUUID(),gate=await begin(id);
    for(const call of sample.calls){
      const callId=randomUUID();expect(await gate.budget.reserve(callId,call.reservedMicroUsd)).toBe(true);
      await gate.budget.settle(callId,call.actualMicroUsd,callId,null);
    }
    expect((await gate.finish(answer(id),true)).error).toBeNull();
    expect((await pg.query('SELECT committed_micro_usd FROM companion_question_requests WHERE id=$1',[id])).rows[0].committed_micro_usd).toBe(sample.totalMicroUsd);
    expect(await allowance()).toMatchObject({included:14});
  });
  it('simulates all 15 included questions at the largest saved cost under a $3 example account cap',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=350000,user_month_limit_micro_usd=3000000');
    const sample=[...billing.questions].sort((a,b)=>b.totalMicroUsd-a.totalMicroUsd)[0];
    for(let i=0;i<15;i++){
      const id=randomUUID(),gate=await begin(id);
      for(const call of sample.calls){
        const callId=randomUUID();expect(await gate.budget.reserve(callId,call.reservedMicroUsd)).toBe(true);
        await gate.budget.settle(callId,call.actualMicroUsd,callId,null);
      }
      expect((await gate.finish(answer(id),true)).error).toBeNull();
    }
    expect(await allowance()).toMatchObject({included:0});
    expect((await pg.query('SELECT committed_micro_usd FROM companion_sol_budget')).rows[0].committed_micro_usd).toBe(sample.totalMicroUsd*15);
  });
  it('does not reset the money allowance across a resumed recap or a policy increase',async()=>{
    await pro();const id=randomUUID(),first=await begin(id);
    await knownCall(first,300000);await first.end(true);
    await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=1000000');
    const next=await begin(id);
    expect(await next.budget.reserve(randomUUID(),200001)).toBe(false);
    expect(await reason(id)).toBe('question_limit');
    await next.end(false);expect(await allowance()).toMatchObject({included:15});
  });
  it('honours a lowered limit as well as the original question limit',async()=>{
    await pro();const id=randomUUID(),first=await begin(id);
    await knownCall(first,200000);
    await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=250000');
    expect(await first.budget.reserve(randomUUID(),50001)).toBe(false);
    expect(await reason(id)).toBe('question_limit');await first.end(false);
  });
  it('attributes new recap calls to the current month even when the question started earlier',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=1000000,user_month_limit_micro_usd=1000000');
    const id=randomUUID(),first=await begin(id);
    const old=await knownCall(first,100000);
    await pg.query("UPDATE companion_sol_calls SET created_at=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '1 minute' WHERE id=$1",[old]);
    await pg.query("UPDATE companion_question_requests SET budget_month=(date_trunc('month',now())-interval '1 month')::date WHERE id=$1",[id]);
    await first.end(true);
    // Another already-paid request in this month (e.g. a request before the
    // staged monthly policy was enabled) must also count against this user.
    await pg.query(`INSERT INTO companion_sol_calls(id,user_id,request_id,reserved_micro_usd,actual_micro_usd,status)
      VALUES($1,$2,$3,600000,600000,'settled')`,[randomUUID(),user,randomUUID()]);
    await pg.exec('UPDATE companion_sol_budget SET committed_micro_usd=committed_micro_usd+600000');
    const next=await begin(id);await knownCall(next,350000);await next.end(true);
    const last=await begin(id);
    expect(await last.budget.reserve(randomUUID(),50001)).toBe(false);
    expect(await reason(id)).toBe('user_month_limit');await last.end(false);
    expect(await allowance()).toMatchObject({included:15});
  });
  it('releases previous-month costs from the monthly bucket but retains the whole-question total',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET user_month_limit_micro_usd=500000');
    const id=randomUUID(),first=await begin(id),old=await knownCall(first,400000);
    await pg.query("UPDATE companion_sol_calls SET created_at=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '1 minute' WHERE id=$1",[old]);
    await first.end(true);
    const next=await begin(id);await knownCall(next,100000);
    expect(await next.budget.reserve(randomUUID(),1)).toBe(false);
    expect(await reason(id)).toBe('question_limit');await next.end(false);
    const fresh=await begin();expect(await fresh.budget.reserve(randomUUID(),400000)).toBe(true);
    await fresh.end(false);
  });
  it('applies an optional daily cap to failed and uncharged attempts',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET user_day_limit_micro_usd=600000');
    const first=await begin();await knownCall(first,400000);await first.end(false);
    const next=await begin(),call=randomUUID();
    expect(await next.budget.reserve(call,200000)).toBe(true);
    await next.budget.settle(call,100000,'small-receipt',null);await next.end(false);
    const id=randomUUID(),last=await begin(id);
    expect(await last.budget.reserve(randomUUID(),100001)).toBe(false);
    expect(await reason(id)).toBe('user_day_limit');await last.end(false);
    expect(await allowance()).toMatchObject({included:15});
  });
  it('uses UTC boundaries even under a different database session time zone',async()=>{
    await pro();await pg.exec("SET TIME ZONE 'Pacific/Honolulu'; UPDATE companion_usage_policy SET user_day_limit_micro_usd=500000");
    try {
      const first=await begin(),call=await knownCall(first,400000);await first.end(false);
      await pg.query("UPDATE companion_sol_calls SET created_at=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '1 microsecond' WHERE id=$1",[call]);
      const next=await begin();expect(await next.budget.reserve(randomUUID(),500000)).toBe(true);await next.end(false);
    } finally {await pg.exec("SET TIME ZONE 'UTC'");}
  });
  it('does not reset account spending when a user buys packs or renews Pro',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET user_month_limit_micro_usd=500000');
    const first=await begin();await knownCall(first,400000);await first.end(false);
    await pack(50);await pg.query("UPDATE companion_pro_entitlements SET anchor=now()-interval '1 hour',plan='annual' WHERE user_id=$1",[user]);
    const id=randomUUID(),next=await begin(id);
    expect(await next.budget.reserve(randomUUID(),100001)).toBe(false);
    expect(await reason(id)).toBe('user_month_limit');await next.end(false);
    expect(await allowance()).toMatchObject({plan:'annual',included:15,purchased:50});
  });
  it('protects Free question packs with the same money checks and keeps unspent questions',async()=>{
    await pack(2);const id=randomUUID(),gate=await begin(id);
    expect(await gate.budget.reserve(randomUUID(),500001)).toBe(false);
    await gate.end(false);expect(await allowance()).toMatchObject({plan:'free',purchased:2});
    expect(await reason(id)).toBe('question_limit');
  });
  it('bounds all provider attempts including zero-cost calls and recap continuations',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_call_limit=2');
    const id=randomUUID(),first=await begin(id),call=randomUUID();
    expect(await first.budget.reserve(call,1000)).toBe(true);await first.budget.settle(call,0,'zero-receipt',null);await first.end(true);
    await pg.exec('UPDATE companion_usage_policy SET question_call_limit=64');
    const next=await begin(id);await knownCall(next,1);
    expect(await next.budget.reserve(randomUUID(),1)).toBe(false);
    expect(await reason(id)).toBe('call_limit');await next.end(false);
  });
  it('persists a refused reservation so another worker cannot spend or save a partial answer',async()=>{
    await pro();const id=randomUUID();await begin(id);
    const attempt=(await pg.query<{attempt:string}>('SELECT attempt FROM companion_question_requests WHERE id=$1',[id])).rows[0].attempt;
    const args={p_call_id:randomUUID(),p_user_id:user,p_request_id:id,p_attempt:attempt,p_micro_usd:500001};
    expect((await rpc('reserve_companion_question_call',args)).data).toBe(false);
    expect((await rpc('reserve_companion_question_call',{...args,p_call_id:randomUUID(),p_micro_usd:1})).data).toBe(false);
    expect((await rpc('finish_companion_question',{p_user_id:user,p_attempt:attempt,p_conversation:answer(id),p_charge:true})).error).toBeTruthy();
    expect((await rpc('end_companion_question_attempt',{p_user_id:user,p_request_id:id,p_attempt:attempt,p_pause:true})).data).toBe(true);
    await expect(begin(id)).rejects.toMatchObject({code:'question_request_closed'});
    expect(await allowance()).toMatchObject({included:15});
    expect((await pg.query('SELECT count(*)::int n FROM ai_conversations')).rows[0].n).toBe(0);
  });
  it('serializes simultaneous reservations against the whole-question ceiling',async()=>{
    await pro();const gate=await begin();
    const results=await Promise.all(Array.from({length:5},()=>gate.budget.reserve(randomUUID(),200000)));
    expect(results.filter(Boolean)).toHaveLength(2);await gate.end(false);
    expect((await pg.query('SELECT committed_micro_usd FROM companion_sol_budget')).rows[0].committed_micro_usd).toBe(400000);
  });
  it('does not reauthorize a provider call ID or charge its held money twice',async()=>{
    await pro();const id=randomUUID(),gate=await begin(id),call=randomUUID();
    expect(await gate.budget.reserve(call,1000)).toBe(true);
    expect(await gate.budget.reserve(call,1000)).toBe(false);
    expect(await reason(id)).toBe('duplicate_call');await gate.budget.settle(call,500,'one-call',null);await gate.end(false);
    expect((await pg.query('SELECT committed_micro_usd FROM companion_sol_budget')).rows[0].committed_micro_usd).toBe(500);
  });
  it('keeps stored zero-call answers available when the inference pool is exhausted',async()=>{
    await pro();await pg.exec('UPDATE companion_sol_budget SET committed_micro_usd=5000000');
    const id=randomUUID(),gate=await begin(id);
    expect((await gate.finish(answer(id),false)).error).toBeNull();
    expect(await allowance()).toMatchObject({included:15});
    expect((await pg.query('SELECT count(*)::int n FROM companion_sol_calls')).rows[0].n).toBe(0);
  });
  it('never sends a network request when its conservative reservation will exceed a limit',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=1');
    const id=randomUUID(),gate=await begin(id);let calls=0;
    const network:typeof fetch=async()=>{calls++;throw new Error('Must not reach provider');};
    await expect(solGenerator('offline-placeholder',gate.budget,network)('Same system','Same context',900)).rejects.toThrow();
    expect(calls).toBe(0);expect(gate.budgetBlocked).toBe(true);expect(await reason(id)).toBe('question_limit');
    await gate.end(false);expect(await allowance()).toMatchObject({included:15});
  });
  it('passes the full writer and reviewer requests through unchanged when funded',async()=>{
    await pro();const id=randomUUID(),gate=await begin(id),bodies:Record<string,unknown>[]=[];
    const network:typeof fetch=async(_url,options)=>{
      bodies.push(JSON.parse(String(options?.body)));
      return new Response(JSON.stringify({id:randomUUID(),model:SOL_RESOLVED_MODEL,provider:'OpenAI',usage:{cost:0.01},
        choices:[{finish_reason:'stop',message:{content:'{"checked":true}'}}]}));
    };
    const generate=solGenerator('offline-placeholder',gate.budget,network);
    await generate('Unchanged writer','Every permitted caption',900,'writer');
    await generate('Unchanged independent review','Every permitted caption and the draft',900,'verifier');
    expect(bodies.map(b=>b.messages)).toEqual([
      [{role:'system',content:'Unchanged writer\nReturn exactly one JSON object. No Markdown fences, commentary, or thinking text.'},{role:'user',content:'Every permitted caption'}],
      [{role:'system',content:'Unchanged independent review\nReturn exactly one JSON object. No Markdown fences, commentary, or thinking text.'},{role:'user',content:'Every permitted caption and the draft'}],
    ]);
    expect(bodies.every(b=>b.model==='openai/gpt-6.1-sol')).toBe(true);
    expect(gate.budgetBlocked).toBe(false);
    expect((await gate.finish(answer(id),true)).error).toBeNull();expect(await allowance()).toMatchObject({included:14});
  });
  it('reports actual and unresolved cost separately without leaking story or credential data',async()=>{
    await pro();const id=randomUUID(),gate=await begin(id);await knownCall(gate,200000);
    const unknown=randomUUID();expect(await gate.budget.reserve(unknown,100000)).toBe(true);
    await gate.budget.settle(unknown,null,null,'transport_error');await gate.end(false);
    const report=await pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');
      return {daily:(await tx.query('SELECT * FROM companion_spending_daily')).rows,questions:(await tx.query('SELECT * FROM companion_spending_questions')).rows};});
    expect(report.daily[0]).toMatchObject({known_micro_usd:200000,unresolved_micro_usd:100000,committed_micro_usd:300000,unknown_calls:1});
    expect(report.questions[0]).toMatchObject({request_id:id,status:'released',provider_calls:2,known_micro_usd:200000,unresolved_micro_usd:100000});
    for(const row of [...report.daily,...report.questions])for(const key of ['scope','question','answer','generation_id','evidence','api_key'])expect(row).not.toHaveProperty(key);
    for(const role of ['anon','authenticated'])for(const sql of ['SELECT * FROM companion_spending_daily','SELECT * FROM companion_spending_questions']){
      await expect(pg.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec(sql);})).rejects.toThrow(/permission denied/);
    }
  });
  it('prevents service-role bypasses and invalid policy settings',async()=>{
    for(const sql of [
      `SELECT begin_companion_question_before_spending('${user}','${randomUUID()}','${randomUUID()}','{}')`,
      `SELECT finish_companion_question_before_spending('${user}','${randomUUID()}','{}',true)`,
      'UPDATE companion_usage_policy SET question_limit_micro_usd=5000000',
      'UPDATE companion_sol_budget SET committed_micro_usd=0',
    ])await expect(pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.exec(sql);})).rejects.toThrow(/permission denied/);
    for(const sql of [
      'UPDATE companion_usage_policy SET question_call_limit=0',
      'UPDATE companion_usage_policy SET question_call_limit=257',
      'UPDATE companion_usage_policy SET user_day_limit_micro_usd=499999',
      'UPDATE companion_usage_policy SET user_day_limit_micro_usd=2000001',
    ])await expect(pg.exec(sql)).rejects.toThrow();
  });
});
afterAll(()=>pg.close());
beforeEach(async()=>{
  user=randomUUID();
  await pg.exec(`TRUNCATE companion_work_checkpoints,companion_question_calls,companion_question_requests,companion_usage_accounts,companion_question_packs,
    companion_pro_entitlements,companion_sol_calls,ai_conversations;
    UPDATE companion_usage_policy SET enabled=true,question_limit_micro_usd=500000,user_month_limit_micro_usd=2000000,
      user_day_limit_micro_usd=null,question_call_limit=64;
    UPDATE companion_sol_budget SET enabled=true,limit_micro_usd=5000000,committed_micro_usd=0,halted_reason=null;`);
});

describe('parallel reservations and private continuation checkpoints',()=>{
  const parallel=(id=randomUUID())=>beginQuestionAllowance(rpc,user,id,scope,'openrouter-sol',true);
  it('waits for overlapping holds without raising or prematurely exhausting the question cap',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=350000');
    const gate=await parallel(),one=randomUUID(),two=randomUUID();
    expect(await gate.budget.reserve(one,200000)).toBe(true);
    let completed=false;const waiting=gate.budget.reserve(two,200000).then(value=>{completed=true;return value;});
    await pg.query('SELECT 1');await pg.query('SELECT 1');expect(completed).toBe(false);
    await gate.budget.settle(one,50000,'one',null);
    expect(await waiting).toBe(true);expect(gate.budgetBlocked).toBe(false);
    await gate.budget.settle(two,50000,'two',null);await gate.end(false);
    expect((await pg.query('SELECT committed_micro_usd FROM companion_sol_budget')).rows[0].committed_micro_usd).toBe(100000);
    expect((await pg.query('SELECT question_limit_micro_usd FROM companion_usage_policy')).rows[0].question_limit_micro_usd).toBe(350000);
  });
  it('still denies work if actual settled spend leaves insufficient money',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=350000');
    const gate=await parallel(),one=randomUUID();await gate.budget.reserve(one,200000);
    const waiting=gate.budget.reserve(randomUUID(),200000);
    await gate.budget.settle(one,200000,'one',null);
    expect(await waiting).toBe(false);expect(gate.budgetBlocked).toBe(true);
    await expect(gate.end(true)).rejects.toMatchObject({code:'question_budget_unavailable'});
  });
  it('retains an uncertain cost and stops queued work after a transport failure',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_limit_micro_usd=350000');
    const gate=await parallel(),one=randomUUID();await gate.budget.reserve(one,200000);
    const waiting=gate.budget.reserve(randomUUID(),200000);
    await gate.budget.settle(one,null,null,'transport_error');expect(await waiting).toBe(false);
    expect((await pg.query('SELECT committed_micro_usd,halted_reason FROM companion_sol_budget')).rows[0])
      .toEqual({committed_micro_usd:200000,halted_reason:'transport_error'});
    expect((await pg.query('SELECT count(*)::int n FROM companion_sol_calls')).rows[0].n).toBe(1);
  });
  it('does not bypass a permanent call-count or global-money limit',async()=>{
    await pro();await pg.exec('UPDATE companion_usage_policy SET question_call_limit=1');
    const gate=await parallel(),call=randomUUID();await gate.budget.reserve(call,100);
    await gate.budget.settle(call,10,'one',null);
    expect(await gate.budget.reserve(randomUUID(),10)).toBe(false);await gate.end(false);
    await pg.exec('UPDATE companion_sol_budget SET committed_micro_usd=5000000');
    const next=await parallel();expect(await next.budget.reserve(randomUUID(),1)).toBe(false);
  });
  it('keeps checkpoints private to the exact request and live attempt, then removes them on completion',async()=>{
    await pro();const id=randomUUID(),gate=await parallel(id),key='a'.repeat(64)+':0';
    const store=databaseWatchCheckpoints(rpc,user,id,gate.attempt);
    await store.save(key,{points:[{text:'PRIVATE_DRAFT'}]});
    expect(await store.load()).toEqual({[key]:{value:{points:[{text:'PRIVATE_DRAFT'}]}}});
    for(const wrong of [databaseWatchCheckpoints(rpc,randomUUID(),id,gate.attempt),databaseWatchCheckpoints(rpc,user,id,randomUUID())])
      await expect(wrong.load()).rejects.toThrow('safely');
    await gate.end(true);await expect(store.load()).rejects.toThrow();
    const next=await parallel(id),resumed=databaseWatchCheckpoints(rpc,user,id,next.attempt);
    expect(await resumed.load()).toHaveProperty(key);await expect(store.save(key,{})).rejects.toThrow();
    await next.finish(answer(id),true);
    expect((await pg.query('SELECT count(*)::int n FROM companion_work_checkpoints')).rows[0].n).toBe(0);
  });
  it('expires intermediate results and clears abandoned or released requests',async()=>{
    await pro();const id=randomUUID(),gate=await parallel(id),key='b'.repeat(64)+':0';
    const store=databaseWatchCheckpoints(rpc,user,id,gate.attempt);await store.save(key,null);
    await pg.exec("UPDATE companion_work_checkpoints SET expires_at=now()-interval '1 second'");expect(await store.load()).toEqual({});
    await store.save(key,{private:true});await gate.end(false);
    expect((await pg.query('SELECT count(*)::int n FROM companion_work_checkpoints')).rows[0].n).toBe(0);
  });
  it('denies client access and direct service edits to intermediate responses',async()=>{
    for(const role of ['anon','authenticated','service_role'])await expect(pg.transaction(async tx=>{
      await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec('SELECT * FROM companion_work_checkpoints');
    })).rejects.toThrow(/permission denied/);
    for(const role of ['anon','authenticated'])await expect(pg.transaction(async tx=>{
      await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query('SELECT load_companion_work($1,$2,$3,$4)',[user,randomUUID(),randomUUID(),'revision']);
    })).rejects.toThrow(/permission denied/);
  });
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
