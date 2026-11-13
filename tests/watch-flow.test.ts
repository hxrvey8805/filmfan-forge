import {describe,it,expect,vi} from 'vitest';
import {questionScope,recapWindows} from '../supabase/functions/_shared/question-scope';
import {watchSources} from '../supabase/functions/_shared/watch-context';
import {ambiguousQuestion,safeReferenceQuestion,watchAnswer,selectWatchSources} from '../supabase/functions/_shared/watch-answer';
import {answerWatchRequest} from '../supabase/functions/_shared/watch-service';
import {readPaged} from '../supabase/functions/_shared/paged-data';
import {safeHistory,type ViewingPosition,type SubtitleRecord,type Conversation} from '../supabase/functions/_shared/companion';
import type {CheckedResponse} from '../supabase/functions/_shared/companion-response';

const movie:ViewingPosition={tmdbId:123,mediaType:'movie',seconds:2520};
const tv:ViewingPosition={tmdbId:456,mediaType:'tv',seasonNumber:3,episodeNumber:2,seconds:2520};
const row=(p=movie,changes:Partial<SubtitleRecord>={}):SubtitleRecord=>({id:'r',tmdb_id:p.tmdbId,media_type:p.mediaType,season_number:p.seasonNumber??null,episode_number:p.episodeNumber??null,
  ingestion_version:3,source_file_id:11,cues:[{start:10,end:12,text:'Mira has no money for rent.'},{start:14,end:16,text:'Mira suggests sharing the cost.'},{start:2520,end:2522,text:'FUTURE_SECRET'}],...changes});
const conversation=(changes:Partial<Conversation>={}):Conversation=>({id:'c',title_id:456,media_type:'tv',season_number:3,episode_number:2,position_seconds:20,companion_version:3,question:'Why did Mira suggest sharing the rent?',answer:'DO_NOT_REUSE_THIS_MODEL_ANSWER',context:'',timestamp:'00:00:20',created_at:'2026-11-11T00:00:00Z',answer_status:'answered',evidence:[{id:'r',label:'r',start:10,end:16,season:3,episode:2}],...changes});

describe('fresh scope and explicit recap windows',()=>{
  it.each(['Recap everything so far.','Summarise the movie so far.','Catch me up.'])('%s covers the prefix',q=>expect(questionScope(q,movie).window).toMatchObject({start:0,end:2520}));
  it.each(['Recap the last ten minutes.','What happened in the previous 10 minutes?','Summarise the past 600 seconds.'])('%s covers the requested duration',q=>expect(questionScope(q,movie)).toMatchObject({intent:'recap',window:{start:1920,end:2520}}));
  it.each(['What happened between 10:00 and 25:00?','Recap from 10 to 25 minutes.','Summarise between ten and twenty minutes.'])('%s parses earlier ranges',q=>expect(questionScope(q,movie).window).toMatchObject({start:600,end:q.includes('twenty')?1200:1500}));
  it('clips the last hour to the beginning',()=>expect(questionScope('Recap the last hour.',movie).window).toMatchObject({start:0,end:2520}));
  it('recaps the last hour from a later position',()=>expect(questionScope('Recap the last hour.',{...movie,seconds:7200}).window).toMatchObject({start:3600,end:7200}));
  it.each(['Recap between 25:00 and 10:00.','Recap through 50:00.','Explain what happened at 50:00.','Recap season 4.','Recap S3E3.','Recap from 2:99 to 10:00.'])('does not extend the boundary: %s',q=>expect(questionScope(q,tv).clarification).toBeTruthy());
  it('a target is different from the knowledge cutoff',()=>expect(questionScope('Why did she say that at 05:00?',movie)).toMatchObject({boundary:{seconds:2520},window:{start:180,end:300}}));
  it('a stricter requested spoiler cutoff only reduces knowledge',()=>expect(questionScope('Explain it using only what was known at 15:00.',movie).boundary.seconds).toBe(900));
  it.each(['Why is Katharina in the past?','Remind me why caterina is in the past again','Catch me up on Katharina’s story.'])('ordinary phrasing opens permitted earlier context: %s',q=>expect(questionScope(q,tv).earlierStory).toBe(true));
  it('an explicit current-episode restriction stays current',()=>expect(questionScope('Why did he leave? Only this episode.',tv).earlierStory).toBe(false));
  it('whole-show recap includes earlier chapters and only the current prefix',()=>{
    const result=recapWindows(questionScope('Recap the whole show so far.',tv),[{season:1,count:2},{season:2,count:3}]);
    expect(result.catalogComplete).toBe(true);expect(result.windows).toHaveLength(7);expect(result.windows.at(-1)).toMatchObject({season:3,episode:2,end:2520});
  });
  it('an explicit season does not become the whole series',()=>{
    const r=recapWindows(questionScope('Remind me what happened in season two.',tv),[{season:2,count:3}]);
    expect(r.windows.map(w=>[w.season,w.episode])).toEqual([[2,1],[2,2],[2,3]]);
  });
  it('last three episodes excludes the currently partial episode',()=>expect(recapWindows(questionScope('Recap the last three episodes.',tv),[{season:1,count:2},{season:2,count:3}]).windows.map(w=>[w.season,w.episode])).toEqual([[2,2],[2,3],[3,1]]));
  it('specific earlier episode supports a range inside that episode',()=>expect(questionScope('Recap S1E2 between 10:00 and 25:00.',tv).window).toEqual({season:1,episode:2,start:600,end:1500}));
  it('unknown episode counts make whole-series coverage incomplete',()=>expect(recapWindows(questionScope('Recap the whole show.',tv),[]).catalogComplete).toBe(false));
  it('whole-show recap respects an earlier requested end in the current episode',()=>{
    const plan=questionScope('Recap the whole show up to 15:00.',tv);
    expect(recapWindows(plan,[{season:1,count:2},{season:2,count:3}]).windows.at(-1)).toMatchObject({season:3,episode:2,end:900});
    expect(plan.boundary.seconds).toBe(2520);
  });
  it('does not use a synthetic episode duration for a last-minutes request in an earlier episode',()=>
    expect(questionScope('Recap the last ten minutes of S1E1.',tv).clarification).toBeTruthy());
  it('asks which episode a time in a previous-season recap refers to',()=>
    expect(questionScope('Recap season two up to 15:00.',tv).clarification).toBeTruthy());
});

describe('source provenance and chronology before selection',()=>{
  it('retains complete context, but excludes a cue that finishes after the cutoff',()=>{
    const src=watchSources(questionScope('Why did Mira suggest that?',movie),[row(),row({...movie,tmdbId:999},{id:'wrong-title'})],[]);
    expect(src.map(s=>s.text).join(' ')).toContain('Mira has no money for rent.');
    expect(JSON.stringify(src)).not.toContain('FUTURE_SECRET');expect(src).toHaveLength(1);
  });
  it('excludes the lower bound crossing cue as well as future cues in a recap',()=>{
    const plan=questionScope('Recap between 00:13 and 00:20.',movie);
    const src=watchSources(plan,[row()],[],plan.window);
    expect(src.map(s=>s.text).join(' ')).toBe('Mira suggests sharing the cost.');
  });
  it('rejects conflicting subtitle clocks before selection',()=>expect(watchSources(questionScope('Why?',movie),[row(),row(movie,{id:'second-cut',source_file_id:22})],[])).toEqual([]));
  it('previous episodes can supply context but the next episode cannot',()=>{
    const src=watchSources(questionScope('Why did Mira suggest that?',tv),[row(tv),row({...tv,episodeNumber:1},{id:'earlier'}),row({...tv,episodeNumber:3},{id:'future'})],[]);
    expect(new Set(src.map(s=>s.episode))).toEqual(new Set([1,2]));
    expect(src.filter(s=>s.episode===1).every(s=>s.evidence.id.startsWith('series:456:3:1:v3:'))).toBe(true);
  });
  it('a requested future window cannot bypass the source boundary',()=>expect(watchSources(questionScope('Recap.',tv),[row(tv)],[],{season:4,episode:1,start:0,end:5})).toEqual([]));
  it('shared cuts unlock the later of both reveal times',()=>{
    const p={tmdbId:66573,mediaType:'tv' as const,seasonNumber:1,episodeNumber:1,seconds:658};
    expect(JSON.stringify(watchSources(questionScope('Why?',p),[],[]))).not.toContain('lawyer');
    const after={...p,seconds:659};expect(JSON.stringify(watchSources(questionScope('Why?',after),[],[]))).toContain('lawyer');
  });
  it('episode-level story facts are unavailable until the source episode has ended',()=>{
    const p={tmdbId:70523,mediaType:'tv' as const,seasonNumber:2,episodeNumber:8,seconds:1};
    expect(watchSources(questionScope('Why is Katharina in the past?',p),[],[])).toEqual([]);
    const after={...p,seasonNumber:3,episodeNumber:1,seconds:0};expect(watchSources(questionScope('Why is Katharina in the past?',after),[],[]).length).toBeGreaterThan(0);
  });
});

describe('continuity resolves references without importing model claims',()=>{
  it('only the previous user question crosses into the reference field',()=>{
    expect(safeReferenceQuestion('Why did she do that?',[conversation()],tv)).toBe(conversation().question);
    expect(safeReferenceQuestion('What is the captain’s name?',[conversation()],tv)).toBeUndefined();
  });
  it.each([{...tv,seconds:19},{...tv,episodeNumber:1},{...tv,episodeNumber:3},{...tv,tmdbId:999}])('drops reference context after changing scope: %j',p=>expect(safeReferenceQuestion('Why did she do that?',[conversation()],p)).toBeUndefined());
  it('an ambiguous question asks a short clarification instead of a generic refusal',async()=>{
    const gen=vi.fn();const q='Remind me why he did that.';
    expect((await watchAnswer(q,questionScope(q,tv),[],gen)).answer).toBe('Which person and moment do you mean?');expect(gen).not.toHaveBeenCalled();
  });
  it('ordinary earlier-story citations remain in their own episode conversation',()=>{
    const c=conversation({question:'Why is Mira here?',evidence:[{id:'series:456:3:1:v3:reviewed:reason',label:'earlier',season:3,episode:1,start:0,end:40}]});
    expect(safeHistory([c],tv)).toHaveLength(1);expect(safeHistory([c],{...tv,episodeNumber:1})).toEqual([]);
  });
});

describe('one explanation route and bounded semantic selection',()=>{
  const genFor=(text='Sharing the cost makes the rent more affordable.')=>vi.fn(async(_system:string,user:string)=>{
    const packet=JSON.parse(user),s=packet.sources.find((s:{text:string})=>s.text.includes('rent'))??packet.sources[0];
    const support=packet.points?[{id:s.id,firstLine:1,lastLine:s.text.split('\n').length}]:[{id:s.id,quote:s.text}];
    return packet.points?{boundarySafe:true,fit:'direct',checks:packet.points.map((_:unknown,index:number)=>({index,supported:true,issue:'none',attribution:'none',support}))}:{points:[{text,support}]};
  });
  it.each(['Why did Mira suggest sharing?','Remind me why Mira suggested sharing.','What does sharing the cost achieve?'])('same complete evidence reaches writer and checker: %s',async q=>{
    const gen=genFor(),plan=questionScope(q,movie),sources=watchSources(plan,[row()],[]);
    const result=await watchAnswer(q,plan,sources,gen);
    expect(result.answer).toContain('affordable');expect(result.limited).toBeUndefined();expect(gen).toHaveBeenCalledTimes(2);
    const reviewed=JSON.parse(gen.mock.calls[1][1]).sources.map((s:{text:string})=>({...s,text:s.text.split('\n').map(line=>line.replace(/^\[\d+\] /,'')).join('\n')}));
    expect(JSON.parse(gen.mock.calls[0][1]).sources).toEqual(reviewed);
    expect(JSON.stringify(gen.mock.calls)).not.toContain('FUTURE_SECRET');
  });
  it('zero-time recap is an empty state, not a data error',async()=>{
    const q='Recap so far.',p={...movie,seconds:0},gen=vi.fn();
    expect((await watchAnswer(q,questionScope(q,p),[],gen)).answer).toContain('beginning');expect(gen).not.toHaveBeenCalled();
  });
  it('identifies missing visual coverage without adopting an unverified visual premise',async()=>{
    const q='Why is he staring at the secret weapon?',gen=vi.fn();
    const result=await watchAnswer(q,questionScope(q,movie),[],gen);
    expect(result.answer).toContain('visual context');expect(result.answer).not.toContain('weapon');
    expect(result.limited).toBe(true);expect(gen).not.toHaveBeenCalled();
  });
  it('does not silently sample a recap larger than the supported batch limit',async()=>{
    const plan=questionScope('Recap.',movie),base=watchSources(plan,[row()],[])[0];
    const sources=Array.from({length:200},(_,i)=>({...base,id:'S'+i,text:'A'.repeat(1100)}));const gen=vi.fn();
    expect((await watchAnswer('Recap.',plan,sources,gen)).limited).toBe(true);expect(gen).not.toHaveBeenCalled();
  });
  it('recap bounds include overlapping scene notes through their actual reveal time',async()=>{
    const plan=questionScope('Recap.',movie),base=watchSources(plan,[row()],[])[0],gen=genFor();
    const sources=[{...base,id:'note',kind:'visual' as const,start:0,end:200},
      {...base,id:'dialogue',start:100,end:150}];
    await watchAnswer('Recap.',plan,sources,gen);
    expect(JSON.parse(gen.mock.calls[0][1]).request.target).toMatchObject({start:0,end:200});
  });
  it('a semantic selector cannot introduce a source ID',async()=>{
    const plan=questionScope('Why?',movie),base=watchSources(plan,[row()],[])[0];
    const sources=Array.from({length:20},(_,i)=>({...base,id:'S'+i,text:'A'.repeat(1100)}));
    expect(await selectWatchSources('Why?',plan,sources,vi.fn().mockResolvedValue({ids:['FUTURE']}))).toBeNull();
  });
  it.each(['valid','forged','too-large'])('reranks oversized relevance unions with complete nearby context: %s',async mode=>{
    const plan=questionScope('Why?',movie),base=watchSources(plan,[row()],[])[0];
    const sources=Array.from({length:24},(_,i)=>({...base,id:'S'+i,start:i*10,end:i*10+9,text:'A'.repeat(1300)}));
    const gen=vi.fn(async(_system:string,user:string)=>{
      const packet=JSON.parse(user);
      if(packet.budgetCharacters)return {ids:mode==='forged'?['FUTURE']:mode==='too-large'?['S1','S4','S7','S10','S13','S16','S19','S22']:['S4']};
      return {ids:packet.sources.slice(0,8).map((s:{id:string})=>s.id)};
    });
    const selected=await selectWatchSources('Why?',plan,sources,gen);
    if(mode==='valid')expect(selected?.map(s=>s.id)).toEqual(['S3','S4','S5']);
    else expect(selected).toBeNull();
    expect(JSON.parse(gen.mock.calls.at(-1)![1]).budgetCharacters).toBe(19000);
  });
  it('later permitted dialogue cannot masquerade as coverage of an earlier target scene',async()=>{
    const q='What happened here at 05:00?',plan=questionScope(q,movie),gen=vi.fn();
    const sources=watchSources(plan,[row(movie,{cues:[{start:900,end:910,text:'A later exchange.'}]})],[]);
    expect(plan.intent).toBe('scene');expect((await watchAnswer(q,plan,sources,gen)).limited).toBe(true);expect(gen).not.toHaveBeenCalled();
  });
  it('uses the same current cutoff to resolve safe follow-ups',async()=>{
    const gen=genFor(),store={current:vi.fn().mockResolvedValue({records:[row(tv)],notes:[]}),earlier:vi.fn().mockResolvedValue({records:[],notes:[]}),seasons:vi.fn().mockResolvedValue([])};
    await answerWatchRequest('Why did she do that?',tv,[conversation()],gen,store);
    expect(JSON.parse(gen.mock.calls[0][1]).request.referenceQuestion).toBe(conversation().question);
    expect(JSON.stringify(gen.mock.calls)).not.toContain('DO_NOT_REUSE_THIS_MODEL_ANSWER');
  });
});

describe('source pagination and recap cache isolation',()=>{
  it('continues beyond the service’s default row ceiling',async()=>{
    const values=Array.from({length:1501},(_,i)=>i),range=vi.fn(async(a:number,b:number)=>({data:values.slice(a,b+1),error:null}));
    expect(await readPaged({range},2000)).toEqual({rows:values,incomplete:false});expect(range).toHaveBeenCalledTimes(2);
  });
  it('detects overflow using an extra row',async()=>{
    const range=vi.fn(async(a:number,b:number)=>({data:Array.from({length:b-a+1},(_,i)=>a+i),error:null}));
    expect(await readPaged({range},1000)).toMatchObject({incomplete:true});expect(range).toHaveBeenLastCalledWith(1000,1000);
  });
  it('propagates a failed page rather than labelling a truncated source complete',async()=>{
    await expect(readPaged({range:async()=>({data:null,error:new Error('source outage')})},1000)).rejects.toThrow('source outage');
  });
  it('does not put user wording into a shared episode chapter',async()=>{
    const p={...tv,seasonNumber:1,episodeNumber:2,seconds:0};
    const inputs:string[]=[];const gen=vi.fn(async(_s:string,u:string)=>{inputs.push(u);return {points:[]};});
    const store={current:vi.fn(async(at:ViewingPosition)=>({records:[row(at)],notes:[]})),earlier:vi.fn(),seasons:vi.fn(),chapter:vi.fn().mockResolvedValue(null),saveChapter:vi.fn()};
    await answerWatchRequest('Recap episode one. PRIVATE_USER_WORDING',p,[],gen,store);
    expect(inputs.length).toBeGreaterThan(0);expect(inputs.join(' ')).not.toContain('PRIVATE_USER_WORDING');
  });
  it('finishes a multi-episode recap when earlier chapters have missing coverage',async()=>{
    const p={...tv,seasonNumber:1,episodeNumber:4,seconds:0};
    const chapters=new Map<number,CheckedResponse>(),gen=vi.fn();
    const store={
      current:vi.fn(async()=>({records:[],notes:[]})),earlier:vi.fn(),seasons:vi.fn(),
      chapter:async(at:ViewingPosition)=>chapters.get(at.episodeNumber!)??null,
      saveChapter:async(at:ViewingPosition,result:CheckedResponse)=>{chapters.set(at.episodeNumber!,result);},
      prepareLater:()=>{throw new Error('preparing');},
    };
    await expect(answerWatchRequest('Recap the whole show so far.',p,[],gen,store)).rejects.toThrow('preparing');
    expect([...chapters.keys()]).toEqual([1,2]);
    const result=await answerWatchRequest('Recap the whole show so far.',p,[],gen,store);
    expect(result.limited).toBe(true);expect(result.evidence).toEqual([]);
    for(const episode of [1,2,3])expect(result.answer).toContain(`S1E${episode}`);
    expect(store.current).toHaveBeenCalledTimes(3);expect(gen).not.toHaveBeenCalled();
  });
  it('rejects an empty successful chapter instead of serving it as a verified recap',async()=>{
    const p={...tv,seasonNumber:1,episodeNumber:2,seconds:0};
    const store={current:vi.fn(async()=>({records:[],notes:[]})),earlier:vi.fn(),seasons:vi.fn(),
      chapter:vi.fn().mockResolvedValue({answer:'Unverified claim.',evidence:[]}),saveChapter:vi.fn()};
    const result=await answerWatchRequest('Recap episode one.',p,[],vi.fn(),store);
    expect(store.current).toHaveBeenCalledOnce();expect(result.answer).not.toContain('Unverified claim.');expect(result.limited).toBe(true);
  });
});
