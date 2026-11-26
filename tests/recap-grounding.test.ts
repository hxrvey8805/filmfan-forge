import {describe,expect,it,vi} from 'vitest';
import {storyDiscussion,type StoryDiscussionContext} from '../supabase/functions/_shared/story-discussion';
import {namedSpeechSubjects,captionIdentityWords,groundingContextHints,draftGroundingIssues} from '../supabase/functions/_shared/draft-grounding';

const ctx:StoryDiscussionContext={question:'Recap the last two minutes.',mediaType:'tv',boundary:{season:1,episode:2,seconds:420},
  request:{intent:'recap',target:{season:1,episode:2,start:300,end:420}},sources:[
    {id:'S1',text:'Mira: The bridge is closed. We must find another route.',season:1,episode:2,end:330},
    {id:'S2',text:'The ferry is still running.\nThen we can cross the river by ferry.',season:1,episode:2,end:410},
  ]};
const proof=(id:string)=>[{id,firstLine:1,lastLine:1}];
const good={text:'Mira explains that the bridge is closed, so another route is needed.',support:proof('S1')};
const bad={text:'FutureVillain says the ferry is still running.',support:proof('S2')};
const replacement={text:'The conversation turns to the ferry as another way across the river.',support:[{id:'S2',firstLine:1,lastLine:2}]};
const draft={points:[good,bad]};
const accepted=(index:number,support:unknown,attribution='none')=>({index,supported:true,issue:'none',attribution,support});
const review={boundarySafe:true,fit:'direct',checks:[accepted(0,good.support,'explicit'),{index:1,supported:false,issue:'speaker',attribution:'uncertain',support:proof('S2')}]};
const fixedReview={...review,checks:[review.checks[0],accepted(1,replacement.support)]};

describe('recap attribution repair',()=>{
  it('keeps verified paragraphs, rewrites only failed paragraphs and independently rechecks the complete answer',async()=>{
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review)
      .mockResolvedValueOnce({points:[{index:1,...replacement}]}).mockResolvedValueOnce(fixedReview);
    const result=await storyDiscussion(ctx,gen);
    expect(result?.answer).toBe(good.text+'\n\n'+replacement.text);
    const repair=JSON.parse(gen.mock.calls[2][1]);
    expect(repair.recapRepair).toEqual({pointCount:2,keep:[{index:0,text:good.text}],replace:[{index:1,issues:['speaker'],sourceIds:['S2']}]});
    expect(JSON.stringify(gen.mock.calls[2])).not.toContain('FutureVillain');
    const final=JSON.parse(gen.mock.calls[3][1]);
    expect(final.points).toEqual([{text:good.text},{text:replacement.text}]);
    expect(final).not.toHaveProperty('recapRepair');
    expect(final.sources).toEqual(JSON.parse(gen.mock.calls[1][1]).sources);
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','verifier','writer','verifier']);
  });
  it.each(['spoiler','relevance','invalid-proof','uncertain-kept-point'])('does not let an earlier positive verdict bypass the final %s check',async(mode)=>{
    const last=structuredClone(fixedReview);
    if(mode==='spoiler')last.boundarySafe=false;
    if(mode==='relevance')last.fit='reject';
    if(mode==='invalid-proof')last.checks[0].support=proof('NOT_PERMITTED');
    if(mode==='uncertain-kept-point')last.checks[0].attribution='uncertain';
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review)
      .mockResolvedValueOnce({points:[{index:1,...replacement}]}).mockResolvedValueOnce(last);
    expect(await storyDiscussion(ctx,gen)).toBeNull();
  });
  it('repairs an unsupported physical action without rewriting other verified sections',async()=>{
    const first={...review,checks:[review.checks[0],{index:1,supported:false,issue:'action',attribution:'none',support:[]}]};
    const gen=vi.fn().mockResolvedValueOnce({points:[good,{...bad,text:'The travellers board the ferry.'}]}).mockResolvedValueOnce(first)
      .mockResolvedValueOnce({points:[{index:1,...replacement}]}).mockResolvedValueOnce(fixedReview);
    expect((await storyDiscussion(ctx,gen))?.answer).toBe(good.text+'\n\n'+replacement.text);
    const repair=JSON.parse(gen.mock.calls[2][1]);
    expect(repair.recapRepair.replace).toEqual([{index:1,issues:['action'],sourceIds:['S2']}]);
    expect(JSON.stringify(gen.mock.calls[2])).not.toContain('The travellers board');
    expect(JSON.parse(gen.mock.calls[3][1]).points).toEqual([{text:good.text},{text:replacement.text}]);
  });
  it.each([
    [],[{index:0,...replacement}],[{index:2,...replacement}],
    [{index:1,...replacement},{index:1,...replacement}],[{index:'1',...replacement}],
  ].map(points=>({points})))('rejects incomplete or incorrectly addressed repairs: %j',async({points})=>{
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review).mockResolvedValueOnce({points});
    expect(await storyDiscussion(ctx,gen)).toBeNull();
    expect(gen).toHaveBeenCalledTimes(3);
  });
  it('logs only fixed rejection categories and counts, never rejected prose or source text',async()=>{
    const events:unknown[]=[];
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review)
      .mockResolvedValueOnce({points:[{index:1,...replacement}]}).mockResolvedValueOnce(fixedReview);
    await storyDiscussion(ctx,gen,event=>events.push(event));
    expect(events).toContainEqual({stage:'paragraph_rejected',attempt:1,paragraph:2,issue:'speaker',origin:'reviewer'});
    expect(events).toContainEqual({stage:'recap_repair',kept:1,replaced:1});
    expect(JSON.stringify(events)).not.toMatch(/FutureVillain|Mira|ferry|bridge/);
  });
  it.each(['unsafe-boundary','relevance','non-recap'])('does not retain previously checked prose for %s',async mode=>{
    const first=structuredClone(review), context=structuredClone(ctx);
    if(mode==='unsafe-boundary')first.boundarySafe=false;
    if(mode==='relevance')first.fit='reject';
    if(mode==='non-recap')context.request!.intent='answer';
    const gen=vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(first).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(context,gen)).toBeNull();
    expect(JSON.parse(gen.mock.calls[2][1])).not.toHaveProperty('recapRepair');
    expect(JSON.stringify(gen.mock.calls[2])).not.toContain('FutureVillain');
  });
});

describe('chronological clause openers are not part of character names',()=>{
  it.each(['Now','Meanwhile','Earlier','Finally','Then','Later'])('%s retains the actual speaker and still requires independent attribution proof',async opener=>{
    const text=`${opener} Mira explains that the bridge is closed.`;
    expect(namedSpeechSubjects(text)).toEqual(['mira']);
    const gen=vi.fn().mockResolvedValueOnce({points:[{text,support:proof('S1')}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,proof('S1'),'explicit')]});
    expect((await storyDiscussion(ctx,gen))?.answer).toBe(text);
    const badGen=vi.fn().mockResolvedValueOnce({points:[{text,support:proof('S1')}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,proof('S1'),'none')]}).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion(ctx,badGen)).toBeNull();
  });
  it('keeps actual multiword names intact',()=>{
    expect(namedSpeechSubjects('Mary Jane explains the plan.')).toEqual(['mary jane']);
  });
});

describe('source-backed grammatical forms of a named search service',()=>{
  it.each(['Googling','Googled','Googles'])('%s does not create a new identity when the same source explicitly names Google',async form=>{
    expect(captionIdentityWords('Amazing what you can find on Google.').has(form.toLowerCase())).toBe(true);
    const source={id:'S1',text:'Amazing what you can find on Google when waiting 35 minutes.',season:1,episode:2,end:410};
    const text=`The speaker describes ${form} during the wait.`;
    const gen=vi.fn().mockResolvedValueOnce({points:[{text,support:proof('S1')}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,proof('S1'))]});
    expect((await storyDiscussion({...ctx,sources:[source]},gen))?.answer).toBe(text);
    expect(gen).toHaveBeenCalledTimes(2);
  });
  it.each(['I searched the web.','Amazing what you can find on Bing.'])('does not invent the service from a different source: %s',async text=>{
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'The speaker describes Googling during the wait.',support:proof('S1')}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,proof('S1'))]}).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion({...ctx,sources:[{...ctx.sources[0],text}]},gen)).toBeNull();
  });
  it('does not apply verb stemming to arbitrary proper names',()=>{
    expect(captionIdentityWords('Mira speaks.').has('miring')).toBe(false);
    expect(captionIdentityWords('Bing searches.').has('binging')).toBe(false);
  });
});

describe('explicit country names and their conventional initialism',()=>{
  it.each([
    ['The United States Ambassador is being introduced.','The new U.S. ambassador is introduced.'],
    ['The U.S. Ambassador is being introduced.','The new United States ambassador is introduced.'],
  ])('accepts the same country while retaining full independent review',async(source,text)=>{
    const gen=vi.fn().mockResolvedValueOnce({points:[{text,support:proof('S1')}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,proof('S1'))]});
    expect((await storyDiscussion({...ctx,sources:[{...ctx.sources[0],text:source}]},gen))?.answer).toBe(text);
    expect(gen).toHaveBeenCalledTimes(2);
  });
  it.each(['The ambassador met us.','The British ambassador is being introduced.'])('does not infer a country from %s',async source=>{
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'The new U.S. ambassador is introduced.',support:proof('S1')}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,proof('S1'))]}).mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion({...ctx,sources:[{...ctx.sources[0],text:source}]},gen)).toBeNull();
  });
});

describe('review hints distinguish ordinary prose from missing identities',()=>{
  it.each(['Near the end, the phone rings.','Next comes an argument.','The reply is “no.” Against that refusal, the demand sounds bold.'])('does not warn of an invented sentence-opening name: %s',text=>{
    expect(groundingContextHints(text,'The phone rings. An argument follows. No.',[{id:'S1',text:'The phone rings. An argument follows. No.'}]).missingNames).toEqual([]);
  });
  it('retains a known character at the start, an unknown speech subject and an uncited name inside a sentence',()=>{
    const sources=[{id:'S1',text:'Near speaks to Mira.'}];
    expect(groundingContextHints('Near is present.','The phone rings.',sources)).toEqual({missingNames:['near'],contextCandidates:[{word:'near',sourceIds:['S1']}]});
    expect(groundingContextHints('UnknownVillain says to wait.','Wait.',sources).missingNames).toContain('unknownvillain');
    expect(groundingContextHints('The call is from FutureVillain.','Wait.',sources).missingNames).toContain('futurevillain');
  });
  it('uses source-backed normalization in hints as well as final checks',()=>{
    const quotes='The United States ambassador found this on Google.';
    expect(groundingContextHints('The U.S. ambassador describes Googling.',quotes,[{id:'S1',text:quotes}])).toEqual({missingNames:[],contextCandidates:[]});
    expect(groundingContextHints('The U.S. ambassador describes Googling.','An ambassador waited.',[{id:'S1',text:quotes}]).missingNames).toEqual(['u','googling']);
  });
});

describe('intercut recap facts still require independent attribution',()=>{
  const sources=[{id:'S1',text:'Mira.\nHello, Rowan.\nWhat is this?\nYour cut.\nThirty grand.\nWait, Alex is whose child?\nAlex is actually Sam’s child.',season:1,episode:2,end:400},
    {id:'S2',text:'[groaning]\nGive me the name.\nTaylor.\n[phone vibrating]\nRobin.\nWe found her.\nHello, Morgan.\nStart talking.',season:1,episode:2,end:410}];
  it('does not publish ambiguous transfer direction or caller identity even when all names occur in the source',async()=>{
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'Mira gives Rowan thirty grand, then Robin calls to say she found Taylor.',support:[{id:'S1',firstLine:1,lastLine:5},{id:'S2',firstLine:1,lastLine:8}]}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[{index:0,supported:false,issue:'speaker',attribution:'uncertain',support:[{id:'S1',firstLine:3,lastLine:5}]}]})
      .mockResolvedValueOnce({points:[]});
    expect(await storyDiscussion({...ctx,sources},gen)).toBeNull();
  });
  it('can retain concrete names, amounts and reports without inventing their connections',async()=>{
    const text='Mira and Rowan discuss a cut of thirty grand; a separate exchange identifies Alex as Sam’s child. Later, Taylor is named under pressure, and a phone exchange reports that someone has been found.';
    const support=[{id:'S1',firstLine:1,lastLine:7},{id:'S2',firstLine:1,lastLine:7}];
    const gen=vi.fn().mockResolvedValueOnce({points:[{text,support}]}).mockResolvedValueOnce({boundarySafe:true,fit:'direct',checks:[accepted(0,support,'contextual')]});
    expect((await storyDiscussion({...ctx,sources},gen))?.answer).toBe(text);
    expect(gen.mock.calls[0][0]).toContain('adjacency does not establish one scene');
    expect(gen.mock.calls[0][0]).toContain('do not guess these directions');
    expect(gen.mock.calls.map(c=>c[3])).toEqual(['writer','verifier']);
  });
});

describe('question instructions and grammatical family references are not new identities',()=>{
  const evidence=[{id:'S1',text:'We are the Marlows! Remember the name.',start:0,end:30},{id:'S2',text:'The Marlow family has arrived.',start:31,end:40}];
  const issue=(question:string,text:string,rows=evidence)=>draftGroundingIssues(question,{status:'answered',claims:[{text,evidenceIds:['S1']}]},rows);
  it.each(['Recap','Summary','List','Compare'])('does not turn the instruction %s into a named person',command=>{
    expect(issue(command+' this episode.',`The ${command.toLowerCase()} concerns a family warning.`)).not.toContain('identity');
  });
  it.each(['The Marlows’ warning is forceful.',"The Marlows' warning is forceful."] )('normalizes plural possessives: %s',text=>{
    expect(issue('What is the warning?',text)).not.toContain('identity');
    expect(issue('What is the warning?',text,[{...evidence[0],text:'Remember the name.'}])).toContain('identity');
  });
  it('accepts a source-backed family inflection but does not stem individual names or invent a canonical name',()=>{
    expect(issue('Recap this scene.','The warning stresses the Marlow name.')).not.toContain('identity');
    expect(issue('Recap this scene.','Marlow speaks for the family.')).toContain('identity');
    expect(issue('Recap this scene.','The warning stresses the Marlow name.',[evidence[0]])).toContain('identity');
  });
  it('still requires a question-named person and a real character named like a command to have cited identity evidence',()=>{
    expect(issue('What does Mira do?','Mira is discussing the warning.')).toContain('identity');
    expect(issue('What does List do?','List is discussing the warning.',[...evidence,{id:'S3',text:'List is a person.',start:41,end:50}])).toContain('identity');
  });
});
