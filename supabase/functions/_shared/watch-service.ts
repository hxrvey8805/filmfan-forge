import type { JsonGenerator } from './answer.ts';
import { companionVersionFor, type Conversation, type SubtitleRecord, type ViewingPosition } from './companion.ts';
import type { CheckedResponse } from './companion-response.ts';
import type { ReviewedSceneNote } from './reviewed-scenes.ts';
import { questionScope, recapWindows } from './question-scope.ts';
import { watchSources } from './watch-context.ts';
import { safeReferenceQuestion, watchAnswer } from './watch-answer.ts';
import { earlierWatchData, storyCoverageMessage } from './earlier-watch-data.ts';

export type WatchData={records:SubtitleRecord[];notes:ReviewedSceneNote[];incomplete?:boolean};
export type WatchStore={
  current:(p:ViewingPosition)=>Promise<WatchData>;
  earlier:(p:ViewingPosition)=>Promise<WatchData>;
  seasons:(p:ViewingPosition)=>Promise<{season:number;count:number}[]>;
  unavailable?:(p:ViewingPosition)=>Promise<{season:number;episode:number}[]>;
  chapter?:(p:ViewingPosition)=>Promise<CheckedResponse|null>;
  saveChapter?:(p:ViewingPosition,answer:CheckedResponse)=>Promise<void>;
  prepareLater?:()=>never;
};
export const WATCH_RECAP_REVISION='watch-scope-v1';
export async function answerWatchRequest(question:string,p:ViewingPosition,history:Conversation[],generate:JsonGenerator,store:WatchStore):Promise<CheckedResponse> {
  const plan=questionScope(question,p), boundary=plan.boundary;
  const reference=safeReferenceQuestion(question,history,boundary);
  if(plan.clarification)return watchAnswer(question,plan,[],generate,reference);
  if(plan.intent!=='recap') {
    const current=await store.current(boundary);
    const previous=plan.earlierStory?await earlierWatchData(boundary,store):{records:[],notes:[],incomplete:false,coverage:undefined};
    const incomplete=!!current.incomplete || !!previous.incomplete;
    const result=await watchAnswer(question,{...plan,coverageIncomplete:incomplete},watchSources(plan,[...previous.records,...current.records],[...previous.notes,...current.notes]),generate,reference);
    if(incomplete)return {...result,answer:result.answer+'\n\n'+(previous.coverage && previous.incomplete ? storyCoverageMessage(previous.coverage) : 'My available story coverage is incomplete for this request.'),limited:true};
    return result;
  }
  const needsCatalog=!!plan.collection && boundary.mediaType==='tv' && (boundary.seasonNumber!>1 && !(plan.collection==='season' && plan.season===boundary.seasonNumber));
  const {windows,catalogComplete}=recapWindows(plan,needsCatalog?await store.seasons(boundary):[]);
  if(windows.length>100)return {answer:'That is more than I can recap reliably in one request. Which season or episode would you like first?',evidence:[],limited:true};
  const answers:CheckedResponse[]=[];let cold=0;
  for(const window of windows) {
    const at={...boundary,...(boundary.mediaType==='tv'?{seasonNumber:window.season!,episodeNumber:window.episode!}:{}),seconds:window.end};
    const previous=boundary.mediaType==='tv' && (window.season!==boundary.seasonNumber || window.episode!==boundary.episodeNumber);
    const reusable=previous && window.start===0 && window.end===43200;
    let result=reusable?await store.chapter?.(at):null;
    if(result && ((!result.evidence.length && !result.limited) || result.evidence.some(e=>e.season!==window.season || e.episode!==window.episode || e.end>window.end || e.start<window.start)))result=null;
    if(!result) {
      if(reusable && store.prepareLater && cold>=2)store.prepareLater();
      if(reusable)cold++;
      const data=window.end>0?await store.current(at):{records:[],notes:[]};
      const scope={...plan,boundary:at,window,collection:undefined,earlierStory:false};
      // Shared cached chapters must never contain a user's wording or chat.
      const recapQuestion=reusable?'Recap this entire episode in chronological order from its beginning through its end.':'Recap this requested section in chronological order. '+question;
      result=await watchAnswer(recapQuestion,scope,watchSources(scope,data.records,data.notes,window),generate);
      if(data.incomplete)result={...result,answer:result.answer+'\n\nMy coverage of this section is incomplete.',limited:true};
      // The store expires limited chapters after an hour. Caching a coverage gap
      // lets later requests reach the remaining episodes instead of preparing
      // the same two missing chapters forever.
      if(reusable)await store.saveChapter?.(at,result);
    }
    const label=boundary.mediaType==='tv'?`S${window.season}E${window.episode}`:'';
    const evidence=result.evidence.map(e=>previous?{...e,
      id:`series:${p.tmdbId}:${window.season}:${window.episode}:v${companionVersionFor(at)}:${e.id}`,label:label+' · '+e.label}:e);
    if(window.end===0 && windows.length>1)continue;
    answers.push({...result,evidence,answer:(windows.length>1?label+' — ':'')+result.answer});
  }
  if(!answers.length)return {answer:'There are no earlier episodes to recap at your selected position.',evidence:[],limited:true};
  return {answer:answers.map(a=>a.answer).join('\n\n')+(!catalogComplete?'\n\nI’m missing part of the episode catalogue, so this recap is incomplete.':''),
    evidence:answers.flatMap(a=>a.evidence),...(!catalogComplete||answers.some(a=>a.limited)?{limited:true as const}:{})};
}
