import {WATCH_CHECK_REVISION,watchDiagnostic,type WatchDiagnostic,type WatchObserver} from './watch-diagnostics.ts';
import type {BudgetRpc} from './sol-budget.ts';

// The database stores fixed diagnostic categories, never the request packet,
// answers, captions, model-written explanations or exception messages.
const choices:Record<string,readonly string[]>={
  stage:['context_rejected','writer_invalid','writer_rejected','review_invalid','review_rejected','review_check_rejected',
    'answer_accepted','answer_exhausted','sources_ready','selection_invalid','answer_gap','model_call'],
  reason:['invalid_context','source_boundary','duplicate_source','shape','no_points','paragraph','check_shape',
    'receipt_count','receipt_source','receipt_range','receipt_mixed_format','receipt_missing_quote','receipt_length','receipt_mismatch',
    'search_terms','source_size','batch_selection','combined_size','budget_selection','budget_exceeded',
    'no_sources','no_selection','no_scene','selection_rejected','explanation_rejected'],
  issue:['identity','speaker','action','cause','timing','spoiler','relevance','citation'],
  origin:['reviewer','receipt','local'],phase:['writer','verifier','analyst','unspecified'],state:['started','returned','failed'],
};
export function diagnosticMetadata(event:WatchDiagnostic):Record<string,unknown>|null {
  if(!choices.stage.includes(event.stage))return null;
  const source=event as unknown as Record<string,unknown>,safe:Record<string,unknown>={stage:event.stage};
  for(const key of ['reason','issue','origin','phase','state']) {
    if(typeof source[key]==='string' && choices[key].includes(source[key] as string))safe[key]=source[key];
  }
  for(const key of ['attempt','paragraph','paragraphs','sources','episodes','call','elapsedMs']) {
    const value=source[key];
    if(typeof value==='number' && Number.isSafeInteger(value) && value>=0 && value<=43200000)safe[key]=value;
  }
  if(typeof source.partial==='boolean')safe.partial=source.partial;
  if(typeof source.inputHash==='string' && /^[a-f0-9]{64}$/.test(source.inputHash))safe.inputHash=source.inputHash;
  if(Array.isArray(source.issues))safe.issues=[...new Set(source.issues.filter(v=>typeof v==='string' && choices.issue.includes(v)))];
  return safe;
}

export function retainedWatchDiagnostics(rpc:BudgetRpc,userId:string,requestId:string,attempt:string,log?:WatchObserver) {
  const events:Record<string,unknown>[]=[];
  let dropped=0,flushed=false;
  const observe:WatchObserver=event=>{
    const safe=diagnosticMetadata(event);
    if(safe) {
      // Keep the opening context counts and the latest failure, even for a
      // pathological run; a diagnostic must never grow without a bound.
      if(events.length>=256){events.splice(16,1);dropped++;}
      events.push(safe);
    }
    watchDiagnostic(log,event);
  };
  return {observe,async flush():Promise<void> {
    if(flushed || !events.length)return;
    flushed=true;
    try {
      const {error,data}=await rpc('save_companion_diagnostics',{p_user_id:userId,p_request_id:requestId,p_attempt:attempt,
        p_revision:WATCH_CHECK_REVISION,p_events:events,p_dropped:dropped});
      if(error || data!==true)console.warn('Companion diagnostic persistence unavailable');
    } catch {console.warn('Companion diagnostic persistence unavailable');}
  }};
}
