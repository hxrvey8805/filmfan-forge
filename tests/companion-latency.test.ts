import {afterEach,describe,expect,it,vi} from 'vitest';
import {orderedWork} from '../supabase/functions/_shared/ordered-work';
import {resumeWatchGenerator,type WatchCheckpoints} from '../supabase/functions/_shared/watch-checkpoints';
import {CompanionWorkDeferred,modelCallSignal} from '../supabase/functions/_shared/companion-work';
import {solBudgetedFetch,solGenerator} from '../supabase/functions/_shared/openrouter-sol';
import {SOL_ENDPOINT,SOL_RESOLVED_MODEL} from '../supabase/functions/_shared/sol-budget';
import {storyDiscussion,type StoryDiscussionContext} from '../supabase/functions/_shared/story-discussion';
import {selectWatchSources} from '../supabase/functions/_shared/watch-answer';
import {questionScope} from '../supabase/functions/_shared/question-scope';
import type {WatchSource} from '../supabase/functions/_shared/watch-context';

const journal=()=>{
  const entries:Record<string,{value:unknown}>={};
  const store:WatchCheckpoints={load:async()=>structuredClone(entries),save:async(key,value)=>{entries[key]={value:structuredClone(value)};}};
  return {entries,store};
};
const budget=()=>({reserve:vi.fn().mockResolvedValue(true),settle:vi.fn().mockResolvedValue(undefined)});
const receipt=()=>new Response(JSON.stringify({id:'gen',model:SOL_RESOLVED_MODEL,provider:'OpenAI',usage:{cost:.001},
  choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}));
afterEach(()=>vi.useRealTimers());

describe('parallel work preserves order and drains failures',()=>{
  it('runs two independent calls concurrently, returns original order and stops admitting after failure',async()=>{
    const resolvers:(()=>void)[]=[],started:number[]=[];
    const result=orderedWork([0,1,2,3],2,async i=>{
      started.push(i);await new Promise<void>(resolve=>{resolvers[i]=resolve;});
      if(i===1)throw Error('failed');return i;
    });
    let finished=false;const checked=expect(result).rejects.toThrow('failed').then(()=>{finished=true;});
    expect(started).toEqual([0,1]);resolvers[1]();await Promise.resolve();await Promise.resolve();
    expect(finished).toBe(false);expect(started).toEqual([0,1]);resolvers[0]();await checked;
    expect(started).toEqual([0,1]);
    expect(await orderedWork([3,2,1],2,async i=>i*10)).toEqual([30,20,10]);
  });
  it('replays observed independent selection durations without changing any job',async()=>{
    vi.useFakeTimers();const durations=[1930,4250,3670,4580,5270,1840];
    const run=async(concurrency:number)=>{
      const start=Date.now();const result=orderedWork(durations,concurrency,async(ms,i)=>{
        await new Promise(resolve=>setTimeout(resolve,ms));return i;
      });await vi.runAllTimersAsync();return {output:await result,elapsed:Date.now()-start};
    };
    const serial=await run(1),parallel=await run(2);
    expect(parallel.output).toEqual(serial.output);expect(serial.elapsed).toBe(21540);expect(parallel.elapsed).toBe(10870);
  });
  it('stops scheduling more batches after an invalid selection, draining the other call first',async()=>{
    const p={tmdbId:1,mediaType:'tv' as const,seasonNumber:1,episodeNumber:1,seconds:3000};
    const sources:WatchSource[]=Array.from({length:180},(_,i)=>({id:'S'+i,text:'They discuss the rent.',
      start:i*10,end:i*10+5,season:1,episode:1,kind:'dialogue',evidence:{id:'E'+i,label:'Caption',start:i*10,end:i*10+5,season:1,episode:1}}));
    let finish!:()=>void;
    const generate=vi.fn().mockResolvedValueOnce(null).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({ids:[]});}));
    const result=selectWatchSources('What are the rent jobs?',questionScope('What are the rent jobs?',p),sources,generate);
    let done=false;const drained=result.then(value=>{done=true;return value;});
    await Promise.resolve();await Promise.resolve();
    expect(generate).toHaveBeenCalledTimes(2);expect(done).toBe(false);
    finish();expect(await drained).toBeNull();expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe('question-private continuation',()=>{
  it('replays only identical completed inputs; changed context, cutoff, question and occurrence miss',async()=>{
    const j=journal(),fresh=vi.fn().mockResolvedValue({answer:'draft'});
    const first=resumeWatchGenerator(fresh,j.store);
    const args=['system','{"seconds":60,"question":"Why?","sources":["safe"]}',100,'writer'] as const;
    await first(...args);const next=resumeWatchGenerator(fresh,j.store);
    expect(await next(...args)).toEqual({answer:'draft'});expect(fresh).toHaveBeenCalledTimes(1);
    await next(...args);expect(fresh).toHaveBeenCalledTimes(2);
    for(const changed of [args[1].replace('60','59'),args[1].replace('safe','different'),args[1].replace('Why?','How?')])await next(args[0],changed,100,'writer');
    expect(fresh).toHaveBeenCalledTimes(5);
    await resumeWatchGenerator(fresh,journal().store)(...args);expect(fresh).toHaveBeenCalledTimes(6);
  });
  it('never checkpoints failed calls or skips the independent reviewer on resume',async()=>{
    const ctx:StoryDiscussionContext={question:'Why?',boundary:{season:1,episode:1,seconds:20},
      request:{intent:'answer',target:{season:1,episode:1,start:0,end:20}},sources:[{id:'S1',text:'They agree to share the rent.',season:1,episode:1,end:10}]};
    const support=[{id:'S1',firstLine:1,lastLine:1}],draft={points:[{text:'They agree to share the rent.',support}]};
    const j=journal(),fresh=vi.fn().mockResolvedValueOnce(draft).mockRejectedValueOnce(new CompanionWorkDeferred());
    await expect(storyDiscussion(ctx,resumeWatchGenerator(fresh,j.store))).rejects.toBeInstanceOf(CompanionWorkDeferred);
    expect(Object.keys(j.entries)).toHaveLength(1);
    const review=vi.fn().mockResolvedValue({boundarySafe:false,fit:'direct',checks:[{index:0,supported:false,issue:'spoiler',attribution:'none',support}]});
    // A cached draft is untrusted: a spoiler rejection must still withhold it.
    expect(await storyDiscussion(ctx,resumeWatchGenerator(review,j.store))).toBeNull();
    expect(review.mock.calls[0][3]).toBe('verifier');
  });
  it('finishes a deferred check with the same answer and no second writer call',async()=>{
    const j=journal(),first=resumeWatchGenerator(vi.fn().mockResolvedValueOnce({draft:'same'}).mockRejectedValueOnce(new CompanionWorkDeferred()),j.store);
    await first('write','source',100,'writer');await expect(first('review','draft',100,'verifier')).rejects.toThrow();
    const fresh=vi.fn().mockResolvedValue({verified:true}),next=resumeWatchGenerator(fresh,j.store);
    expect(await next('write','source',100,'writer')).toEqual({draft:'same'});
    expect(await next('review','draft',100,'verifier')).toEqual({verified:true});
    expect(fresh.mock.calls.map(c=>c[3])).toEqual(['verifier']);
  });
  it('resumes the observed 36s draft / 52s rejection without changing repair prompts or skipping review',async()=>{
    vi.useFakeTimers();
    const ctx:StoryDiscussionContext={question:'Recap this section.',boundary:{season:2,episode:7,seconds:1489},
      request:{intent:'recap',target:{season:2,episode:7,start:0,end:1489}},sources:[{id:'S1',text:'They agree to share the rent.',season:2,episode:7,end:10}]};
    const support=[{id:'S1',firstLine:1,lastLine:1}],draft={points:[{text:'They agree to share the rent.',support}]};
    const rejected={boundarySafe:true,fit:'direct',checks:[{index:0,supported:false,issue:'speaker',attribution:'uncertain',support}]};
    const accepted={boundarySafe:true,fit:'direct',checks:[{index:0,supported:true,issue:'none',attribution:'none',support}]};
    const outputs=[draft,rejected,draft,accepted];
    const baseline=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(rejected).mockResolvedValueOnce(draft).mockResolvedValueOnce(accepted);
    const expected=await storyDiscussion(ctx,baseline);
    expect(expected?.answer).toContain('share the rent');
    const b=budget(),calls:unknown[][]=[],j=journal();let n=0;
    const makeWorker=()=>{
      const model=solGenerator('test',b,vi.fn<typeof fetch>().mockImplementation(async()=>{
        const index=n++;vi.advanceTimersByTime([36460,52220,8000,10000][index]);
        return new Response(JSON.stringify({id:'gen-'+index,model:SOL_RESOLVED_MODEL,provider:'OpenAI',usage:{cost:.001},
          choices:[{finish_reason:'stop',message:{content:JSON.stringify(outputs[index])}}]}));
      }));
      return resumeWatchGenerator(async(...args)=>{
        // Only record successful calls; a refused dispatch is not a new AI output.
        const value=await model(...args);calls.push(args);return value;
      },j.store);
    };
    await expect(storyDiscussion(ctx,makeWorker())).rejects.toBeInstanceOf(CompanionWorkDeferred);
    expect(b.reserve).toHaveBeenCalledTimes(2);expect(Object.keys(j.entries)).toHaveLength(2);
    expect(await storyDiscussion(ctx,makeWorker())).toEqual(expected);
    expect(calls).toEqual(baseline.mock.calls);expect(b.reserve).toHaveBeenCalledTimes(4);
    expect(b.settle.mock.calls.every(c=>c[3]===null)).toBe(true);
  });
});

describe('deadline admission and billing',()=>{
  it('does not launch or reserve the observed last-second repair',async()=>{
    vi.useFakeTimers();const b=budget(),network=vi.fn<typeof fetch>().mockImplementation(async()=>receipt());
    const gen=solGenerator('test',b,network);await gen('write','safe',100,'writer');
    vi.advanceTimersByTime(88900);
    await expect(gen('repair','safe',100,'writer')).rejects.toBeInstanceOf(CompanionWorkDeferred);
    expect(network).toHaveBeenCalledOnce();expect(b.reserve).toHaveBeenCalledOnce();
    expect(b.settle.mock.calls[0][3]).toBeNull();
  });
  it('settles exactly zero when a budget queue consumes the remaining dispatch window',async()=>{
    vi.useFakeTimers();const b=budget(),network=vi.fn<typeof fetch>();
    b.reserve.mockImplementation(async()=>{vi.advanceTimersByTime(82000);return true;});
    await expect(solGenerator('test',b,network)('write','safe',100,'writer')).rejects.toBeInstanceOf(CompanionWorkDeferred);
    expect(network).not.toHaveBeenCalled();expect(b.settle).toHaveBeenCalledWith(expect.any(String),0,null,null);
  });
  it('does not reserve an already-aborted signal',async()=>{
    const b=budget(),network=vi.fn<typeof fetch>(),request=solBudgetedFetch(b,network);
    const signal=AbortSignal.abort();
    await expect(request(SOL_ENDPOINT,{method:'POST',body:JSON.stringify({messages:[{content:'safe'}],max_tokens:4096,
      plugins:['web','response-healing','context-compression','file-parser','pareto-router','fusion'].map(id=>({id,enabled:false}))}),signal})).rejects.toBeInstanceOf(CompanionWorkDeferred);
    expect(b.reserve).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
  });
});
