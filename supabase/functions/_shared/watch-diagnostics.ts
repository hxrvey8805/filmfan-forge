import type { JsonGenerator } from './answer.ts';

export const WATCH_CHECK_REVISION = 'watch-checks-2026-11-13-v1';
export type DiscussionIssue = 'identity'|'speaker'|'action'|'cause'|'timing'|'spoiler'|'relevance'|'citation';
export type ProofFailure = 'receipt_count'|'receipt_source'|'receipt_range'|'receipt_mixed_format'|'receipt_missing_quote'|'receipt_length'|'receipt_mismatch';
export type WatchDiagnostic =
  | {stage:'context_rejected';reason:'invalid_context'|'source_boundary'|'duplicate_source'}
  | {stage:'writer_invalid';attempt:number;reason:'shape'|'no_points'|'paragraph'|ProofFailure}
  | {stage:'writer_rejected';attempt:number;issue:'spoiler'|'action'}
  | {stage:'review_invalid';attempt:number;reason:'shape'|'check_shape'|ProofFailure}
  | {stage:'review_rejected';attempt:number;issues:DiscussionIssue[]}
  | {stage:'answer_accepted';attempt:number;paragraphs:number;partial:boolean}
  | {stage:'answer_exhausted'}
  | {stage:'sources_ready';sources:number;episodes:number}
  | {stage:'selection_invalid';reason:'search_terms'|'source_size'|'batch_selection'|'combined_size'|'budget_selection'|'budget_exceeded'}
  | {stage:'answer_gap';reason:'no_sources'|'no_selection'|'no_scene'|'explanation_rejected'}
  | {stage:'model_call';call:number;phase:'writer'|'verifier'|'analyst'|'unspecified';state:'started'|'returned'|'failed';inputHash:string};
export type WatchObserver = (event:WatchDiagnostic)=>void;

// Fixed categories and counts only: never log questions, captions, rejected
// drafts, model-written reasons, credentials, or transport exceptions.
export function watchDiagnostic(observe:WatchObserver|undefined,event:WatchDiagnostic) {
  try { observe?.(event); } catch { /* Logging must not change an answer or its safety checks. */ }
}

// A digest lets a private fixture be compared with the actual request packet
// without enabling remote prompt/output logging or retaining rejected prose.
export function traceWatchGenerator(generate:JsonGenerator,observe:WatchObserver):JsonGenerator {
  let call=0;
  return async (...args)=>{
    const sequence=++call;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(args)));
    const inputHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    const phase=args[3]??'unspecified';
    const emit=(state:'started'|'returned'|'failed')=>watchDiagnostic(observe,{stage:'model_call',call:sequence,phase,state,inputHash});
    emit('started');
    try { const result=await generate(...args);emit('returned');return result; }
    catch(error) {emit('failed');throw error;}
  };
}
