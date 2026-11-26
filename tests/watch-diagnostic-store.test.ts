import {describe,it,expect,vi} from 'vitest';
import {diagnosticMetadata,retainedWatchDiagnostics} from '../supabase/functions/_shared/watch-diagnostic-store';
import {storyDiscussion,type StoryDiscussionContext} from '../supabase/functions/_shared/story-discussion';
import type {WatchDiagnostic} from '../supabase/functions/_shared/watch-diagnostics';

describe('content-free retained diagnostics',()=>{
  it('strips untrusted fields, invalid categories and non-finite counts before persistence',()=>{
    const event={stage:'review_rejected',attempt:1,issues:['identity','SECRET','identity'],text:'PRIVATE_ANSWER',caption:'PRIVATE_CAPTION',
      inputHash:'SECRET_TOKEN',elapsedMs:Infinity,reason:'PRIVATE_REASON'} as unknown as WatchDiagnostic;
    expect(diagnosticMetadata(event)).toEqual({stage:'review_rejected',attempt:1,issues:['identity']});
  });
  it('preserves the opening source counts and final rejection when the buffer fills',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:true,error:null}),d=retainedWatchDiagnostics(rpc,'user','request','attempt');
    d.observe({stage:'sources_ready',sources:55,episodes:2});
    for(let i=0;i<300;i++)d.observe({stage:'model_call',call:i,phase:'writer',state:'returned',inputHash:'a'.repeat(64),elapsedMs:10});
    d.observe({stage:'answer_gap',reason:'explanation_rejected'});
    await d.flush();await d.flush();
    expect(rpc).toHaveBeenCalledTimes(1);
    const payload=rpc.mock.calls[0][1];
    expect(payload.p_events).toHaveLength(256);expect(payload.p_dropped).toBe(46);
    expect(payload.p_events[0]).toEqual({stage:'sources_ready',sources:55,episodes:2});
    expect(payload.p_events.at(-1)).toEqual({stage:'answer_gap',reason:'explanation_rejected'});
  });
  it('never changes answers or provider calls if diagnostic storage and console logging fail',async()=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try {
      const rpc=vi.fn().mockRejectedValue(Error('SECRET_TOKEN'));
      const d=retainedWatchDiagnostics(rpc,'user','request','attempt',()=>{throw Error('logger failed');});
      const ctx:StoryDiscussionContext={question:'Why the argument?',boundary:{season:1,episode:2,seconds:1200},sources:[
        {id:'S',text:'You blame me, but you brought them here.',end:1199,season:1,episode:2},
      ]};
      const text='They disagree about who is responsible.',support=[{id:'S',firstLine:1,lastLine:1}];
      const draft={points:[{text,support}]},review={boundarySafe:true,fit:'direct',checks:[{index:0,supported:true,issue:'none',attribution:'none',support}]};
      const generate=()=>vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review);
      const before=generate(),after=generate();
      expect(await storyDiscussion(ctx,after,d.observe)).toEqual(await storyDiscussion(ctx,before));
      expect(after.mock.calls).toEqual(before.mock.calls);
      await expect(d.flush()).resolves.toBeUndefined();
      expect(JSON.stringify(warning.mock.calls)).not.toContain('SECRET');
    } finally {warning.mockRestore();}
  });
});
