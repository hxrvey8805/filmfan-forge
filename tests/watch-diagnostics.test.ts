import {describe,it,expect,vi} from 'vitest';
import {storyDiscussion,type StoryDiscussionContext} from '../supabase/functions/_shared/story-discussion';
import {traceWatchGenerator,type WatchDiagnostic} from '../supabase/functions/_shared/watch-diagnostics';
import {answerWatchRequest} from '../supabase/functions/_shared/watch-service';
import type {ViewingPosition,SubtitleRecord} from '../supabase/functions/_shared/companion';

const ctx:StoryDiscussionContext={question:'What were the other jobs?',boundary:{season:1,episode:5,seconds:1507},
  request:{intent:'answer',target:{season:1,episode:5,start:0,end:1507}},sources:[
    {id:'S1',text:'PASSAGE GUIDE\nInternet café: power outlet\nPub: fryer',season:1,episode:4,end:120,historicalDialogue:true},
  ]};
const text='The passage-finding instructions list an internet café and a pub as job locations.';
const support=[{id:'S1',firstLine:1,lastLine:3}];
const draft={points:[{text,support}]};
const review={boundarySafe:true,fit:'direct',checks:[{index:0,supported:true,issue:'none',attribution:'none',support}]};

describe('diagnosing rejected explanations without logging story content',()=>{
  it('sends instruction wording through independent review rather than an unnecessary rewrite',async()=>{
    const events:WatchDiagnostic[]=[];
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review);
    expect((await storyDiscussion(ctx,gen,e=>events.push(e)))?.answer).toBe(text);
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','verifier']);
    expect(events).toEqual([{stage:'answer_accepted',attempt:1,paragraphs:1,partial:false}]);
  });
  it('still withholds those same words when independent review rejects their meaning',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({...review,boundarySafe:false}).mockResolvedValueOnce({points:[]});
    const events:WatchDiagnostic[]=[];
    expect(await storyDiscussion(ctx,gen,e=>events.push(e))).toBeNull();
    expect(events).toContainEqual({stage:'review_rejected',attempt:1,issues:['spoiler']});
  });
  it.each([
    [{id:'future',firstLine:1,lastLine:1},'receipt_source'],
    [{id:'S1',firstLine:1,lastLine:900},'receipt_range'],
    [{id:'S1',firstLine:1,lastLine:1,quote:'SECRET'},'receipt_mixed_format'],
    [{id:'S1',quote:'SECRET'},'receipt_mismatch'],
  ])('identifies bad writer receipts without logging their contents: %j',async(bad,reason)=>{
    const events:WatchDiagnostic[]=[];
    const gen=vi.fn().mockResolvedValue({points:[{text,support:[bad]}]});
    expect(await storyDiscussion(ctx,gen,e=>events.push(e))).toBeNull();
    expect(events).toContainEqual({stage:'writer_invalid',attempt:1,reason});
    expect(events.at(-1)).toEqual({stage:'answer_exhausted'});
    expect(JSON.stringify(events)).not.toMatch(/SECRET|future|PASSAGE|internet/);
    const retry=gen.mock.calls[1][0];
    expect(retry).toContain('Select valid source IDs and firstLine/lastLine ranges');
    expect(retry).not.toContain('Supply exact quotes');
  });
  it('distinguishes a reviewer receipt failure from a writer failure',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValue({...review,checks:[{...review.checks[0],support:[{id:'S1',firstLine:99,lastLine:99}]}]});
    const events:WatchDiagnostic[]=[];
    expect(await storyDiscussion(ctx,gen,e=>events.push(e))).toBeNull();
    expect(events).toContainEqual({stage:'review_invalid',attempt:1,reason:'receipt_range'});
    expect(events.some(e=>e.stage==='writer_invalid')).toBe(false);
  });
  it('rejects a future source before any generation even if logging fails',async()=>{
    const gen=vi.fn(),events:WatchDiagnostic[]=[];
    const observe=(e:WatchDiagnostic)=>{events.push(e);throw Error('logging unavailable');};
    expect(await storyDiscussion({...ctx,sources:[{...ctx.sources[0],episode:6}]},gen,observe)).toBeNull();
    expect(events).toEqual([{stage:'context_rejected',reason:'source_boundary'}]);
    expect(gen).not.toHaveBeenCalled();
  });
  it('does not change an accepted answer when logging fails',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review);
    expect((await storyDiscussion(ctx,gen,()=>{throw Error('logging unavailable');}))?.answer).toBe(text);
  });
  it('traces selection failures all the way through the request service',async()=>{
    const p:ViewingPosition={tmdbId:123,mediaType:'tv',seasonNumber:1,episodeNumber:1,seconds:5000};
    const rows:SubtitleRecord[]=Array.from({length:60},(_,i)=>({id:'r'+i,tmdb_id:123,media_type:'tv',season_number:1,episode_number:1,ingestion_version:3,source_file_id:7,
      cues:[{start:i*60,end:i*60+10,text:'PRIVATE SOURCE '+('One location for a temporary job. '.repeat(20))}]}));
    const events:WatchDiagnostic[]=[];
    const gen=vi.fn().mockResolvedValue({ids:['NOT_A_SOURCE']});
    const result=await answerWatchRequest('What jobs?',p,[],gen,{current:async()=>({records:rows,notes:[]}),earlier:async()=>({records:[],notes:[]}),seasons:async()=>[]},e=>events.push(e));
    expect(result.limited).toBe(true);
    expect(events).toContainEqual({stage:'selection_invalid',reason:'batch_selection'});
    expect(events.at(-1)).toEqual({stage:'answer_gap',reason:'no_selection'});
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE|NOT_A_SOURCE/);
  });
});

describe('private model request fingerprints',()=>{
  it('preserves inputs and outputs, fingerprints scope changes, and never logs content',async()=>{
    const events:WatchDiagnostic[]=[];
    const output={untrusted:'SECRET_DRAFT'},gen=vi.fn().mockResolvedValue(output);
    const traced=traceWatchGenerator(gen,e=>events.push(e));
    const args=['PRIVATE_SYSTEM',JSON.stringify(ctx),1600,'writer'] as const;
    expect(await traced(...args)).toBe(output);
    await traced(...args);
    await traced(args[0],JSON.stringify({...ctx,boundary:{...ctx.boundary,seconds:300}}),1600,'writer');
    await traced(args[0],JSON.stringify({...ctx,boundary:{...ctx.boundary,episode:2}}),1600,'writer');
    expect(gen.mock.calls[0]).toEqual(args);
    const starts=events.filter(e=>e.stage==='model_call'&&e.state==='started');
    expect(starts.map(e=>e.call)).toEqual([1,2,3,4]);
    expect(starts[0].inputHash).toBe(starts[1].inputHash);
    expect(new Set(starts.map(e=>e.inputHash)).size).toBe(3);
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_SYSTEM|SECRET_DRAFT|PASSAGE|What were/);
  });
  it('preserves provider errors without recording their potentially sensitive messages',async()=>{
    const events:WatchDiagnostic[]=[];
    const error=Error('SECRET_TOKEN'),gen=vi.fn().mockRejectedValue(error);
    await expect(traceWatchGenerator(gen,e=>events.push(e))('system','question',100,'writer')).rejects.toBe(error);
    expect(events.at(-1)).toMatchObject({stage:'model_call',state:'failed'});
    expect(JSON.stringify(events)).not.toContain('SECRET_TOKEN');
  });
});
