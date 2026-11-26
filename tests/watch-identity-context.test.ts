import {expect,it,vi} from 'vitest';
import {withIdentityContext} from '../supabase/functions/_shared/watch-identity-context';
import {questionScope} from '../supabase/functions/_shared/question-scope';
import {selectWatchSources} from '../supabase/functions/_shared/watch-answer';
import {sourcePacket,type WatchSource} from '../supabase/functions/_shared/watch-context';

const position={tmdbId:1,mediaType:'tv' as const,seasonNumber:1,episodeNumber:2,seconds:300};
const question='Explain this scene and why they blame each other.';
const plan=questionScope(question,position);
const source=(id:string,text:string,start=10,episode=2):WatchSource=>({id,text,start,end:start+10,season:1,episode,kind:'dialogue',evidence:{id,label:id,start,end:start+10,season:1,episode},...(episode===1?{historicalDialogue:true as const}:{})});
const earlier=source('earlier','MIRA [OVER RADIO]: Hello, Captain Vale.\nNIKO: Mira, do not send the ship.',10,1);
const qualification=source('qualification','That is only our plan, not a completed journey.',22,1);
const current=source('current','Mira, Niko!\nThis was your plan.\nYou brought the ship here.',290);

it('retains the complete introduction and adjacent qualification without replacing selected context',()=>{
  const selected=[source('cause','It was Niko’s proposal.',150,1),current];
  const pool=[earlier,qualification,...selected];
  const result=withIdentityContext(selected,pool,plan,20000);
  expect(result).toEqual(pool);
  expect(result[0]).toBe(earlier);
  expect(result[1].text).toBe(qualification.text);
  expect(selected).toHaveLength(2);
});
it('does not guess aliases or nominate unrelated names or generic speakers',()=>{
  const pool=[source('irrelevant','ELENA: This was my plan.'),source('generic','MAN: That was the man.'),source('alias','CAPTAIN VALE: Do it.'),current];
  expect(withIdentityContext([current],pool,plan,20000)).toEqual([current]);
});
it('cannot acquire an identity from a later cue, later episode or later season',()=>{
  const pool=[source('future-cue','MIRA: Secret!',301),source('future-episode','NIKO: Secret!',10,3),{...earlier,id:'future-season',season:2},current];
  expect(withIdentityContext([current],pool,plan,20000)).toEqual([current]);
});
it('respects an explicit current-episode-only scope',()=>{
  const scoped=questionScope(question+' Only this episode.',position);
  expect(withIdentityContext([current],[earlier,qualification,current],scoped,20000)).toEqual([current]);
});
it('keeps the complete original packet if a full introduction and neighbours do not fit',()=>{
  const size=JSON.stringify([current].map(sourcePacket)).length;
  expect(withIdentityContext([current],[earlier,qualification,current],plan,size+20)).toEqual([current]);
});
it('does not append a redundant label or exceed the existing source count',()=>{
  const selected=[source('known','MIRA: Niko, it was your plan.'),current];
  expect(withIdentityContext(selected,[source('redundant','MIRA: Hello.'),...selected],plan,20000)).toEqual(selected);
  const full=Array.from({length:54},(_,i)=>source('selected'+i,'Mira.',30+i*3));
  expect(withIdentityContext([...full,current],[earlier,...full,current],plan,20000)).toHaveLength(55);
});
it('does not widen recap or other answer scopes',()=>{
  const recap=questionScope('Recap the last two minutes.',position);
  expect(withIdentityContext([current],[earlier,current],recap,20000)).toEqual([current]);
});
it('adds omitted named introductions after scene selection without making another model call',async()=>{
  const filler=Array.from({length:20},(_,i)=>source('filler'+i,'An unrelated conversation about the weather. '.repeat(30),50+i*20,1));
  const pool=[earlier,qualification,...filler,current];
  const generate=vi.fn(async()=>({ids:[]}));
  const result=await selectWatchSources(question,plan,pool,generate);
  expect(result?.map(s=>s.id)).toEqual(['earlier','qualification','current']);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result?.map(sourcePacket)).length).toBeLessThanOrEqual(20000);
});
