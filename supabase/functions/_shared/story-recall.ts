import { companionVersionFor, type SubtitleRecord, type ViewingPosition } from './companion.ts';
import { storyRecallRequest } from './cut-scope.ts';
import { storyDiscussion } from './story-discussion.ts';
import { permittedSceneNotes, type PreparedSceneNote, type ReviewedSceneNote } from './reviewed-scenes.ts';
import type { JsonGenerator } from './answer.ts';
import type { CheckedResponse, CitedEvidence } from './companion-response.ts';
import { storyFacts, type StoryFact } from './story-facts.ts';

const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (text: string) => new Set(normalize(text).split(' ').filter(Boolean));
const ignored = new Set('remind me again why how who what where when the a an is was are were in on at of for to and from up until this that with please story past earlier previous episode episodes season seasons background backstory want wants wanted trying tries tried know knows knew has have had does did do she her he his him they their them it its'.split(' '));
export function earlierEpisode(s: number, e: number, p: ViewingPosition) {
  return p.mediaType === 'tv' && Number.isInteger(s) && s > 0 && Number.isInteger(e) && e > 0 &&
    (s < p.seasonNumber! || s === p.seasonNumber && e < p.episodeNumber!);
}

function validFact(fact: StoryFact, p: ViewingPosition) {
  if (!fact || fact.tmdbId !== p.tmdbId || !fact.through || !earlierEpisode(fact.through.season, fact.through.episode, p) ||
      !/^[a-z0-9-]{1,100}$/.test(fact.id) || typeof fact.text !== 'string' || !fact.text.trim() || fact.text.length > 1600 ||
      !Number.isFinite(Date.parse(fact.reviewedAt)) || !Array.isArray(fact.entities) || !Array.isArray(fact.references)) return false;
  const hosts = new Set<string>();
  for (const ref of fact.references) {
    try {
      const url = new URL(ref.url);
      if (url.protocol !== 'https:' || url.username || url.password || !ref.locator?.trim()) return false;
      hosts.add(url.hostname.replace(/^www\./, ''));
    } catch { return false; }
  }
  return hosts.size >= 2 && fact.entities.length > 0 && fact.entities.length <= 12 && fact.entities.every(entity => entity && typeof entity.name === 'string' && entity.name.trim() && entity.name.length <= 80 &&
    normalize(fact.text).includes(normalize(entity.name)) && Array.isArray(entity.aliases) &&
    entity.aliases.every(alias => typeof alias === 'string' && alias.trim() && alias.length <= 80));
}

export function permittedStoryFacts(p: ViewingPosition, facts: StoryFact[] = storyFacts) {
  // Filter the boundary BEFORE aliases, relevance scoring, or provider input.
  const valid = facts.filter(f => validFact(f, p));
  return valid.filter(f => valid.filter(other => other.id === f.id).length === 1);
}

export function recallSearchQuestion(question: string, p: ViewingPosition, facts: StoryFact[] = storyFacts) {
  const eligible = permittedStoryFacts(p, facts);
  const replacements = new Map<string, Set<string>>();
  for (const fact of eligible) for (const entity of fact.entities) for (const alias of entity.aliases) {
    const key = normalize(alias);
    const names = replacements.get(key) ?? new Set<string>(); names.add(entity.name); replacements.set(key, names);
  }
  // Resolve only an unambiguous, reviewed alias from this title's permitted
  // story. Never use full-show cast lists, fuzzy future names, or chat history.
  return question.replace(/[\p{L}\p{M}]+/gu, token => {
    const matches = replacements.get(normalize(token));
    return matches?.size === 1 ? [...matches][0] : token;
  });
}

export function recallRelevance(question: string, text: string) {
  // Retrieval may normalize ordinary inflection; it never rewrites the facts
  // or resolves a character identity. "tie" must find an exchange about "ties".
  // Apply only after the title/episode boundary; exact source text is retained
  // for the writer and independent checker.
  const term = (word: string) => word.length > 3 && /s$/.test(word) && !/(?:ss|us|is)$/.test(word) ? word.slice(0,-1) : word;
  const query = [...new Set([...words(question)].filter(word => word.length > 2 && !ignored.has(word)).map(term))];
  const present = new Set([...words(text)].map(term));
  return query.reduce((score, word) => score + Number(present.has(word)), 0);
}

export type StoryNote = PreparedSceneNote & { historicalDialogue?: true };

// An expired interpretation is not a current story fact. The exact, complete
// dialogue that was reviewed still happened, though. Recheck it at its original
// boundary, then retain only the words spoken, never the expired summary,
// uncertain story state, indexing tags or unverified speaker attribution.
export function earlierStoryDialogue(notes: ReviewedSceneNote[], records: SubtitleRecord[], p: ViewingPosition): StoryNote[] {
  const result: StoryNote[] = [];
  const scoped = notes.filter(n => n && n.tmdb_id === p.tmdbId && n.media_type === 'tv' &&
    earlierEpisode(n.season_number!, n.episode_number!, p));
  for (const n of scoped) {
    if (n.review?.basis !== 'caption_prefix' || n.context_ids?.length ||
        !Number.isFinite(n.reveal_seconds) || n.reveal_seconds < 0 || n.reveal_seconds > 43200) continue;
    const at = { ...p, seasonNumber: n.season_number!, episodeNumber: n.episode_number!, seconds: n.reveal_seconds };
    const checked = permittedSceneNotes(scoped, records, at).find(note => note.id === n.id);
    if (!checked?.cueWords?.length || !checked.uses.includes('explanation')) continue;
    result.push({ id: checked.id, tmdbId: checked.tmdbId, mediaType: 'tv', season: checked.season,
      episode: checked.episode, start: checked.start, end: checked.end, text: checked.cueWords.join('\n'),
      uses: ['explanation'], topics: [], contextIds: [], historicalDialogue: true });
  }
  return result;
}

type Source = { text: string; evidence: CitedEvidence; historicalDialogue?: true };
export function storyRecallContext(question: string, p: ViewingPosition, notes: StoryNote[] = [], facts: StoryFact[] = storyFacts) {
  if (p.mediaType !== 'tv' || !storyRecallRequest(question)) return null;
  const resolved = recallSearchQuestion(question, p, facts);
  const candidates: Source[] = permittedStoryFacts(p, facts).map(f => ({ text: f.text, evidence: {
    id: `series:${p.tmdbId}:${f.through.season}:${f.through.episode}:v${companionVersionFor({ ...p, seasonNumber: f.through.season, episodeNumber: f.through.episode })}:story:${f.id}`,
    label: `Story context through S${f.through.season}E${f.through.episode}`,
    season: f.through.season, episode: f.through.episode, start: 0, end: 0, scope: 'completed_episode',
  }}));
  for (const note of notes) {
    if (note.tmdbId !== p.tmdbId || note.mediaType !== 'tv' || note.season === null || note.episode === null ||
        !Number.isFinite(note.start) || note.start < 0 || !Number.isFinite(note.end) || note.end < note.start || note.end > 43200 ||
        note.limited || note.knowledge === 'unresolved' || note.validUntil !== undefined || !note.uses.includes('explanation')) continue;
    const earlier = earlierEpisode(note.season, note.episode, p);
    if (note.historicalDialogue && !earlier) continue;
    if (!earlier && !(note.season === p.seasonNumber && note.episode === p.episodeNumber && note.end <= p.seconds)) continue;
    // A dependency must be present and permitted too; never silently drop the
    // qualifying context. Dependent notes continue through the existing route.
    if (note.contextIds.length) continue;
    candidates.push({ text: note.text, ...(note.historicalDialogue ? { historicalDialogue: true as const } : {}), evidence: {
      id: (earlier ? `series:${p.tmdbId}:${note.season}:${note.episode}:v${companionVersionFor({ ...p, seasonNumber:note.season, episodeNumber:note.episode })}:` : '') + `reviewed:${note.id}`,
      label: `Reviewed story context · S${note.season}E${note.episode}`,
      season: note.season, episode: note.episode, start: note.start, end: note.end,
    }});
  }
  const scored = candidates.map(source => ({ source, score: recallRelevance(resolved, source.text) }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  // Fail closed if the complete relevant set cannot fit: do not drop a later
  // qualification just because an older note ranks higher.
  if (!scored.length || scored.length > 24 || JSON.stringify(scored).length > 15000) return null;
  const selected = scored.map(row => row.source).sort((a,b) => a.evidence.season! - b.evidence.season! ||
    a.evidence.episode! - b.evidence.episode! || a.evidence.end - b.evidence.end);
  return { question: resolved, boundary: { season:p.seasonNumber, episode:p.episodeNumber, seconds:p.seconds }, selected };
}

export async function storyRecallAnswer(question: string, p: ViewingPosition, notes: StoryNote[], generate: JsonGenerator,
  facts: StoryFact[] = storyFacts): Promise<CheckedResponse | null> {
  const context = storyRecallContext(question, p, notes, facts);
  if (!context) return null;
  const aliases = new Map(context.selected.map((source, i) => ['R'+(i+1), source]));
  const answer = await storyDiscussion({ question:context.question, boundary:{season:p.seasonNumber!,episode:p.episodeNumber!,seconds:p.seconds},
    sources:[...aliases].map(([id, source]) => ({id,text:source.text,end:source.evidence.end,
      season:source.evidence.season!,episode:source.evidence.episode!,
      ...(source.historicalDialogue ? { historicalDialogue: true as const } : {})})),
  },generate);
  if (!answer) return null;
  return { answer:answer.answer, evidence:answer.sourceIds.map(id => aliases.get(id)!.evidence),
    ...(answer.limited ? {limited:true as const} : {}) };
}
