import {describe,it,expect,vi} from 'vitest';
import {answerWatchRequest,type WatchStore} from '../supabase/functions/_shared/watch-service';
import {questionScope} from '../supabase/functions/_shared/question-scope';
import {watchSources,type WatchSource} from '../supabase/functions/_shared/watch-context';
import {selectWatchSources,watchAnswer} from '../supabase/functions/_shared/watch-answer';
import {scenePosition as position,sceneQuestion as question,sceneRecords} from './fixtures/scene-earlier-context';

function store():WatchStore {
  const rows=sceneRecords();
  return {current:vi.fn(async p=>({records:rows.filter(r=>r.episode_number===p.episodeNumber),notes:[]})),
    earlier:vi.fn(async()=>({records:rows,notes:[]})),seasons:vi.fn(async()=>[])};
}
const answer='Lyra keeps the gate shut while the flood alarm is active. Earlier, she promised Theo to keep it shut because opening it could flood the lower village.';
function generator(mode:'good'|'old-only'|'timing'|'spoiler'='good') {
  return vi.fn(async(_system:string,user:string,_tokens:number,phase?:string)=>{
    const packet=JSON.parse(user);
    const past=packet.sources.find((s:any)=>s.episode===1);
    const current=packet.sources.find((s:any)=>s.episode===2 && s.end>=285);
    const refs=(mode==='old-only'?[past]:[past,current]).filter(Boolean);
    const support=refs.map((s:any)=>({id:s.id,firstLine:1,lastLine:s.text.split('\n').length}));
    if(phase==='writer')return {points:[{text:answer,support}]};
    return {boundarySafe:mode!=='spoiler',fit:'direct',checks:[{index:0,supported:mode!=='timing',issue:mode==='timing'?'timing':'none',attribution:'explicit',support}]};
  });
}
describe('scene explanations use earlier story without moving the viewing boundary',()=>{
  it.each(['Explain this scene.','What happened here?','What does this scene mean?'])('opens prior context for %s',q=>{
    expect(questionScope(q,position)).toMatchObject({intent:'scene',earlierStory:true,boundary:position});
  });
  it.each(['Explain this scene. Only this episode.','What happened here? Ignore earlier episodes.'])('respects an explicit restriction: %s',q=>{
    expect(questionScope(q,position).earlierStory).toBe(false);
  });
  it('keeps films and chronological recaps on their existing scopes',()=>{
    expect(questionScope(question,{tmdbId:1,mediaType:'movie',seconds:300}).earlierStory).toBe(false);
    expect(questionScope('Recap the last two minutes.',position)).toMatchObject({intent:'recap',earlierStory:false});
  });
  it('loads prior episodes and gives both writer and independent reviewer the same complete selected sources',async()=>{
    const s=store(),gen=generator();
    const result=await answerWatchRequest(question,position,[],gen,s);
    expect(s.earlier).toHaveBeenCalledWith(position);
    expect(result.answer).toBe(answer);expect(result.limited).toBeUndefined();
    expect(new Set(result.evidence.map(e=>e.episode))).toEqual(new Set([1,2]));
    const packets=gen.mock.calls.map(c=>JSON.parse(c[1]));
    expect(packets[0].sources).toEqual(packets[1].sources);
    expect(packets[0].request.target).toMatchObject({season:1,episode:2,end:300});
    expect(packets[0].sources.some((s:any)=>s.historicalDialogue && s.episode===1)).toBe(true);
    expect(JSON.stringify(gen.mock.calls)).not.toMatch(/CROSSING_CUTOFF|LATER_TIMESTAMP|FUTURE_EPISODE|FUTURE_SEASON|FOREIGN_TITLE/);
  });
  it.each(['timing','spoiler','old-only'] as const)('rejects an explanation with %s failure',async mode=>{
    await expect(answerWatchRequest(question,position,[],generator(mode),store())).rejects.toMatchObject({code:'question_answer_unverified'});
  });
  it('does not substitute earlier-episode context when the selected scene has no evidence',async()=>{
    const s=store();s.current=vi.fn(async()=>({records:[],notes:[]}));
    // earlier() must not provide a current-episode record in this fixture.
    s.earlier=vi.fn(async()=>({records:sceneRecords().filter(r=>r.episode_number===1),notes:[]}));
    const gen=generator(),result=await answerWatchRequest(question,position,[],gen,s);
    expect(result.limited).toBe(true);expect(result.evidence).toEqual([]);expect(gen).not.toHaveBeenCalled();
  });
  it('rewinding removes later current cues but keeps eligible earlier episodes',()=>{
    const p={...position,seconds:290},sources=watchSources(questionScope(question,p),sceneRecords(),[]);
    expect(sources.some(s=>s.episode===1)).toBe(true);
    expect(sources.filter(s=>s.episode===2).every(s=>s.end<=290)).toBe(true);
    expect(JSON.stringify(sources)).not.toMatch(/gate stays shut|SECRET/);
  });
  it('switching back an episode excludes the episode just left',()=>{
    const p={...position,episodeNumber:1,seconds:25},sources=watchSources(questionScope(question,p),sceneRecords(),[]);
    expect(sources.every(s=>s.season===1 && s.episode===1 && s.end<=25)).toBe(true);
    expect(JSON.stringify(sources)).not.toMatch(/still active|gate stays shut|SECRET/);
  });
  it('an explicit stricter cutoff also filters the scene used to search',()=>{
    const plan=questionScope('Explain this scene using only what was known at 04:50.',position);
    expect(plan.boundary.seconds).toBe(290);
    expect(JSON.stringify(watchSources(plan,sceneRecords(),[]))).not.toMatch(/gate stays shut|SECRET/);
  });
});

function largeSources(count:number) {
  const plan=questionScope(question,position);
  const real=watchSources(plan,sceneRecords(),[]);
  const base=real.find(s=>s.episode===1)!;
  const filler:WatchSource[]=Array.from({length:count},(_,i)=>({...base,id:'filler'+i,start:100+i*20,end:110+i*20,
    text:'A discussion about ordinary weather and travel. '.repeat(25)}));
  return {plan,sources:[base,...filler,...real.filter(s=>s.episode===2)]};
}
describe('scene-aware selection retains the target while retrieving background',()=>{
  it('shows each selection batch the current exchange even when it contains only old sources',async()=>{
    const {plan,sources}=largeSources(20);
    const gen=vi.fn(async(_s:string,user:string)=>{
      const p=JSON.parse(user);
      expect(p.targetScene.some((s:any)=>s.text.includes('gate stays shut'))).toBe(true);
      return {ids:p.sources.filter((s:any)=>s.text.includes('promised')).map((s:any)=>s.id)};
    });
    const result=await selectWatchSources(question,plan,sources,gen);
    expect(result?.some(s=>s.text.includes('promised'))).toBe(true);
    expect(result?.some(s=>s.text.includes('gate stays shut'))).toBe(true);
    expect(gen.mock.calls.some(c=>JSON.parse(c[1]).sources.every((s:any)=>s.episode===1))).toBe(true);
  });
  it('uses the target exchange to search a large history and retains it even when selectors omit it',async()=>{
    const {plan,sources}=largeSources(100);
    const gen=vi.fn(async(_s:string,user:string,_t:number,_p?:string,format?:any)=>{
      const p=JSON.parse(user);
      expect(p.targetScene.some((s:any)=>s.text.includes('gate stays shut'))).toBe(true);
      if(format.json_schema.name==='companion_search_terms')return {terms:['north gate flood promise']};
      return {ids:p.sources.filter((s:any)=>s.text.includes('promised')).map((s:any)=>s.id)};
    });
    const result=await selectWatchSources(question,plan,sources,gen);
    expect(result?.some(s=>s.text.includes('promised'))).toBe(true);
    expect(result?.some(s=>s.text.includes('gate stays shut'))).toBe(true);
    expect(gen.mock.calls.some(c=>c[4]?.json_schema?.name==='companion_search_terms')).toBe(true);
  });
  it('keeps the target after global narrowing and applies the existing final context bound',async()=>{
    const {plan,sources}=largeSources(25);
    const current=sources.find(s=>s.episode===2)!;
    sources.push({...current,id:'qualification',start:150,end:170,text:'The earlier restriction still applies.'},
      {...current,id:'early-anchor',start:175,end:190,text:'The conversation returns to the warning.'});
    sources.sort((a,b)=>a.episode-b.episode||a.start-b.start);
    const gen=vi.fn(async(_s:string,user:string)=>{
      const p=JSON.parse(user);
      if(p.budgetCharacters){expect(p.requiredSourceIds.length).toBeGreaterThan(0);return {ids:['filler4']};}
      return {ids:p.sources.slice(0,8).map((s:any)=>s.id)};
    });
    const result=await selectWatchSources(question,plan,sources,gen);
    expect(result?.some(s=>s.text.includes('gate stays shut'))).toBe(true);
    expect(result?.some(s=>s.id==='filler4')).toBe(true);
    expect(result?.some(s=>s.id==='qualification')).toBe(true);
    expect(gen.mock.calls.some(c=>JSON.parse(c[1]).requiredSourceIds)).toBe(true);
  });
  it('rejects fabricated source IDs even when the current anchor is present',async()=>{
    const {plan,sources}=largeSources(20);
    expect(await selectWatchSources(question,plan,sources,vi.fn().mockResolvedValue({ids:['FORGED']}))).toBeNull();
  });
});
