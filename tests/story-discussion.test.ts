import { describe, expect, it, vi } from 'vitest';
import { storyDiscussion, type StoryDiscussionContext } from '../supabase/functions/_shared/story-discussion';
import { captionIdentityWords, draftGroundingIssues } from '../supabase/functions/_shared/draft-grounding';

it('recognizes systematic OCR letter confusion without fuzzy matching other names',()=>{
  const text='The pIace is cIose. We taIk about EmiIio Rebenga.';
  expect(captionIdentityWords(text).has('emilio')).toBe(true);
  expect(captionIdentityWords(text).has('emilia')).toBe(false);
  expect(captionIdentityWords('McIntyre met EmiIio.').has('mclntyre')).toBe(false);
  const evidence=[{id:'R1',text,start:0,end:1,season:1,episode:1}];
  const draft=(name:string)=>({status:'answered' as const,claims:[{text:`The subject is ${name} Rebenga.`,evidenceIds:['R1']}]});
  expect(draftGroundingIssues('Who?',draft('Emilio'),evidence)).not.toContain('identity');
  expect(draftGroundingIssues('Who?',draft('Emilia'),evidence)).toContain('identity');
});

const context: StoryDiscussionContext = {question:'Remind me why Mira suggested sharing a flat.',
  boundary:{season:1,episode:2,seconds:0},sources:[
    {id:'R1',text:'I cannot afford the rent alone. Why not share a flat?',season:1,episode:1,end:40,historicalDialogue:true},
    {id:'R2',text:'Mira suggests sharing a flat to reduce the rent.',season:1,episode:1,end:41},
  ]};
const draft = (text='Mira suggests sharing a flat to make the rent affordable.') => ({points:[{text,
  support:[{id:'R1',quote:'Why not share a flat?'}]}]});
const check = (changes:Record<string,unknown> = {}) => ({boundarySafe:true,fit:'direct',checks:[{
  index:0,supported:true,issue:'none',attribution:'contextual',support:[{id:'R2',quote:context.sources[1].text}],...changes,
}]});

describe('contextual story explanations with independent receipts',()=>{
  it('lets the writer cite typo-containing original lines without retyping them, then independently checks them',async()=>{
    const text='The office is above the COVENIENCE STORE.\nMira suggests sharing a flat to reduce the rent.';
    const ctx={...context,sources:[context.sources[0],{...context.sources[1],text}]};
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:draft().points[0].text,support:[{id:'R2',firstLine:1,lastLine:2}]}]})
      .mockResolvedValueOnce(check({support:[{id:'R2',firstLine:2,lastLine:2}]}));
    const result=await storyDiscussion(ctx,gen);
    expect(result?.answer).toBe(draft().points[0].text);
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','verifier']);
    expect(JSON.parse(gen.mock.calls[0][1]).sources[1].text).toBe('[1] The office is above the COVENIENCE STORE.\n[2] Mira suggests sharing a flat to reduce the rent.');
    const schema=gen.mock.calls[0][4].json_schema.schema.properties.points.items.properties.support.items.properties;
    expect(Object.keys(schema).sort()).toEqual(['firstLine','id','lastLine']);
    expect(result?.points[0].support).toEqual([{id:'R2',quote:context.sources[1].text}]);
  });
  it.each([
    {id:'R2',firstLine:0,lastLine:1},{id:'future',firstLine:1,lastLine:1},
    {id:'R2',firstLine:1,lastLine:99},{id:'R2',firstLine:1,lastLine:1,quote:'corrected quote'},
  ])('rejects invalid writer line receipts before independent review: %j',async receipt=>{
    const gen=vi.fn().mockResolvedValue({points:[{text:draft().points[0].text,support:[receipt]}]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','writer']);
  });
  it('rechecks an inexact reviewer citation without rewriting an otherwise approved draft',async()=>{
    const bad=check({support:[{id:'R2',quote:'Mira suggests sharing a flat to reduce the rent!'}]});
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(bad).mockResolvedValueOnce(check());
    const result=await storyDiscussion(context,gen);
    expect(result?.answer).toBe(draft().points[0].text);
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','verifier','verifier']);
    const first=JSON.parse(gen.mock.calls[1][1]),second=JSON.parse(gen.mock.calls[2][1]);
    expect(second.points).toEqual(first.points);expect(second.sources).toEqual(first.sources);
    expect(JSON.stringify(second)).not.toContain('reduce the rent!');
    expect(result?.points[0].support).toEqual(check().checks[0].support);
  });
  it('copies reviewed line ranges from the original source without correcting its spelling',async()=>{
    const text='The office is above the COVENIENCE STORE.\nMira suggests sharing a flat to reduce the rent.';
    const ctx={...context,sources:[context.sources[0],{...context.sources[1],text}]};
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check({support:[{id:'R2',firstLine:1,lastLine:2}]}));
    const result=await storyDiscussion(ctx,gen);
    expect(result?.points[0].support).toEqual([{id:'R2',quote:text}]);
    expect(JSON.parse(gen.mock.calls[1][1]).sources[1].text).toBe('[1] The office is above the COVENIENCE STORE.\n[2] Mira suggests sharing a flat to reduce the rent.');
    expect(JSON.stringify(gen.mock.calls[1][4])).toContain('firstLine');
  });
  it.each([
    {id:'R2',firstLine:0,lastLine:1},{id:'R2',firstLine:1,lastLine:2},
    {id:'R2',firstLine:1.5,lastLine:1.5},{id:'R2',firstLine:2,lastLine:1},
    {id:'future',firstLine:1,lastLine:1},{id:'R2',firstLine:1,lastLine:1,quote:context.sources[1].text},
  ])('rejects invalid or mixed line references: %j',async receipt=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValue(check({support:[receipt]}));
    expect(await storyDiscussion(context,gen)).toBeNull();
  });
  it('still rejects repeated malformed receipts and a spoiler verdict on the citation retry',async()=>{
    const bad=check({support:[{id:'R2',quote:'Mira suggests sharing a flat to reduce the rent!'}]});
    for(const last of [bad,{...check(),boundarySafe:false}]) {
      const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(bad).mockResolvedValueOnce(last);
      expect(await storyDiscussion(context,gen)).toBeNull();expect(gen).toHaveBeenCalledTimes(3);
    }
  });
  it('does not reuse a draft with a semantic rejection even if another receipt is malformed',async()=>{
    const bad={...check({support:[{id:'R2',quote:'Mira suggests sharing a flat to reduce the rent!'}]}),boundarySafe:false};
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(bad).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','verifier','writer']);
    expect(JSON.parse(gen.mock.calls[2][1])).not.toHaveProperty('points');
  });
  it.each(['dialogue','visual'] as const)('requires actual reaction evidence from current captions, without discarding verified visual facts: %s',async kind=>{
    const text=kind==='dialogue'?'Would you like to meet her? ALL: Yes!':'The crowd cheers as the princess is introduced.';
    const ctx:StoryDiscussionContext={question:'Recap the announcement.',boundary:{season:0,episode:0,seconds:90},mediaType:'movie',
      request:{intent:'recap',target:{season:null,episode:null,start:60,end:90}},sources:[{id:'R1',text,kind,season:0,episode:0,end:80}]};
    const support=[{id:'R1',quote:text}],point={text:'The princess is introduced to a cheering crowd.',support};
    const gen=vi.fn().mockResolvedValueOnce({points:[point]}).mockResolvedValueOnce(check({support,attribution:'none'}))
      .mockResolvedValueOnce({points:[]});
    const result=await storyDiscussion(ctx,gen);
    if(kind==='visual')expect(result?.answer).toBe(point.text);
    else {expect(result).toBeNull();expect(JSON.parse(gen.mock.calls[2][1]).actionWarnings).toEqual(['cheering']);}
  });
  it('checks a contracted speech subject against the actual name',async()=>{
    const ctx={...context,sources:[{...context.sources[0],text:'I am Min. I am offering you the tutoring position.'}]};
    const support=[{id:'R1',quote:ctx.sources[0].text}];
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'Min’s offering a tutoring position.',support}]})
      .mockResolvedValueOnce(check({support}));
    expect((await storyDiscussion(ctx,gen))?.answer).toContain('Min’s offering');
    expect(gen).toHaveBeenCalledTimes(2);
  });
  it('points review to permitted identifying context but still requires proof of the connection',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check());
    await storyDiscussion(context,gen);
    expect(JSON.parse(gen.mock.calls[1][1]).warnings[0].contextCandidates).toEqual([{word:'mira',sourceIds:['R2']}]);
    const bad=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check({support:[{id:'R1',quote:context.sources[0].text}]}))
      .mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,bad)).toBeNull();
    expect(JSON.parse(bad.mock.calls[2][1]).contextCandidates).toEqual([{word:'mira',sourceIds:['R2']}]);
  });
  it('repairs unqualified historical actions before review without copying rejected prose',async()=>{
    const ctx={...context,sources:[{...context.sources[0],text:'Hello. I am Mira. We should share the rent.'}]};
    const support=[{id:'R1',quote:ctx.sources[0].text}];
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'Mira walks in with FUTURE_OBJECT.',support}]})
      .mockResolvedValueOnce({points:[{text:'Mira suggests sharing the rent.',support}]})
      .mockResolvedValueOnce(check({support}));
    expect((await storyDiscussion(ctx,gen))?.answer).toBe('Mira suggests sharing the rent.');
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','writer','verifier']);
    expect(JSON.parse(gen.mock.calls[1][1]).actionWarnings).toEqual(['walks in']);
    expect(JSON.stringify(gen.mock.calls.slice(1))).not.toContain('FUTURE_OBJECT');
  });
  it('treats family-role wording as a contextual attribution, not an invented name',async()=>{
    const ctx:StoryDiscussionContext={question:'Who brought the book?',boundary:{season:0,episode:0,seconds:120},mediaType:'movie',request:{intent:'answer',target:{season:null,episode:null,start:0,end:120}},
      sources:[{id:'R1',season:0,episode:0,end:110,text:"Your grandfather is here. I brought you a book. Today I am going to read it to you."}]};
    const support=[{id:'R1',quote:ctx.sources[0].text}];
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'Grandpa brings the book and says he will read it aloud.',support}]})
      .mockResolvedValueOnce(check({support}));
    expect((await storyDiscussion(ctx,gen))?.answer).toContain('Grandpa');expect(gen).toHaveBeenCalledTimes(2);
  });
  it('allows retrospective wording only after checking the completed source',async()=>{
    const ctx:StoryDiscussionContext={...context,request:{intent:'answer',target:{season:1,episode:2,start:0,end:0}},sources:[{...context.sources[0],text:'Mira eventually understood that sharing a flat would reduce the cost.'}]};
    const support=[{id:'R1',quote:ctx.sources[0].text}];
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'Mira eventually understood why sharing would help.',support}]})
      .mockResolvedValueOnce(check({support,attribution:'none'}));
    expect((await storyDiscussion(ctx,gen))?.answer).toContain('eventually');expect(gen).toHaveBeenCalledTimes(2);
  });
  it('still rejects a viewer-directed hint in the unified route',async()=>{
    const ctx={...context,request:{intent:'answer' as const,target:{season:1,episode:2,start:0,end:0}}};
    const gen=vi.fn().mockResolvedValueOnce(draft('Keep watching, Mira will reveal why.')).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(ctx,gen)).toBeNull();expect(gen.mock.calls[1][0]).toContain('remove predictions');
  });
  it('allows a name established by separate permitted context and retains that evidence',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check());
    const result=await storyDiscussion(context,gen);
    expect(result?.answer).toBe(draft().points[0].text);
    expect(result?.sourceIds).toEqual(['R2']);
    expect(JSON.parse(gen.mock.calls[1][1]).warnings[0].issues).toContain('speaker');
    expect(gen.mock.calls[1][0]).toContain('not automatic verdicts');
  });
  it('does not turn a clause opener into part of the speaker name',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft('When Mira suggests sharing a flat, the point is to reduce the rent.'))
      .mockResolvedValueOnce(check());
    expect((await storyDiscussion(context,gen))?.answer).toContain('When Mira suggests');
    expect(gen).toHaveBeenCalledTimes(2);
  });
  it('allows unambiguous contextual self-identification without a literal speaker label',async()=>{
    const text='Who is speaking? I am Mira. I suggest sharing a flat to reduce our rent.';
    const ctx={...context,sources:[{...context.sources[0],text}]};
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check({support:[{id:'R1',quote:text}]}));
    // Writer must also use an actual quote; no exception for plausible receipts.
    gen.mockReset().mockResolvedValueOnce({points:[{text:draft().points[0].text,support:[{id:'R1',quote:'I suggest sharing a flat'}]}]})
      .mockResolvedValueOnce(check({support:[{id:'R1',quote:text}]}));
    expect((await storyDiscussion(ctx,gen))?.answer).toContain('Mira suggests');
  });
  it('rejects a named attribution the reviewer did not explicitly check',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check({attribution:'none'})).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(gen.mock.calls[2][0]).toContain('Recheck who says what');
  });
  it('does not accept an unknown name even when the reviewer incorrectly approves it',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft('UnknownVillain suggests sharing a flat.'))
      .mockResolvedValueOnce(check()).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(gen.mock.calls[2][0]).toContain('Identify people only');
    expect(JSON.stringify(gen.mock.calls[2])).not.toContain('UnknownVillain');
  });
  it('does not treat dialogue about a plan as an observed action',async()=>{
    const ctx={...context,sources:[{...context.sources[0],text:'I plan to leave.'}]};
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'They left.',support:[{id:'R1',quote:'I plan to leave.'}]}]})
      .mockResolvedValueOnce(check({attribution:'none',support:[{id:'R1',quote:'I plan to leave.'}]})).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(ctx,gen)).toBeNull();
  });
  it.each([
    {index:1}, {issue:'invented-category'}, {attribution:'probably'}, {supported:'yes'},
    {support:[{id:'R99',quote:'Mira suggests sharing a flat'}]},
    {support:[{id:'R2',quote:'Mira secretly owns the flat.'}]}, {support:[]},
  ])('fails closed for malformed or fabricated independent proof: %j',async changes=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(check(changes)).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
  });
  it('rejects the whole answer for a boundary violation, not just one paragraph',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce({...check(),boundarySafe:false})
      .mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(gen.mock.calls[2][0]).toContain('remove predictions');
  });
  it('does not accept a quotation-only or irrelevant answer as a useful explanation',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce({...check(),fit:'reject'}).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
  });
  it('rejects a true tangent even when the overall fit is direct, then verifies a complete focused rewrite',async()=>{
    const extra={id:'R3',text:'Later Mira worries about the noise at a different apartment.',season:1,episode:1,end:70};
    const ctx={...context,sources:[...context.sources,extra]};
    const tangent={text:'Later Mira worries about noise at a different apartment.',support:[{id:'R3',quote:extra.text}]};
    const focused=draft('Sharing a flat would spread the cost of rent.');
    const gen=vi.fn().mockResolvedValueOnce({points:[...draft().points,tangent]})
      .mockResolvedValueOnce({...check(),checks:[...check().checks,
        {index:1,supported:false,issue:'relevance',attribution:'none',support:[]}]})
      .mockResolvedValueOnce(focused).mockResolvedValueOnce(check({attribution:'none',support:[{id:'R1',quote:context.sources[0].text}]}));
    const result=await storyDiscussion(ctx,gen);
    expect(result?.answer).toBe(focused.points[0].text);
    expect(result?.sourceIds).toEqual(['R1']);
    expect(gen).toHaveBeenCalledTimes(4);
    // The permitted later context stays available; the rejected answer itself
    // cannot enter the rewrite or be salvaged as a partial response.
    expect(JSON.parse(gen.mock.calls[2][1]).sources.map((s:{text:string})=>({...s,text:s.text.replace(/^\[\d+\] /gm,'')}))).toEqual(ctx.sources);
    expect(gen.mock.calls[2][1]).not.toContain(tangent.text);
    expect(JSON.parse(gen.mock.calls[3][1]).points).toEqual(focused.points.map(({text})=>({text})));
  });
  it.each(['recap','answer'] as const)('keeps later permitted events when the question explicitly requests them: %s',async intent=>{
    const extra={id:'R3',text:'Later Mira worries about the noise at a different apartment.',season:1,episode:1,end:70};
    const ctx:StoryDiscussionContext={...context,question:intent==='recap'?'Recap the episode so far.':'Compare the original reason for sharing with the later concern about the apartment.',
      request:{intent,target:{season:1,episode:1,start:0,end:70}},sources:[...context.sources,extra]};
    const points=[...draft().points,{text:'Later Mira worries about noise at a different apartment.',support:[{id:'R3',quote:extra.text}]}];
    const gen=vi.fn().mockResolvedValueOnce({points}).mockResolvedValueOnce({...check(),checks:[...check().checks,
      {index:1,supported:true,issue:'none',attribution:'none',support:points[1].support}]});
    expect((await storyDiscussion(ctx,gen))?.answer).toContain('different apartment');
    expect(gen).toHaveBeenCalledTimes(2);
  });
  it('carries an uncertain source phrase into repair without carrying the rejected attribution',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft('FuturePerson suggests sharing a flat.'))
      .mockResolvedValueOnce(check({supported:false,issue:'speaker',attribution:'uncertain',support:[{id:'R1',quote:'Why not share a flat?'}]}))
      .mockResolvedValueOnce(draft('Sharing a flat would reduce the cost for each person.'))
      .mockResolvedValueOnce(check({attribution:'none',support:[{id:'R1',quote:context.sources[0].text}]}));
    expect((await storyDiscussion(context,gen))?.answer).toContain('reduce the cost');
    const retry=JSON.parse(gen.mock.calls[2][1]);
    expect(retry.attributionWarnings).toEqual([{id:'R1',quote:'Why not share a flat?'}]);
    expect(JSON.stringify(gen.mock.calls.slice(2))).not.toContain('FuturePerson');
    expect(JSON.parse(gen.mock.calls[3][1]).attributionWarnings).toEqual(retry.attributionWarnings);
  });
  it('never forwards a fabricated source quote in repair feedback',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft())
      .mockResolvedValueOnce(check({supported:false,issue:'speaker',attribution:'uncertain',support:[{id:'R1',quote:'FUTURE_TWIST from a malicious judge'}]}))
      .mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(JSON.stringify(gen.mock.calls[2])).not.toContain('FUTURE_TWIST');
  });
  it('rewrites all paragraphs, carries only fixed feedback, and independently rechecks the complete repair',async()=>{
    const unsafe='Mira suggests sharing a flat because of SECRET_FUTURE_REASON.';
    const safe=draft('Sharing a flat would spread the cost of rent.');
    const proof=[{id:'R1',quote:'I cannot afford the rent alone. Why not share a flat?'}];
    const gen=vi.fn().mockResolvedValueOnce(draft(unsafe))
      .mockResolvedValueOnce(check({supported:false,issue:'cause',support:[]}))
      .mockResolvedValueOnce(safe).mockResolvedValueOnce(check({attribution:'none',support:proof}));
    const result=await storyDiscussion(context,gen);
    expect(result?.answer).toBe(safe.points[0].text);
    expect(gen).toHaveBeenCalledTimes(4);
    expect(gen.mock.calls[2][1]).toBe(gen.mock.calls[0][1]);
    expect(JSON.stringify(gen.mock.calls.slice(2))).not.toContain('SECRET_FUTURE_REASON');
    expect(JSON.parse(gen.mock.calls[3][1]).points).toEqual(safe.points.map(({text})=>({text})));
  });
  it.each([
    {season:1,episode:3,end:0}, {season:2,episode:1,end:0}, {season:1,episode:2,end:.001},
    {season:1,episode:1,end:NaN}, {season:0,episode:1,end:0},
  ])('does not call either model with an out-of-scope source: %j',async position=>{
    const gen=vi.fn();
    expect(await storyDiscussion({...context,sources:[{...context.sources[0],...position}]},gen)).toBeNull();
    expect(gen).not.toHaveBeenCalled();
  });
  it('rejects ambiguous duplicate source IDs before any call',async()=>{
    const gen=vi.fn();
    expect(await storyDiscussion({...context,sources:[context.sources[0],context.sources[0]]},gen)).toBeNull();
    expect(gen).not.toHaveBeenCalled();
  });
  it('propagates provider errors without retries or exposing the unchecked draft',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft()).mockRejectedValueOnce(new Error('budget cap'));
    await expect(storyDiscussion(context,gen)).rejects.toThrow('budget cap');
    expect(gen).toHaveBeenCalledTimes(2);
  });
});
