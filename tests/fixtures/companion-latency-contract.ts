import {vi} from 'vitest';
import {watchAnswer as updated} from '../../supabase/functions/_shared/watch-answer';
import {questionScope} from '../../supabase/functions/_shared/question-scope';
import type {WatchSource} from '../../supabase/functions/_shared/watch-context';
import type {ViewingPosition} from '../../supabase/functions/_shared/companion';
import {createHash} from 'node:crypto';

export const cases=['broad-question','misspelt-name','rewind','episode-switch','recap-range','speech'] as const;
export async function runLatencyContract(answer:typeof updated,kind:typeof cases[number]) {
  const p:ViewingPosition={tmdbId:123,mediaType:'tv',seasonNumber:1,episodeNumber:kind==='episode-switch'?2:7,seconds:kind==='rewind'?1500:5000};
  const question=kind==='recap-range'?'Recap between 00:00 and 10:00.':kind==='speech'?'Summarise Mira’s speech.':kind==='misspelt-name'?'Why did mirra discuss the rent?':'What are all the rent jobs?';
  const plan=questionScope(question,p);
  const sources:WatchSource[]=Array.from({length:kind==='recap-range'?12:140},(_,i)=>{
    const start=i*20,end=start+10;
    return {id:'S'+i,text:'They discuss sharing the rent.\n'+('A complete exchange about rent.\n'.repeat(30)),start,end,
      season:1,episode:p.episodeNumber!,kind:'dialogue',evidence:{id:'E'+i,label:'Caption',start,end,season:1,episode:p.episodeNumber!}};
  }).filter(s=>s.end<=p.seconds) as WatchSource[];
  const generate=vi.fn(async(_system:string,user:string,_tokens:number,phase?:string,format?:any)=>{
    const packet=JSON.parse(user);
    if(format?.json_schema?.name==='companion_search_terms')return {terms:['rent']};
    if(format?.json_schema?.name==='companion_relevant_sources') {
      // Completion order deliberately differs from input order.
      await new Promise(resolve=>setTimeout(resolve,Number(packet.sources[0].id.slice(1))%3));
      return {ids:packet.sources.filter((_:unknown,i:number)=>i%2===0).slice(0,8).map((s:any)=>s.id)};
    }
    if(format?.json_schema?.name==='companion_budgeted_sources')return {ids:packet.sources.slice(0,2).map((s:any)=>s.id)};
    const refs=[packet.sources[0],packet.sources[Math.floor(packet.sources.length/2)],packet.sources.at(-1)];
    const support=(s:any)=>[{id:s.id,firstLine:1,lastLine:1}];
    if(phase==='writer')return {points:refs.map((s:any)=>({text:'They discuss sharing the rent.',support:support(s)}))};
    return {boundarySafe:true,fit:'direct',checks:packet.points.map((point:any,index:number)=>({index,supported:true,issue:'none',attribution:'none',support:support(refs[index])}))};
  });
  const result=await answer(question,plan,sources,generate);
  return {result,requestHashes:generate.mock.calls.map(args=>createHash('sha256').update(JSON.stringify(args)).digest('hex'))};
}
