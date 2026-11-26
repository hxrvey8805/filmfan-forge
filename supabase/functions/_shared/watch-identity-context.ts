import type { QuestionScope } from './question-scope.ts';
import { sourcePacket, type WatchSource } from './watch-context.ts';

const normal = (s:string) => s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const generic = new Set(['man','woman','boy','girl','all','both','narrator','announcer','voice','speaker']);
function labels(text:string) {
  // A label only nominates original context for review. It never creates an
  // alias, a speaker assignment, or a new fact about an unlabelled exchange.
  return [...new Set([...text.matchAll(/^[\t -]*([\p{Lu}][\p{Lu}\p{M}'’.-]*(?: +[\p{Lu}][\p{Lu}\p{M}'’.-]*){0,3})(?:[\t ]*\[[^\]\n]*\])?:/gmu)]
    .map(m=>normal(m[1])).filter(name=>name.length>1&&!generic.has(name)))];
}

// Relevance selection can retain the cause of an argument while dropping the
// earlier introduction that identifies its participants. Use spare packet
// space for those complete exchanges, without replacing any selected evidence
// or spending another model call. Writer and independent reviewer still have
// to establish the actual link, with exact receipts, from these original words.
export function withIdentityContext(selected:WatchSource[],eligible:WatchSource[],plan:QuestionScope,characterLimit:number,question=''):WatchSource[] {
  // Recaps have a lower as well as an upper story boundary. Do not append
  // events outside their requested interval. Other questions can need an
  // introduction even when they ask about an earlier cause, not this scene.
  if(plan.intent==='recap')return selected;
  const p=plan.boundary;
  const permitted=(s:WatchSource)=>s.season===(p.seasonNumber??0)&&s.episode===(p.episodeNumber??0)
    ? s.end<=p.seconds
    : p.mediaType==='tv'&&plan.earlierStory&&(s.season<p.seasonNumber!||s.season===p.seasonNumber&&s.episode<p.episodeNumber!);
  const pool=eligible.filter(permitted);
  // A name in a question can nominate an original source for inspection, but
  // never establishes identity or an alias. Only the source text is appended.
  const text=' '+normal([question,...selected.map(s=>s.text)].join('\n'))+' ';
  const covered=new Set(selected.flatMap(s=>labels(s.text)));
  const ids=new Set(selected.map(s=>s.id));
  const candidates=pool.filter(s=>!ids.has(s.id)&&s.kind==='dialogue').map(s=>({s,names:labels(s.text).filter(name=>text.includes(' '+name+' '))}))
    .filter(c=>c.names.length).sort((a,b)=>b.names.length-a.names.length||b.s.season-a.s.season||b.s.episode-a.s.episode||b.s.end-a.s.end);
  let added=0;
  for(const {s,names} of candidates) {
    if(added>=3)break;
    if(names.every(name=>covered.has(name)))continue;
    const i=pool.indexOf(s);
    const group=pool.slice(Math.max(0,i-1),i+2).filter(v=>v.season===s.season&&v.episode===s.episode&&v.start<=s.end+15&&v.end>=s.start-15);
    const nextIds=new Set([...ids,...group.map(v=>v.id)]);
    const next=eligible.filter(v=>nextIds.has(v.id));
    if(next.length>55||JSON.stringify(next.map(sourcePacket)).length>characterLimit)continue;
    group.forEach(v=>{ids.add(v.id);labels(v.text).forEach(name=>covered.add(name));});
    added++;
  }
  return added?eligible.filter(s=>ids.has(s.id)):selected;
}
