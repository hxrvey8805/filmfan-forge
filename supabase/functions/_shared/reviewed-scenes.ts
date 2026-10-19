import { formatTimestamp, permittedCues, promptConversation, questionIntent, unavailableMemoryReply,
  type Conversation, type Cue, type SubtitleRecord, type ViewingPosition } from './companion.ts';
import type { JsonGenerator } from './answer.ts';
import { addressesNamedRelationship } from './question-focus.ts';

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
  uses: ('recap' | 'scene' | 'explanation')[];
  topics: string[];
  context_ids?: string[];
  anchors: Cue[];
  review: { status: 'reviewed'; basis: 'caption_prefix'; reference: string; reviewed_at: string };
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
}

const cueKey = (cue: Cue) => JSON.stringify([cue.start, cue.end, cue.text]);
const validCue = (cue: Cue) => cue && Number.isFinite(cue.start) && cue.start >= 0 &&
  Number.isFinite(cue.end) && cue.end >= cue.start && typeof cue.text === 'string' && cue.text.trim().length > 0;

export function permittedSceneNotes(notes: ReviewedSceneNote[], records: SubtitleRecord[], position: ViewingPosition): PreparedSceneNote[] {
  const scoped = records.filter(row => row.tmdb_id === position.tmdbId && row.media_type === position.mediaType &&
    row.season_number === (position.seasonNumber ?? null) && row.episode_number === (position.episodeNumber ?? null));
  const objects = notes.filter(note => note && typeof note === 'object' && !Array.isArray(note));
  const duplicateIds = new Set(objects.filter((row, i) => objects.findIndex(other => other.id === row.id) !== i).map(row => row.id));
  const result: PreparedSceneNote[] = [];
  for (const note of objects) {
    if (!note || !/^[a-zA-Z0-9_-]{1,100}$/.test(note.id) || duplicateIds.has(note.id) ||
        note.tmdb_id !== position.tmdbId || note.media_type !== position.mediaType ||
        note.season_number !== (position.seasonNumber ?? null) || note.episode_number !== (position.episodeNumber ?? null) ||
        note.review?.status !== 'reviewed' || note.review.basis !== 'caption_prefix' ||
        typeof note.review.reference !== 'string' || !note.review.reference.trim() ||
        typeof note.review.reviewed_at !== 'string' || !Number.isFinite(Date.parse(note.review.reviewed_at)) ||
        !Number.isFinite(note.start_seconds) || note.start_seconds < 0 || !Number.isFinite(note.reveal_seconds) ||
        note.reveal_seconds < note.start_seconds || note.reveal_seconds > position.seconds ||
        typeof note.summary !== 'string' || !note.summary.trim() || note.summary.length > 1000 ||
        !Array.isArray(note.uses) || !note.uses.length || note.uses.some(use => !['recap', 'scene', 'explanation'].includes(use)) ||
        !Array.isArray(note.topics) || note.topics.length > 12 || note.topics.some(topic => typeof topic !== 'string' || topic.length > 80) ||
        (note.context_ids !== undefined && (!Array.isArray(note.context_ids) || note.context_ids.length > 4 ||
          note.context_ids.some(id => typeof id !== 'string' || id === note.id))) ||
        !Array.isArray(note.anchors) || !note.anchors.length || note.anchors.length > 250 ||
        note.anchors.some(cue => !validCue(cue) || cue.start < note.start_seconds || cue.end > note.reveal_seconds)) continue;
    // Caption-only reviews may omit a provider file ID for offline exports.
    // When present, never apply them to a replacement subtitle edition.
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
      text: note.summary.trim(), uses: [...note.uses], topics: [...note.topics], contextIds: [...(note.context_ids ?? [])] });
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
  history: Conversation[], generate: JsonGenerator) {
  if (unavailableMemoryReply(question, position, history)) return null;
  const intent = questionIntent(question);
  const use = intent === 'recap' ? 'recap' : intent === 'scene' ? 'scene' : 'explanation';
  const scoped = notes.filter(note => note.tmdbId === position.tmdbId && note.mediaType === position.mediaType &&
    note.season === (position.seasonNumber ?? null) && note.episode === (position.episodeNumber ?? null) &&
    Number.isFinite(note.start) && note.start >= 0 && Number.isFinite(note.end) && note.end >= note.start &&
    note.end <= position.seconds);
  const eligible = scoped.filter(note => note.uses.includes(use) && expandContext([note], scoped) !== null);
  // Never trim a dense set in a way that silently loses recap milestones.
  if (!eligible.length || eligible.length > (use === 'recap' ? 8 : 24) ||
      JSON.stringify(eligible).length > 14000) return null;
  const aliases = eligible.map((note, i) => ({ id: `N${i + 1}`, start: note.start, end: note.end, text: note.text, topics: note.topics }));
  const conversation = promptConversation(history, position);
  const system = conversation.length ? `${SCENE_SELECTION_PROMPT}\nEarlier conversation resolves references only; it is not evidence. Select only facts from the supplied reviewed notes.` : SCENE_SELECTION_PROMPT;
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
    ? `Earlier (${formatTimestamp(note.start)}–${formatTimestamp(note.end)}): ${note.text}` : note.text).join('\n\n'), evidence: selected.map(note => ({
    id: `reviewed:${note.id}`, label: `Reviewed caption note · ${formatTimestamp(note.start)}–${formatTimestamp(note.end)}`,
    season: position.seasonNumber ?? null, episode: position.episodeNumber ?? null, start: note.start, end: note.end,
  })) };
}
