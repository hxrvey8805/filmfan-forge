import { describe, it, expect, vi } from 'vitest';
import { earlierWatchData } from '../supabase/functions/_shared/earlier-watch-data';
import { answerWatchRequest, type WatchStore } from '../supabase/functions/_shared/watch-service';
import { watchSources } from '../supabase/functions/_shared/watch-context';
import { questionScope } from '../supabase/functions/_shared/question-scope';
import { safeHistory, type ViewingPosition, type SubtitleRecord, type Conversation } from '../supabase/functions/_shared/companion';

const p:ViewingPosition={tmdbId:289517,mediaType:'tv',seasonNumber:1,episodeNumber:5,seconds:1507};
const row=(episode:number,season=1,title=289517):SubtitleRecord=>({id:`${title}:${season}:${episode}`,tmdb_id:title,media_type:'tv',season_number:season,episode_number:episode,ingestion_version:3,source_file_id:10+episode,
 cues:[{start:5,end:10,text:`Episode ${episode} has a distinct task.`},{start:1506,end:1508,text:'CROSSING_CUTOFF'},{start:1800,end:1810,text:'LATER_IN_EPISODE'}]});
function fixture(initial:SubtitleRecord[]=[],absent:number[]=[]) {
 const records=[...initial],unavailable=new Set<number>(absent),preparations:number[]=[];
 const store:WatchStore={
  current:vi.fn(async at=>{
   preparations.push(at.episodeNumber!);
   if(absent.includes(at.episodeNumber!)){unavailable.add(at.episodeNumber!);return {records:[],notes:[]};}
   const r=row(at.episodeNumber!,at.seasonNumber!,at.tmdbId);records.push(r);return {records:[r],notes:[]};
  }),
  earlier:vi.fn(async()=>({records:[...records],notes:[]})),seasons:vi.fn(async()=>[]),
  unavailable:async()=>[...unavailable].map(episode=>({season:1,episode})),
  prepareLater:()=>{throw Error('preparing');},
 };
 return {store,records,preparations};
}
describe('earlier episode preparation and completeness',()=>{
 it('loads missing episodes in bounded batches before generating an answer',async()=>{
  const f=fixture();
  await expect(earlierWatchData(p,f.store)).rejects.toThrow('preparing');
  expect(f.preparations).toEqual([1,2]);
  const data=await earlierWatchData(p,f.store);
  expect(f.preparations).toEqual([1,2,3,4]);expect(data.incomplete).toBe(false);
  expect(new Set(data.records.map(r=>r.episode_number))).toEqual(new Set([1,2,3,4]));
  await earlierWatchData(p,f.store);expect(f.preparations).toHaveLength(4);
 });
 it('advances past unavailable files and reports their exact gaps',async()=>{
  const f=fixture([], [1]);
  await expect(earlierWatchData(p,f.store)).rejects.toThrow('preparing');
  const data=await earlierWatchData(p,f.store);
  expect(f.preparations).toEqual([2,3,4]);expect(data.coverage.missing).toEqual([{season:1,episode:1}]);expect(data.incomplete).toBe(true);
 });
 it('rejects foreign and future cached rows as coverage of missing episodes',async()=>{
  const f=fixture([row(1,1,999),row(6)]);
  await expect(earlierWatchData(p,f.store)).rejects.toThrow('preparing');expect(f.preparations).toEqual([1,2]);
 });
 it('does not treat a mismatched subtitle edition as complete context',async()=>{
  const f=fixture([row(1),{...row(1),id:'other-cut',source_file_id:99},row(2),row(3),row(4)]);
  const data=await earlierWatchData(p,f.store);expect(data.incomplete).toBe(true);expect(data.coverage.missing).toContainEqual({season:1,episode:1});
 });
 it('uses the catalogue for prior seasons and ignores future seasons',async()=>{
  const f=fixture([row(1),row(2),row(1,2)]);
  f.store.seasons=vi.fn(async()=>[{season:1,count:2},{season:2,count:1},{season:4,count:100}]);
  const data=await earlierWatchData({...p,seasonNumber:3,episodeNumber:1},f.store);
  expect(data.incomplete).toBe(false);expect(f.preparations).toEqual([]);
 });
 it('reports a missing catalogue instead of treating later-season context as complete',async()=>{
  const f=fixture([row(1,2)]);
  expect((await earlierWatchData({...p,seasonNumber:2,episodeNumber:2},f.store)).coverage.catalogComplete).toBe(false);
 });
 it('bounds very long or invalid catalogues without claiming completeness',async()=>{
  const f=fixture();f.store.seasons=vi.fn(async()=>[{season:1,count:5000}]);
  const data=await earlierWatchData({...p,seasonNumber:2,episodeNumber:1},f.store);
  expect(data.incomplete).toBe(true);expect(f.preparations).toEqual([]);
 });
 it('finishes with an explicit gap when repeated preparation makes no progress',async()=>{
  const f=fixture();f.store.current=vi.fn(async()=>({records:[],notes:[]}));
  const result=await earlierWatchData(p,f.store);
  expect(result.coverage.missing).toHaveLength(4);expect(result.incomplete).toBe(true);expect(f.store.current).toHaveBeenCalledTimes(2);
 });
 it('propagates provider failures before any model request or answer charge',async()=>{
  const f=fixture([row(5)]),gen=vi.fn();f.store.current=vi.fn(async at=>{if(at.episodeNumber===5)return {records:[row(5)],notes:[]};throw Error('quota');});
  await expect(answerWatchRequest('What were the other jobs?',p,[],gen,f.store)).rejects.toThrow('quota');expect(gen).not.toHaveBeenCalled();
 });
 it('does not prepare earlier episodes for an explicit current-only question or scene',async()=>{
  for(const q of ['What happened here?', 'Why is he here? Only this episode.']) {
   const f=fixture();await answerWatchRequest(q,p,[],vi.fn(async()=>null),f.store);
   expect(f.store.earlier).not.toHaveBeenCalled();expect(f.preparations).toEqual([5]);
  }
 });
 it('passes an incomplete flag to the writer and marks a partial list as limited',async()=>{
  const f=fixture([row(2),row(3),row(4)], [1]),packets:any[]=[];
  const gen=vi.fn(async(_system:string,user:string)=>{const packet=JSON.parse(user);packets.push(packet);return null;});
  const result=await answerWatchRequest('What were the other jobs?',p,[],gen,f.store);
  expect(packets[0].request.coverageIncomplete).toBe(true);expect(result.limited).toBe(true);expect(result.answer).toContain('S1E1');
 });
 it('includes verified shared-cut context without needing an old subtitle file',async()=>{
  const at={...p,tmdbId:66573,episodeNumber:2,seconds:0},f=fixture();
  expect((await earlierWatchData(at,f.store)).incomplete).toBe(false);expect(f.preparations).toEqual([]);
  expect(watchSources(questionScope('Why does Eleanor think there is a mistake?',at),[],[]).some(s=>s.episode===1&&s.kind==='story')).toBe(true);
 });
 it.each([1507,9])('filters the provider packet again after a rewind to %i',seconds=>{
  const at={...p,seconds},sources=watchSources(questionScope('What were the jobs?',at),[row(1),row(5),row(6),row(1,2),row(1,1,999)],[]);
  expect(sources.filter(s=>s.episode===5).every(s=>s.end<=seconds)).toBe(true);
  expect(sources.every(s=>s.season===1&&s.episode<=5)).toBe(true);
  expect(sources.filter(s=>s.episode===5).map(s=>s.text).join('')).not.toMatch(/CROSSING_CUTOFF|LATER_IN_EPISODE/);
 });
 it('episode switching cannot carry new episode facts or its conversation backwards',()=>{
  const at={...p,episodeNumber:2,seconds:10};
  const sources=watchSources(questionScope('What were the jobs?',at),[row(1),row(2),row(3),row(5)],[]);
  expect(new Set(sources.map(s=>s.episode))).toEqual(new Set([1,2]));
  const saved={id:'saved',title_id:p.tmdbId,media_type:'tv',season_number:1,episode_number:5,position_seconds:1507,companion_version:3,answer_status:'answered',evidence:[],question:'Jobs?',answer:'EPISODE_5_ANSWER'} as unknown as Conversation;
  expect(safeHistory([saved],at)).toEqual([]);expect(safeHistory([saved],{...p,seconds:1506})).toEqual([]);
 });
});
