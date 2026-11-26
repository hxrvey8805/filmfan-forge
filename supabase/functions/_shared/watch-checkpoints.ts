import type {JsonGenerator} from './answer.ts';
import type {BudgetRpc} from './sol-budget.ts';

// Untrusted intermediate responses, private to ONE authenticated question.
// Replayed values still pass the original parsing, factual and spoiler checks.
// The fingerprint includes the exact generator arguments: prompts, context,
// cutoff, output token request, purpose and schema. Bump this revision whenever
// model/provider/routing/settings or parsing changes outside those arguments.
export const WATCH_WORK_REVISION='watch-work-2026-11-26-scene-history-v2';
export interface WatchCheckpoints {
  load():Promise<Record<string,{value:unknown}>>;
  save(key:string,value:unknown):Promise<void>;
}
export function databaseWatchCheckpoints(rpc:BudgetRpc,userId:string,requestId:string,attempt:string):WatchCheckpoints {
  const base={p_user_id:userId,p_request_id:requestId,p_attempt:attempt,p_revision:WATCH_WORK_REVISION};
  return {
    async load() {
      const {data,error}=await rpc('load_companion_work',base);
      if(error||!data||typeof data!=='object'||Array.isArray(data))throw new Error('Geek could not resume this answer safely. No question has been used.');
      return data as Record<string,{value:unknown}>;
    },
    async save(key,value) {
      const {data,error}=await rpc('save_companion_work',{...base,p_key:key,p_value:{value}});
      if(error||data!==true)throw new Error('Geek could not save its progress. No question has been used.');
    },
  };
}
export function resumeWatchGenerator(generate:JsonGenerator,store:WatchCheckpoints):JsonGenerator {
  const occurrences=new Map<string,number>();
  let saved:Promise<Record<string,{value:unknown}>>|undefined;
  return async (...args)=>{
    // Assign occurrences before the first await so parallel completion cannot
    // alter identities; identical later repair calls remain separate attempts.
    const input=JSON.stringify([WATCH_WORK_REVISION,...args]);
    const occurrence=occurrences.get(input)??0;occurrences.set(input,occurrence+1);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
    const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+':'+occurrence;
    const entries=await(saved??=store.load());
    if(Object.prototype.hasOwnProperty.call(entries,key))return structuredClone(entries[key].value);
    const value=await generate(...args);
    await store.save(key,value);
    entries[key]={value:structuredClone(value)};
    return value;
  };
}
