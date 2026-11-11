import { companionVersionFor, evidenceLabel, formatTimestamp, type SubtitleRecord, type ViewingPosition } from './companion.ts';
import { completeSceneEvidence } from './scene-evidence.ts';
import { permittedSceneNotes, type ReviewedSceneNote } from './reviewed-scenes.ts';
import { permittedStoryFacts } from './story-recall.ts';
import { cutGroup } from './cut-scope.ts';
import { sharedStoryFacts } from './shared-cut-story.ts';
import type { CitedEvidence } from './companion-response.ts';
import type { QuestionScope, StoryWindow } from './question-scope.ts';

export type WatchSource = {
  id:string; text:string; start:number; end:number; season:number; episode:number;
  kind:'dialogue'|'visual'|'story'; knowledge?:'established'|'unresolved'; historicalDialogue?:true;
  evidence:CitedEvidence;
};
const older = (s:number,e:number,p:ViewingPosition) => s<p.seasonNumber! || s===p.seasonNumber && e<p.episodeNumber!;
const clean = (text:string) => text.split('\n').map(line=>line.replace(/^\[\d{2,}:\d{2}:\d{2}\]\s*/, '')).join('\n');

// All names, semantic retrieval and AI calls operate AFTER these filters.
// A timestamp is a reveal boundary, not the in-universe date of an event.
export function watchSources(plan:QuestionScope, records:SubtitleRecord[], notes:ReviewedSceneNote[], window?:StoryWindow):WatchSource[] {
  const p=plan.boundary;
  if(window && (window.start<0 || window.end<window.start || window.end>43200 ||
    p.mediaType==='movie' && (window.season!==null || window.episode!==null || window.end>p.seconds) ||
    p.mediaType==='tv' && !(Number.isInteger(window.season) && window.season!>0 && Number.isInteger(window.episode) && window.episode!>0 &&
      (older(window.season!,window.episode!,p) || window.season===p.seasonNumber && window.episode===p.episodeNumber && window.end<=p.seconds))))return [];
  const positions:ViewingPosition[]=[];
  const seen=new Set<string>();
  const add=(season:number|null,episode:number|null,seconds:number)=>{
    const key=`${season}:${episode}`;if(seen.has(key))return;seen.add(key);
    positions.push({...p,...(p.mediaType==='tv'?{seasonNumber:season!,episodeNumber:episode!}:{}),seconds});
  };
  if(window)add(window.season,window.episode,window.end);
  else {
    add(p.seasonNumber??null,p.episodeNumber??null,p.seconds);
    if(plan.earlierStory)for(const r of [...records,...notes]) {
      if(r.tmdb_id===p.tmdbId && r.media_type==='tv' && Number.isInteger(r.season_number) && r.season_number!>0 &&
        Number.isInteger(r.episode_number) && r.episode_number!>0 && older(r.season_number!,r.episode_number!,p))add(r.season_number,r.episode_number,43200);
    }
  }
  const result:WatchSource[]=[];
  const append=(s:Omit<WatchSource,'id'>)=>result.push({...s,id:'S'+(result.length+1)});
  for(const at of positions.sort((a,b)=>(a.seasonNumber??0)-(b.seasonNumber??0)||(a.episodeNumber??0)-(b.episodeNumber??0))) {
    const historical=p.mediaType==='tv' && older(at.seasonNumber!,at.episodeNumber!,p);
    const wrap=(e:CitedEvidence):CitedEvidence=>historical?{...e,
      id:`series:${p.tmdbId}:${at.seasonNumber}:${at.episodeNumber}:v${companionVersionFor(at)}:${e.id}`}:e;
    if(cutGroup(at)) {
      for(const f of sharedStoryFacts(at)) {
        if(window && f.end<window.start)continue;
        append({text:f.text,start:f.end,end:f.end,season:at.seasonNumber!,episode:at.episodeNumber!,kind:'story',knowledge:'established',
          evidence:wrap({id:'shared-cut:'+f.id,label:'Seen in both cuts by '+formatTimestamp(Math.ceil(f.end)),season:at.seasonNumber!,episode:at.episodeNumber!,start:f.end,end:f.end})});
      }
      continue;
    }
    // Filter individual cues at the lower boundary too, before packets merge.
    const scoped=window?records.map(r=>({...r,cues:Array.isArray(r.cues)?r.cues.filter(c=>c && c.start>=window.start):[]})):records;
    for(const e of completeSceneEvidence(scoped,at))append({text:clean(e.text),start:e.start,end:e.end,season:e.season??0,episode:e.episode??0,kind:'dialogue',
      ...(historical?{historicalDialogue:true as const}:{}),evidence:wrap({id:e.id,season:e.season,episode:e.episode,start:e.start,end:e.end,label:evidenceLabel(e)})});
    for(const note of permittedSceneNotes(notes,records,at)) {
      // Caption summaries duplicate their complete dialogue. Only verified
      // visual accounts add information the dialogue cannot supply.
      if(note.basis!=='scene_prefix' || historical && (note.validUntil!==undefined || note.knowledge==='unresolved') ||
        window && note.start<window.start)continue;
      append({text:note.text,start:note.start,end:note.end,season:note.season??0,episode:note.episode??0,kind:'visual',knowledge:note.knowledge,
        evidence:wrap({id:'reviewed:'+note.id,label:evidenceLabel(note),season:note.season,episode:note.episode,start:note.start,end:note.end})});
    }
  }
  if(!window && plan.earlierStory)for(const f of permittedStoryFacts(p))append({text:f.text,start:0,end:0,season:f.through.season,episode:f.through.episode,kind:'story',knowledge:'established',
    evidence:{id:`series:${p.tmdbId}:${f.through.season}:${f.through.episode}:v${companionVersionFor({...p,seasonNumber:f.through.season,episodeNumber:f.through.episode})}:story:${f.id}`,
      label:`Story context through S${f.through.season}E${f.through.episode}`,season:f.through.season,episode:f.through.episode,start:0,end:0,scope:'completed_episode'}});
  return result.sort((a,b)=>a.season-b.season||a.episode-b.episode||a.start-b.start);
}

export function sourcePacket(s:WatchSource) {
  const {id,text,start,end,season,episode,kind,knowledge,historicalDialogue}=s;
  return {id,text,start,end,season,episode,kind,...(knowledge?{knowledge}:{}),...(historicalDialogue?{historicalDialogue}:{})};
}
