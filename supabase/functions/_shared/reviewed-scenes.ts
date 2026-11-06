import { cutGroup } from './cut-scope.ts';
import { conflictingEditions, formatTimestamp, usableSubtitleEdition, permittedCues, promptConversation, questionIntent, unavailableMemoryReply,
  type Conversation, type Cue, type SubtitleRecord, type ViewingPosition } from './companion.ts';
import type { JsonGenerator } from './answer.ts';
import { noteExcerpt } from './note-excerpt.ts';
import { broadDiscussion } from './exchange-commentary.ts';
import { addressesNamedRelationship } from './question-focus.ts';
import { discussScene } from './scene-discussion.ts';

// Editorial data from a service-role-only store, NEVER from the question body.
// Review is semantic work: exact matches prove which captions were reviewed,
// not that a screenplay's stage directions occurred in the released film.
export interface ReviewedSceneNote {
  id: string;
  tmdb_id: number;
  media_type: 'tv' | 'movie';
  season_number: number | null;
  episode_number: number | null;
  source_file_id: number | null;
  start_seconds: number;
  reveal_seconds: number;
  summary: string;
  // A review may support useful facts without resolving the whole subject.
  // Such a limitation is valid only through its reviewed viewing boundary.
  coverage?: 'complete' | 'limited';
  valid_until_seconds?: number;
  uses: ('recap' | 'scene' | 'explanation')[];
  topics: string[];
  context_ids?: string[];
  anchors: Cue[];
  review: { status: 'reviewed'; basis: 'caption_prefix' | 'scene_prefix'; reference: string; reviewed_at: string };
  // Separate visual review from caption matching: anchors establish the edition,
  // not the truth or first visible time of a silent event. Episode reviews may
  // only unlock at the reviewed end boundary, never an estimated scene time.
  scene_review?: {
    kind: 'released_video' | 'audio_description' | 'episode_review';
    availability: 'timed_scene' | 'episode_end';
    reviewed_through_seconds: number;
    knowledge: 'established' | 'unresolved';
    references: { url: string; locator: string }[];
  };
}

export interface PreparedSceneNote {
  id: string;
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  season: number | null;
  episode: number | null;
  start: number;
  end: number;
  text: string;
  uses: ReviewedSceneNote['uses'];
  topics: string[];
  contextIds: string[];
  limited?: true;
  validUntil?: number;
  basis?: 'scene_prefix';
  knowledge?: 'established' | 'unresolved';
  // Cue ordinals are local to this exact edition-checked note.
  cueIds?: string[];
  cueWords?: string[];
}

const cueKey = (cue: Cue) => JSON.stringify([cue.start, cue.end, cue.text]);
const validCue = (cue: Cue) => cue && Number.isFinite(cue.start) && cue.start >= 0 &&
  Number.isFinite(cue.end) && cue.end >= cue.start && typeof cue.text === 'string' && cue.text.trim().length > 0;

function referenceHost(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1500) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname ? url.hostname : null;
  } catch { return null; }
}

function validSceneReview(note: ReviewedSceneNote): boolean {
  if (note.review?.basis === 'caption_prefix') return note.scene_review === undefined;
  const review = note.scene_review;
  if (!review || !Number.isInteger(note.source_file_id) || note.source_file_id! <= 0 ||
      !['released_video', 'audio_description', 'episode_review'].includes(review.kind) ||
      !['timed_scene', 'episode_end'].includes(review.availability) ||
      !['established', 'unresolved'].includes(review.knowledge) ||
      !Number.isFinite(review.reviewed_through_seconds) || review.reviewed_through_seconds < note.reveal_seconds ||
      review.reviewed_through_seconds > 43200 ||
      !Array.isArray(review.references) || !review.references.length || review.references.length > 6 ||
      review.references.some(ref => !ref || !referenceHost(ref.url) ||
        typeof ref.locator !== 'string' || !ref.locator.trim() || ref.locator.length > 1000)) return false;
  if (review.kind === 'episode_review' && (review.availability !== 'episode_end' ||
      review.reviewed_through_seconds !== note.reveal_seconds ||
      new Set(review.references.map(ref => referenceHost(ref.url))).size < 2)) return false;
  // "Unknown at this point" is a reviewed story state with an expiry, not an
  // inference from missing dialogue. Never keep it alive past its review.
  return review.knowledge !== 'unresolved' || note.coverage === 'limited' &&
    note.valid_until_seconds !== undefined && note.valid_until_seconds <= review.reviewed_through_seconds;
}

export function permittedSceneNotes(notes: ReviewedSceneNote[], records: SubtitleRecord[], position: ViewingPosition): PreparedSceneNote[] {
  if (cutGroup(position) || conflictingEditions(records, position)) return [];
  const scoped = records.filter(row => row.tmdb_id === position.tmdbId && row.media_type === position.mediaType &&
    row.season_number === (position.seasonNumber ?? null) && row.episode_number === (position.episodeNumber ?? null));
  const objects = notes.filter(note => note && typeof note === 'object' && !Array.isArray(note));
  const duplicateIds = new Set(objects.filter((row, i) => objects.findIndex(other => other.id === row.id) !== i).map(row => row.id));
  const result: PreparedSceneNote[] = [];
  for (const note of objects) {
    if (!note || !/^[a-zA-Z0-9_-]{1,100}$/.test(note.id) || duplicateIds.has(note.id) ||
        note.tmdb_id !== position.tmdbId || note.media_type !== position.mediaType ||
        note.season_number !== (position.seasonNumber ?? null) || note.episode_number !== (position.episodeNumber ?? null) ||
        note.review?.status !== 'reviewed' || !['caption_prefix', 'scene_prefix'].includes(note.review.basis) || !validSceneReview(note) ||
        typeof note.review.reference !== 'string' || !note.review.reference.trim() ||
        typeof note.review.reviewed_at !== 'string' || !Number.isFinite(Date.parse(note.review.reviewed_at)) ||
        !Number.isFinite(note.start_seconds) || note.start_seconds < 0 || !Number.isFinite(note.reveal_seconds) ||
        note.reveal_seconds < note.start_seconds || note.reveal_seconds > position.seconds ||
        typeof note.summary !== 'string' || !note.summary.trim() || note.summary.length > 1000 ||
        (note.coverage !== undefined && !['complete', 'limited'].includes(note.coverage)) ||
        (note.coverage === 'limited' && note.valid_until_seconds === undefined) ||
        (note.valid_until_seconds !== undefined && (!Number.isFinite(note.valid_until_seconds) ||
          note.valid_until_seconds < note.reveal_seconds || position.seconds > note.valid_until_seconds)) ||
        !Array.isArray(note.uses) || !note.uses.length || note.uses.some(use => !['recap', 'scene', 'explanation'].includes(use)) ||
        !Array.isArray(note.topics) || note.topics.length > 12 || note.topics.some(topic => typeof topic !== 'string' || topic.length > 80) ||
        (note.context_ids !== undefined && (!Array.isArray(note.context_ids) || note.context_ids.length > 4 ||
          note.context_ids.some(id => typeof id !== 'string' || id === note.id))) ||
        !Array.isArray(note.anchors) || !note.anchors.length || note.anchors.length > 250 ||
        note.anchors.some(cue => !validCue(cue) || cue.start < note.start_seconds || cue.end > note.reveal_seconds)) continue;
    // Caption-only reviews may omit a provider file ID for offline exports.
    // When present, never apply them to a replacement subtitle edition.
    if (!usableSubtitleEdition(position, note.source_file_id)) continue;
    if (note.source_file_id !== null && (!Number.isInteger(note.source_file_id) || note.source_file_id <= 0)) continue;
    const cues = scoped.filter(row => note.source_file_id === null ||
      (row as SubtitleRecord & { source_file_id?: number }).source_file_id === note.source_file_id)
      .flatMap(row => permittedCues(row, position));
    const keys = new Set(cues.map(cueKey));
    if (!note.anchors.every(cue => keys.has(cueKey(cue)))) continue;
    // Every cue within a reviewed span must match, not just cherry-picked lines.
    // Changed dialogue, missing denials, overlapping tracks and shifted timing
    // invalidate the note. Review separate spans as separate notes.
    const anchors = new Set(note.anchors.map(cueKey));
    if (cues.some(cue => cue.start <= note.reveal_seconds && cue.end >= note.start_seconds && !anchors.has(cueKey(cue)))) continue;
    result.push({ id: note.id, tmdbId: note.tmdb_id, mediaType: note.media_type, season: note.season_number,
      episode: note.episode_number, start: note.start_seconds, end: note.reveal_seconds,
      cueIds: [...anchors].map((_,i) => 'C'+(i+1)), cueWords: [...anchors].map(a=>JSON.parse(a)[2] as string), text: note.summary.trim(), uses: [...note.uses], topics: [...note.topics], contextIds: [...(note.context_ids ?? [])],
      ...(note.review.basis === 'scene_prefix' ? { basis: 'scene_prefix' as const, knowledge: note.scene_review!.knowledge } : {}),
      ...(note.coverage === 'limited' ? { limited: true as const } : {}),
      ...(note.valid_until_seconds !== undefined ? { validUntil: note.valid_until_seconds } : {}) });
  }
  return result.filter(note => expandContext([note], result) !== null)
    .sort((a, b) => a.end - b.end || a.start - b.start || a.id.localeCompare(b.id));
}

// A sound/event note can require its preceding dialogue context. Dependencies
// are resolved only within the permitted source set, never from an ID lookup
// that could reach a future note or a different episode. Reject cycles/missing
// dependencies instead of dropping the qualification or context.
function expandContext(selected: PreparedSceneNote[], allowed: PreparedSceneNote[]): PreparedSceneNote[] | null {
  const expanded = new Map<string, PreparedSceneNote>();
  function visit(note: PreparedSceneNote, path: Set<string>): boolean {
    if (path.has(note.id)) return false;
    if (expanded.has(note.id)) return true;
    if (path.size >= 8) return false;
    for (const id of note.contextIds) {
      const dependency = allowed.find(candidate => candidate.id === id);
      if (!dependency || dependency.end > note.end || !visit(dependency, new Set([...path, note.id]))) return false;
    }
    expanded.set(note.id, note);
    return expanded.size <= 8;
  }
  return selected.every(note => visit(note, new Set())) ? [...expanded.values()].sort((a, b) => a.end - b.end) : null;
}

export const SCENE_SELECTION_PROMPT = `Select the reviewed notes that directly answer the question. Return only noteIds; no prose.
The notes have already been limited to the current title, episode and timestamp. Do not use remembered plot, infer missing actions, or complete unfinished dialogue.
Select [] if the notes cannot answer the requested subject. Nearby events are not an answer to a relationship question.
For a recap, include every supplied recap note, in chronological order. For a current-scene question include the latest note, with earlier notes only as useful background.
For an explanation, choose only notes explaining the requested cause or subject. Keep qualifications and uncertainty intact: the server will display the complete reviewed wording.`;

export async function reviewedSceneAnswer(question: string, position: ViewingPosition, notes: PreparedSceneNote[],
  history: Conversation[], generate: JsonGenerator, options: { visualOnly?: boolean; explainVisual?: boolean } = {}) {
  if (unavailableMemoryReply(question, position, history)) return null;
  const intent = questionIntent(question);
  const use = intent === 'recap' ? 'recap' : intent === 'scene' ? 'scene' : 'explanation';
  const scoped = notes.filter(note => note.tmdbId === position.tmdbId && note.mediaType === position.mediaType &&
    note.season === (position.seasonNumber ?? null) && note.episode === (position.episodeNumber ?? null) &&
    Number.isFinite(note.start) && note.start >= 0 && Number.isFinite(note.end) && note.end >= note.start &&
    note.end <= position.seconds && (!note.limited || note.validUntil !== undefined) &&
    (note.validUntil === undefined || (Number.isFinite(note.validUntil) && note.validUntil >= note.end &&
      position.seconds <= note.validUntil)));
  const eligible = scoped.filter(note => (!options.visualOnly || note.basis === 'scene_prefix') &&
    note.uses.includes(use) && expandContext([note], scoped) !== null);
  // Never trim a dense set in a way that silently loses recap milestones.
  if (!eligible.length || eligible.length > (use === 'recap' ? 8 : 24)) return null;
  if (options.explainVisual && options.visualOnly && use !== 'recap') {
    const reviewed = new Map<string, PreparedSceneNote>();
    for (const note of eligible) {
      for (const item of expandContext([note], scoped)!) reviewed.set(item.id, item);
    }
    const notesByAlias = new Map([...reviewed.values()].map((note, i) => [`N${i + 1}`, note]));
    const discussion = await discussScene({
      question, seconds: position.seconds, earlierQuestions: promptConversation(history, position).map(row => row.question.slice(0, 400)),
      sources: [...notesByAlias].map(([id, n]) => ({ id, text: n.text, end: n.end, knowledge: n.knowledge })),
    }, generate);
    if (!discussion) return null;
    const cited = discussion.sourceIds.map(id => notesByAlias.get(id)!);
    if (!cited.some(note => eligible.includes(note)) ||
        (use === 'scene' && !cited.some(note => eligible.includes(note) && note.end >= position.seconds - 30))) return null;
    const selected = expandContext(cited, scoped);
    if (!selected) return null;
    return { answer: discussion.answer, evidence: selected.map(note => ({
      id: `reviewed:${note.id}`, label: `Reviewed ${note.basis === 'scene_prefix' ? 'scene' : 'caption'} note · ${formatTimestamp(note.start)}–${formatTimestamp(note.end)}`,
      season: note.season, episode: note.episode, start: note.start, end: note.end,
    })), ...(discussion.limited || selected.some(note => note.limited) ? { limited: true as const } : {}) };
  }
  const specific = use === 'explanation' && !broadDiscussion(question);
  const excerpts = new Map(eligible.map(note => [note.id, specific && note.cueWords?.length
    && note.basis !== 'scene_prefix' ? noteExcerpt(question,position,note.text,note.cueWords) : null]));
  // Index labels aren't facts. In particular, a character tag can name the
  // speaker before the selected edition has actually introduced them.
  const canon = (s: string) => ' ' + s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  const safeTopics = (note: PreparedSceneNote) => {
    const sources = [note.text, ...(note.cueWords ?? [])].map(canon);
    return note.topics.filter(t => t.trim() && sources.some(s => s.includes(canon(t))));
  };
  const aliases = eligible.map((note, i) => ({ id: `N${i + 1}`, start: note.start, end: note.end, text: note.text, topics: safeTopics(note),
    ...(excerpts.get(note.id) ? { dialogue: excerpts.get(note.id)!.text } : {}),
    ...(note.limited ? { coverage: 'limited' } : {}) }));
  if (JSON.stringify(aliases).length > 14000) return null;
  // Past interpretations are visible conversation, never story evidence. Only
  // questions may help resolve the requested subject in this episode/prefix.
  const conversation = promptConversation(history, position).map(({ question, seconds }) => ({ question, seconds }));
  let system = conversation.length ? `${SCENE_SELECTION_PROMPT}\nEarlier conversation resolves references only; it is not evidence. Select only facts from the supplied reviewed notes.` : SCENE_SELECTION_PROMPT;
  if (eligible.some(note => note.limited)) {
    system += '\nA note marked limited may give useful facts about the requested subject while explicitly leaving part unresolved. You may select it for that subject; it will remain a limited response, not a complete answer.';
  }
  if (specific) system += '\nA dialogue field is an exact excerpt from the same reviewed span. You may select a note when that excerpt directly addresses the viewer, even if the summary focuses on another detail. If neither answers the question, select [].';
  if (eligible.some(note => note.basis === 'scene_prefix')) system += '\nThese notes include independently reviewed visual events. A visual event does not require spoken confirmation. Select an unresolved note only for the exact event and question it leaves open; do not substitute it for a different identity or cause. An unresolved identity must remain unresolved. Never suggest suspects or theories. Earlier dialogue about the same name does not contradict a later visual observation.';
  const value = await generate(system, JSON.stringify({ question, position, intent: use, notes: aliases,
    ...(conversation.length ? { conversation } : {}) }), 300, 'writer', {
    type: 'json_schema', json_schema: { name: 'companion_note_selection', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['noteIds'], properties: { noteIds: {
        type: 'array', maxItems: use === 'recap' ? 8 : 3, items: { type: 'string', enum: aliases.map(note => note.id) },
      } },
    } },
  });
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join() !== 'noteIds') return null;
  const ids = (value as { noteIds?: unknown }).noteIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > (use === 'recap' ? 8 : 3) ||
      new Set(ids).size !== ids.length || ids.some(id => !aliases.some(note => note.id === id))) return null;
  const selected = expandContext(ids.map(id => eligible[aliases.findIndex(note => note.id === id)]), scoped);
  if (!selected) return null;
  if (use === 'recap' && !eligible.every(note => selected.some(item => item.id === note.id))) return null;
  if (use === 'scene' && !selected.some(note => note.end >= Math.max(0, position.seconds - 30))) return null;
  if (!addressesNamedRelationship(question, selected.map(note => ({ text: note.text, evidenceIds: [note.id] })))) return null;
  // No model-authored text is rendered or stored. One note keeps its complete
  // causal explanation, role attribution and qualifications as reviewed.
  return { answer: selected.map(note => use === 'scene' && note.end < Math.max(0, position.seconds - 30)
    ? `Earlier (${formatTimestamp(note.start)}–${formatTimestamp(note.end)}): ${note.text}` : note.text + (excerpts.get(note.id) ? ' The dialogue puts it this way: “'+excerpts.get(note.id)!.text+'”' : '')).join('\n\n'), evidence: selected.map((note, i) => ({
    id: `reviewed:${note.id}`, label: `Reviewed ${note.basis === 'scene_prefix' ? 'scene' : 'caption'} note · ${formatTimestamp(note.start)}–${formatTimestamp(note.end)}`,
    season: position.seasonNumber ?? null, episode: position.episodeNumber ?? null, start: note.start, end: note.end,
    ...(note.basis !== 'scene_prefix' && note.cueIds?.length ? { citations: [{ paragraph: i+1, lineIds: note.cueIds }] } : {}),
  })), ...(selected.some(note => note.limited) ? { limited: true as const } : {}) };
}
