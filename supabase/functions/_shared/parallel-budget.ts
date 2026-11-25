import type {BudgetRpc,SolBudget} from './sol-budget.ts';

// Serialize admissions, not provider calls. Temporary overlapping holds wait
// for a local in-flight call to settle; all hard limits remain database-owned.
export function parallelBudget(rpc:BudgetRpc,base:Record<string,unknown>,settle:SolBudget['settle'],blocked:()=>void):SolBudget {
  const active=new Set<string>(),waiters=new Set<()=>void>();
  let serial=Promise.resolve(),version=0,failed=false;
  const changed=()=>{version++;for(const wake of waiters)wake();waiters.clear();};
  const wait=(observed:number)=>version!==observed?Promise.resolve():new Promise<void>(resolve=>waiters.add(resolve));
  return {
    async reserve(callId,microUsd) {
      for(;;) {
        const observed=version;
        let outcome:unknown;
        const run=serial.then(async()=>{
          if(failed){outcome='denied';return;}
          const result=await rpc('try_reserve_companion_question_call',{...base,p_call_id:callId,p_micro_usd:microUsd});
          if(result.error)throw new Error('Companion budget unavailable');
          outcome=result.data;
          if(outcome==='reserved')active.add(callId);
        });
        serial=run.then(()=>{},()=>{});
        try { await run; } catch { failed=true;blocked();changed();return false; }
        if(outcome==='reserved')return true;
        // Do not wait for an unrelated process or an unresolved old receipt.
        if(outcome!=='wait'||failed||!active.size){failed=true;blocked();changed();return false;}
        await wait(observed);
      }
    },
    async settle(...args) {
      try { await settle(...args);if(args[1]===null||args[3]){failed=true;blocked();} }
      catch(error) {failed=true;blocked();throw error;}
      finally {active.delete(args[0]);changed();}
    },
  };
}
