import { describe, expect, it, vi } from 'vitest';
import { storyRecallRequest } from '../supabase/functions/_shared/cut-scope';
import { earlierStoryDialogue, permittedStoryFacts, recallRelevance, recallSearchQuestion, storyRecallAnswer, storyRecallContext } from '../supabase/functions/_shared/story-recall';
import { storyFacts, type StoryFact } from '../supabase/functions/_shared/story-facts';
import { safeHistory, type Conversation, type ViewingPosition } from '../supabase/functions/_shared/companion';
import { companionResponse, immediateMemoryResponse } from '../supabase/functions/_shared/companion-response';
import { permittedSceneNotes, type PreparedSceneNote, type ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';

const p: ViewingPosition = {tmdbId:70523,mediaType:'tv',seasonNumber:3,episodeNumber:1,seconds:3382};
const question = 'Remind me why caterina is in the past again';
const approved = (quote:string) => ({boundarySafe:true,fit:'direct',checks:[{index:0,supported:true,issue:'none',attribution:'none',support:[{id:'R1',quote}]}]});
const note = (changes:Partial<PreparedSceneNote> = {}): PreparedSceneNote => ({id:'earlier',tmdbId:70523,mediaType:'tv',season:2,episode:7,
  start:10,end:20,text:'Katharina asks about her son.',uses:['explanation'],topics:['Katharina'],contextIds:[],...changes});
const row = (evidence:unknown): Conversation => ({id:'answer',title_id:70523,media_type:'tv',season_number:3,episode_number:1,
  position_seconds:3382,companion_version:3,question,answer:'Katharina is trying to find her son.',context:'',timestamp:'56:22',created_at:'2026-11-08',answer_status:'answered',evidence});

describe('independent story reminders',()=>{
  it('retrieves inflected terms without rewriting evidence or including later matches',()=>{
    expect(recallRelevance('Remind me why the tie mattered','The last captain did not care about ties.')).toBeGreaterThan(0);
    const current={...p,tmdbId:999,seasonNumber:1,episodeNumber:2,seconds:10};
    const source=note({tmdbId:999,season:1,episode:1,text:'The last captain did not care about ties.'});
    const ctx=storyRecallContext('Remind me why the tie mattered',current,[source,
      {...source,id:'future',episode:3,text:'The ties reveal a FUTURE_SECRET.'},
      {...source,id:'unfinished',episode:2,end:10.01,text:'The tie has a LATER_SECRET.'}],[]);
    expect(ctx?.selected.map(s=>s.text)).toEqual([source.text]);
  });
  it.each([question,'Why is Katharina looking for Mikkel again?','Explain the backstory of her search','What happened in previous episodes?'])(
    'recognizes an invitation to earlier story: %s',q=>expect(storyRecallRequest(q)).toBe(true));
  it.each(['Repeat your last answer','Remind me of your previous answer','What is happening here?',
    'Remind me why, using only this episode','Remind me why, but do not use previous episodes'])(
    'does not widen an unrelated or restricted request: %s',q=>expect(storyRecallRequest(q)).toBe(false));
  it('does not use a completed-episode note at any timestamp inside its source episode',()=>{
    expect(permittedStoryFacts({...p,seasonNumber:2,episodeNumber:8,seconds:43200})).toEqual([]);
    expect(permittedStoryFacts({...p,seconds:0})).toHaveLength(1);
    expect(permittedStoryFacts({...p,tmdbId:999})).toEqual([]);
    expect(permittedStoryFacts({...p,mediaType:'movie'})).toEqual([]);
  });
  it('resolves only eligible unambiguous names, never a future character tag',()=>{
    expect(recallSearchQuestion(question,p)).toContain('Katharina');
    expect(recallSearchQuestion(question,{...p,seasonNumber:2,episodeNumber:8})).toBe(question);
    const second:StoryFact={...storyFacts[0],id:'different',text:'Katerine asks about her family.',entities:[{name:'Katerine',aliases:['Caterina']}]};
    expect(recallSearchQuestion(question,p,[storyFacts[0],second])).toBe(question);
    expect(recallSearchQuestion(question,{...p,tmdbId:999})).toBe(question);
  });
  it('filters future/current-incomplete, foreign, expired and unresolved notes before the model sees them',()=>{
    const ctx=storyRecallContext(question,p,[note(),note({id:'future',season:3,episode:2,text:'Katharina FUTURE_SECRET'}),
      note({id:'later',season:3,episode:1,end:3382.01,text:'Katharina LATER_SECRET'}),
      note({id:'foreign',tmdbId:7,text:'Katharina FOREIGN_SECRET'}),note({id:'expired',validUntil:30,text:'Katharina EXPIRED'}),
      note({id:'unknown',knowledge:'unresolved',text:'Katharina OLD_UNRESOLVED'}),
      note({id:'here',season:3,episode:1,end:3382,text:'Katharina asks about a map.'})]);
    const raw=JSON.stringify(ctx);
    expect(raw).not.toMatch(/SECRET|EXPIRED|OLD_UNRESOLVED/);
    expect(raw).toContain('asks about a map');
    expect(raw).toContain('asks about her son');
  });
  it('does not give another question scope or return unrelated source material',()=>{
    expect(storyRecallContext('What is happening here?',p)).toBeNull();
    expect(storyRecallContext('Remind me why Claudia wants the notebook',p)).toBeNull();
    expect(storyRecallContext(question,{...p,seasonNumber:2,episodeNumber:8})).toBeNull();
  });
  it('uses the same retrieval path for another title with verified earlier notes',()=>{
    const other={...p,tmdbId:999,seasonNumber:2,episodeNumber:1};
    const source=note({tmdbId:999,season:1,episode:2,text:'Mira needs the map to find her lost brother.',id:'mira-search'});
    const ctx=storyRecallContext('Remind me why Mira needs the map again',other,[source]);
    expect(ctx?.selected.map(s=>s.text)).toEqual([source.text]);
    expect(ctx?.selected[0].evidence.id).toBe('series:999:1:2:v3:reviewed:mira-search');
    expect(JSON.stringify(ctx)).not.toContain('Katharina');
  });
  it('sends only selected safe facts, checks their explanation and preserves the history boundary',async()=>{
    const calls:{system:string;packet:any}[]=[];
    const generate=vi.fn(async(system:string,user:string)=>{
      const packet=JSON.parse(user);calls.push({system,packet});
      if(calls.length===1)return {points:[{text:'Katharina wants to find her missing son Mikkel.',support:[{id:'R1',quote:'her missing son Mikkel'}]}]};
      return approved('her missing son Mikkel');
    });
    const result=await storyRecallAnswer(question,p,[],generate);
    expect(result?.answer).toContain('find her missing son');
    expect(calls).toHaveLength(2);
    expect(calls[0].packet.question).toContain('Katharina');
    expect(calls[0].packet).not.toHaveProperty('earlierQuestions');
    expect(calls[0].system).toContain('story reminder');
    const saved=row(result!.evidence);
    expect(safeHistory([saved],p)).toHaveLength(1);
    expect(safeHistory([saved],{...p,seconds:3381})).toEqual([]);
    expect(safeHistory([saved],{...p,episodeNumber:2})).toEqual([]);
    expect(safeHistory([saved],{...p,seasonNumber:2,episodeNumber:8})).toEqual([]);
    expect(safeHistory([saved],{...p,tmdbId:1})).toEqual([]);
    expect(safeHistory([{...saved,question:'What happened here?'}],p)).toEqual([]);
    expect(immediateMemoryResponse('Repeat your last answer',p,[saved])?.evidence[0].scope).toBe('completed_episode');
    expect(immediateMemoryResponse('Repeat your last answer',{...p,seconds:3381},[saved])?.answer_status).toBe('insufficient_evidence');
  });
  it('cannot relabel a whole-episode source as already seen within that episode',()=>{
    const citations=storyRecallContext(question,p)!.selected.map(s=>s.evidence);
    const forged=row(citations);forged.season_number=2;forged.episode_number=8;
    expect(safeHistory([forged],{...p,seasonNumber:2,episodeNumber:8})).toEqual([]);
    expect(safeHistory([row(citations.map(e=>({...e,id:e.id.replace('70523','999')})))],p)).toEqual([]);
  });
  it('fails a remembered plot fact without a supporting quote before review',async()=>{
    const gen=vi.fn(async(_system:string,_user:string)=>({points:[{text:'Katharina arrives in a specific year.',support:[{id:'R1',quote:'arrives in that year'}]}]}));
    expect(await storyRecallAnswer(question,p,[],gen)).toBeNull();
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls.every(call => !String(call[1]).includes('a specific year'))).toBe(true);
  });
  it('rebuilds a rejected explanation from safe sources without reusing rejected prose or dropping the reason',async()=>{
    const gen=vi.fn().mockResolvedValueOnce({points:[
      {text:'The photo proved a NEW_UNSUPPORTED_CAUSE.',support:[{id:'R1',quote:'An old school photograph helps convince her that time travel is real.'}]},
      {text:'She wanted Mikkel back.',support:[{id:'R1',quote:'She wants to recover Mikkel'}]},
    ]}).mockResolvedValueOnce({boundarySafe:true,fit:'reject',checks:[{index:0,supported:false,issue:'cause',attribution:'none',support:[]},{index:1,supported:true,issue:'none',attribution:'none',support:[{id:'R1',quote:'She wants to recover Mikkel'}]}]})
      .mockResolvedValueOnce({points:[{text:'Katharina wants to bring her missing son home.',support:[{id:'R1',quote:'She wants to recover Mikkel'}]}]})
      .mockResolvedValueOnce(approved('She wants to recover Mikkel'));
    const reply=await storyRecallAnswer(question,p,[],gen);
    expect(reply?.answer).toBe('Katharina wants to bring her missing son home.');
    expect(gen).toHaveBeenCalledTimes(4);
    expect(gen.mock.calls[2][0]).toContain('Rebuild the answer');
    expect(gen.mock.calls[2][1]).toBe(gen.mock.calls[0][1]);
    expect(gen.mock.calls[2][1]).not.toContain('NEW_UNSUPPORTED_CAUSE');
  });
  it('does not retry a provider or budget error',async()=>{
    const gen=vi.fn().mockRejectedValue(new Error('provider-block'));
    await expect(storyRecallAnswer(question,p,[],gen)).rejects.toThrow('provider-block');
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it('does not substitute an explanation about another person when context is missing',()=>{
    const reply=companionResponse(question,p,[],[],{answer:'Mikkel did not travel in this world.',evidence:[],limited:true,sourceGap:true});
    expect(reply.answer).not.toContain('Mikkel');
    expect(reply.charge).toBe(false);
    expect(reply.answer).toContain('earlier story');
  });
});

describe('earlier dialogue survives an expired interpretation safely',()=>{
  const current={tmdbId:10,mediaType:'tv' as const,seasonNumber:1,episodeNumber:3,seconds:0};
  const cues=[{start:10,end:12,text:'I plan to leave.'},{start:13,end:14,text:'Not yet.'}];
  const record={id:'captions',tmdb_id:10,media_type:'tv' as const,season_number:1,episode_number:2,
    ingestion_version:3,source_file_id:100,cues};
  const reviewed:ReviewedSceneNote={id:'departure',tmdb_id:10,media_type:'tv',season_number:1,episode_number:2,
    source_file_id:100,start_seconds:10,reveal_seconds:14,summary:'OLD_UNKNOWN_STATE: Nobody has left yet.',
    coverage:'limited',valid_until_seconds:30,uses:['explanation'],topics:['FUTURE_NAME'],anchors:cues,
    review:{status:'reviewed',basis:'caption_prefix',reference:'Reviewed exact caption span.',reviewed_at:'2026-11-08'}};
  it('retains the complete earlier conversation without reviving its expired interpretation',()=>{
    expect(permittedSceneNotes([reviewed],[record],{...current,episodeNumber:2,seconds:31})).toEqual([]);
    const notes=earlierStoryDialogue([reviewed],[record],current);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('I plan to leave.\nNot yet.');
    const ctx=storyRecallContext('Remind me what the plan to leave was',current,notes,[]);
    expect(ctx?.selected[0].historicalDialogue).toBe(true);
    expect(JSON.stringify(ctx)).not.toMatch(/OLD_UNKNOWN_STATE|FUTURE_NAME|Nobody has left/);
  });
  it('rechecks the episode boundary before any historical words enter a new question',()=>{
    for(const pos of [{...current,episodeNumber:2,seconds:43200},{...current,episodeNumber:1},
      {...current,tmdbId:11},{...current,mediaType:'movie' as const}]){
      expect(earlierStoryDialogue([reviewed],[record],pos)).toEqual([]);
    }
    const notes=earlierStoryDialogue([reviewed],[record],current);
    expect(storyRecallContext('Remind me what the plan to leave was',{...current,episodeNumber:2,seconds:30},notes,[])).toBeNull();
  });
  it('never drops a denial, changes editions or trusts a duplicate/unfinished source',()=>{
    for(const rows of [[{...record,cues:cues.slice(0,1)}],[{...record,cues:[cues[0],{...cues[1],text:'Yes, now.'}]}],
      [{...record,source_file_id:101}],[{...record,ingestion_version:2}]]){
      expect(earlierStoryDialogue([reviewed],rows,current)).toEqual([]);
    }
    expect(earlierStoryDialogue([reviewed,reviewed],[record],current)).toEqual([]);
    expect(earlierStoryDialogue([{...reviewed,context_ids:['missing-context']}],[record],current)).toEqual([]);
    expect(earlierStoryDialogue([{...reviewed,reveal_seconds:13}],[record],current)).toEqual([]);
    expect(earlierStoryDialogue([{...reviewed,review:{...reviewed.review,status:'draft'}} as unknown as ReviewedSceneNote],[record],current)).toEqual([]);
  });
  it('keeps visual uncertainty out of historical dialogue',()=>{
    const visual={...reviewed,review:{...reviewed.review,basis:'scene_prefix' as const},scene_review:{
      kind:'released_video' as const,availability:'timed_scene' as const,reviewed_through_seconds:30,knowledge:'unresolved' as const,
      references:[{url:'https://example.com/review',locator:'reviewed clip'}]}};
    expect(earlierStoryDialogue([visual],[record],current)).toEqual([]);
  });
  it('checks speech as speech and rejects an invented successful action',async()=>{
    const notes=earlierStoryDialogue([reviewed],[record],current);
    const packets:any[]=[];
    const generate=vi.fn(async(system:string,user:string)=>{
      const data=JSON.parse(user);packets.push(data);
      expect(system).toMatch(/historicalDialogue/);
      if(packets.length===1)return {points:[{text:'They left.',support:[{id:'R1',quote:'I plan to leave.'}]}]};
      return {boundarySafe:true,fit:'reject',checks:[{index:0,supported:false,issue:'action',attribution:'none',support:[]}]};
    });
    expect(await storyRecallAnswer('Remind me what the plan to leave was',current,notes,generate,[])).toBeNull();
    expect(packets[0].sources[0]).toMatchObject({historicalDialogue:true,season:1,episode:2});
    expect(JSON.stringify(packets)).not.toMatch(/OLD_UNKNOWN_STATE|FUTURE_NAME/);
  });
  it('repairs unsupported named speech with fixed feedback, without trusting or repeating the rejected name',async()=>{
    const notes=earlierStoryDialogue([reviewed],[record],current);
    const gen=vi.fn().mockResolvedValueOnce({points:[{text:'Morgan said they plan to leave.',support:[{id:'R1',quote:'I plan to leave.'}]}]})
      .mockResolvedValueOnce({boundarySafe:true,fit:'reject',checks:[{index:0,supported:false,issue:'speaker',attribution:'uncertain',support:[]}]})
      .mockResolvedValueOnce({points:[{text:'The earlier exchange proposed a departure but delayed it.',support:[{id:'R1',quote:'I plan to leave.\nNot yet.'}]}]})
      .mockResolvedValueOnce(approved('I plan to leave.\nNot yet.'));
    const answer=await storyRecallAnswer('Remind me what the plan to leave was',current,notes,gen,[]);
    expect(answer?.answer).toContain('proposed a departure');
    expect(gen).toHaveBeenCalledTimes(4);
    expect(gen.mock.calls[2][0]).toContain('Keep supported names');
    expect(gen.mock.calls[2][1]).toBe(gen.mock.calls[0][1]);
    expect(JSON.stringify(gen.mock.calls[2])).not.toContain('Morgan');
  });
});
