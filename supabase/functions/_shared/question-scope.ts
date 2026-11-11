import { parseTimestamp, questionIntent, type ViewingPosition } from './companion.ts';
import { wholeShowRecap, allowsEarlierStory } from './cut-scope.ts';

export type EpisodeScope = { season: number; episode: number };
export type StoryWindow = { season: number | null; episode: number | null; start: number; end: number };
export type QuestionScope = {
  intent: 'answer' | 'scene' | 'recap'; boundary: ViewingPosition;
  window: StoryWindow; earlierStory: boolean;
  collection?: 'series' | 'season' | 'previous'; season?: number; count?: number;
  clarification?: string;
};
const nums = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const n = (s: string) => /^\d+$/.test(s) ? Number(s) : nums.indexOf(s);
const number = '(\\d+|' + nums.slice(1).join('|') + ')';
const clock = '(\\d{1,3}:\\d{2}(?::\\d{2})?)';
export function beforeOrAt(a: EpisodeScope, b: ViewingPosition) {
  return a.season < b.seasonNumber! || a.season === b.seasonNumber && a.episode <= b.episodeNumber!;
}

// Parse scope, never story facts. The client position remains the ceiling;
// a question may narrow it, but cannot lift it by mentioning a later time.
export function questionScope(question: string, position: ViewingPosition): QuestionScope {
  const q = question.toLowerCase().replace(/[’]/g,"'")
    .replace(/\b(last|previous|past) (?:an? )?(hour|minute|second|episode)\b/g,'$1 one $2')
    .replace(/\bhalf an hour\b/g,'30 minutes');
  const boundary = {...position};
  const narrower = q.match(new RegExp('(?:no spoilers (?:past|after)|only (?:what|information) (?:was )?known (?:at|by)|without (?:anything|information) (?:past|after))\\s+'+clock));
  if (narrower) {
    const seconds = parseTimestamp(narrower[1]);
    if (seconds !== null) boundary.seconds = Math.min(boundary.seconds, seconds);
  }
  const rangeLike = /\bwhat happened (?:between|from|in the (?:last|previous))\b/.test(q);
  const characterArc=/\b(?:catch me up on|recap|summari[sz]e)\s+(?!(?:the |this |whole |entire |last |previous |season |episode |movie |film |show |series |everything |all |what ))[a-z][a-z' -]*\b(?:story|storyline|journey)\b/.test(q);
  const intent = characterArc ? 'answer' : questionIntent(q) === 'recap' || rangeLike || /\bremind me what happened\b/.test(q) ? 'recap' : questionIntent(q) === 'scene' ? 'scene' : 'answer';
  const plan: QuestionScope = {intent,boundary,earlierStory:position.mediaType === 'tv' && intent === 'answer' && allowsEarlierStory(q),
    window:{season:position.seasonNumber ?? null,episode:position.episodeNumber ?? null,start:0,end:boundary.seconds}};
  const invalid = (message: string) => ({...plan,clarification:message});
  const episode = q.match(/\bs(\d+)\s*e(\d+)\b/) ?? q.match(new RegExp('\\bseason '+number+'[, ]+(?:episode|ep) '+number+'\\b'));
  const epOnly = q.match(new RegExp('\\b(?:episode|ep) '+number+'\\b'));
  if (episode || epOnly) {
    if (position.mediaType !== 'tv') return invalid('Which part of the movie would you like me to cover?');
    const target = {season:episode ? n(episode[1]) : position.seasonNumber!,episode:n(episode ? episode[2] : epOnly![1])};
    if (target.season < 1 || target.episode < 1 || !beforeOrAt(target,boundary)) return invalid('That episode is beyond your selected viewing position. Which earlier episode did you mean?');
    plan.window = {...target,start:0,end:target.season === boundary.seasonNumber && target.episode === boundary.episodeNumber ? boundary.seconds : 43200};
  }
  if (intent === 'recap' && position.mediaType === 'tv' && !episode && !epOnly) {
    const season = q.match(new RegExp('\\bseason '+number+'\\b'));
    const previous = q.match(new RegExp('\\b(?:last|previous|past) '+number+' episodes?\\b'));
    if (previous) {plan.collection='previous';plan.count=n(previous[1]);if(plan.count!<1 || plan.count!>100)return invalid('How many previous episodes would you like recapped?');}
    else if (season) {
      plan.season=n(season[1]);
      if(plan.season<1 || plan.season>boundary.seasonNumber!)return invalid('That season is beyond your selected viewing position. Which earlier season did you mean?');
      plan.collection='season';
    } else if (wholeShowRecap(q)) {
      plan.collection=/\bseason\b/.test(q)&&!/\b(?:show|series)\b/.test(q)?'season':'series';
      if(plan.collection==='season')plan.season=boundary.seasonNumber;
    }
  }
  const clockRange = q.match(new RegExp('\\b(?:between|from|recap|summari[sz]e)\\s+'+clock+'\\s*(?:and|to|[-–])\\s*'+clock));
  const minuteRange = q.match(new RegExp('\\b(?:between|from)\\s+'+number+'\\s*(?:minutes?|mins?)?\\s*(?:and|to|[-–])\\s*'+number+'\\s*(?:minutes?|mins?)\\b'));
  const last = q.match(new RegExp('\\b(?:last|previous|past)\\s+'+number+'\\s*(minutes?|mins?|seconds?|secs?|hours?|hrs?)\\b'));
  if (clockRange || minuteRange) {
    const start = clockRange ? parseTimestamp(clockRange[1]) : n(minuteRange![1])*60;
    const end = clockRange ? parseTimestamp(clockRange[2]) : n(minuteRange![2])*60;
    if(start===null || end===null || start<0 || end<start || end>plan.window.end)return invalid('Please choose a time range that ends at or before your selected viewing point.');
    plan.window={...plan.window,start,end};
  } else if(last) {
    if(plan.window.end===43200 && (plan.window.season!==boundary.seasonNumber || plan.window.episode!==boundary.episodeNumber))return invalid('What timestamp in that episode should the recap end at?');
    const duration=n(last[1])*(last[2].startsWith('h')?3600:last[2].startsWith('m')?60:1);
    if(duration<=0)return invalid('How many minutes would you like me to recap?');
    plan.window.start=Math.max(0,plan.window.end-duration);
  } else {
    const at = q.match(new RegExp('\\b(?:at|by|up to|through|until|before)\\s+'+clock));
    if(at) {
      if(plan.collection==='season' && plan.season!==boundary.seasonNumber)return invalid('Which episode in that season should the timestamp refer to?');
      const end=parseTimestamp(at[1]);
      if(end===null || end>plan.window.end)return invalid('That timestamp is beyond your selected viewing position. Which earlier moment did you mean?');
      plan.window.end=end;
      if(intent!=='recap')plan.window.start=Math.max(0,end-120);
    }
  }
  if(plan.collection && (clockRange || minuteRange || last))return invalid('Should I recap a time range in this episode, or the earlier episodes?');
  // Never silently turn an unparsed explicit range into a whole-prefix recap.
  if(intent==='recap' && /\b(?:between|from \d|last \w+ minutes?|previous episode)\b/.test(q) && !clockRange && !minuteRange && !last && !epOnly && !episode && !plan.collection) {
    if(/\bprevious episode\b/.test(q) && position.mediaType==='tv'){plan.collection='previous';plan.count=1;}
    else return invalid('Which time range would you like recapped? You can use “the last ten minutes” or “10:00 to 25:00.”');
  }
  return plan;
}

export function recapWindows(plan: QuestionScope, seasons: {season:number;count:number}[]): {windows:StoryWindow[];catalogComplete:boolean} {
  if(!plan.collection)return {windows:[plan.window],catalogComplete:true};
  const p=plan.boundary,windows:StoryWindow[]=[];
  const from=plan.collection==='season'?plan.season!:1;
  let catalogComplete=true;
  for(let s=from;s<=p.seasonNumber!;s++) {
    if(plan.collection==='season' && s!==plan.season)continue;
    const count=s===p.seasonNumber?p.episodeNumber!:seasons.find(row=>row.season===s)?.count;
    if(!count){catalogComplete=false;continue;}
    for(let e=1;e<=count;e++) {
      const current=s===p.seasonNumber && e===p.episodeNumber;
      if(plan.collection==='previous' && current)continue;
      windows.push({season:s,episode:e,start:0,end:current?Math.min(p.seconds,plan.window.end):43200});
    }
  }
  return {windows:plan.collection==='previous'?windows.slice(-plan.count!):windows,catalogComplete};
}
