import { evidenceLabel, formatTimestamp, permittedEvidence, questionIntent, unavailableMemoryReply,
  type Conversation, type Evidence, type ViewingPosition } from './companion.ts';
import { isRelationshipQuestion } from './question-focus.ts';

export type CitedEvidence = { id: string; label: string; season: number | null; episode: number | null; start: number; end: number };
export type CheckedResponse = { answer: string; evidence: CitedEvidence[]; limited?: true };
export type CompanionResponse = Omit<CheckedResponse, 'limited'> & { answer_status: 'answered' | 'insufficient_evidence'; charge: boolean };

// A failed interpretation need not hide the available scene evidence. This is
// deliberately an uncharged, limited response, never an accepted explanation
// or trusted conversation memory. Do not copy any rejected model prose here.
export function limitedSceneContext(question: string, position: ViewingPosition, evidence: Evidence[]): CheckedResponse | null {
  if (questionIntent(question) !== 'scene') return null;
  const windowStart = Math.max(0, position.seconds - 30);
  const recent = permittedEvidence(evidence, position).filter(item => item.start >= windowStart &&
    (position.mediaType === 'movie' || (item.season === position.seasonNumber && item.episode === position.episodeNumber)))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (!recent.length) return null;
  const text = recent.map(item => item.text).join('\n');
  // Keep complete packets. Never truncate a denial, continuation or speaker
  // qualification just to fit a preview. Dense dialogue uses the normal refusal.
  if (text.length > 1600 || text.split('\n').length > 16) return null;
  return { answer: `I couldn’t verify a full explanation at ${formatTimestamp(position.seconds)}. Here are the most recent captions available before that point:\n\n${text}\n\nThese are caption excerpts, not a verified account of the action or who is speaking.`,
    evidence: recent.map(item => ({ id: item.id, label: evidenceLabel(item), season: item.season,
      episode: item.episode, start: item.start, end: item.end })) };
}

// One response decision shared by the edge function and replay. A memory
// boundary always takes precedence over scene excerpts or a model result.
export function companionResponse(question: string, position: ViewingPosition, evidence: Evidence[],
  history: Conversation[], checked: CheckedResponse | null): CompanionResponse {
  const memoryReply = unavailableMemoryReply(question, position, history);
  if (memoryReply) return { answer: memoryReply, evidence: [], answer_status: 'insufficient_evidence', charge: false };
  if (checked) return { answer: checked.answer, evidence: checked.evidence,
    answer_status: checked.limited ? 'insufficient_evidence' : 'answered', charge: !checked.limited };
  const permitted = permittedEvidence(evidence, position);
  const limited = limitedSceneContext(question, position, permitted);
  return { answer: limited?.answer ?? (permitted.length
    ? isRelationshipQuestion(question)
      ? `I can’t establish the relationship you asked about from the captions available up to ${formatTimestamp(position.seconds)}. That is a limit of these captions; it doesn’t mean the story has shown no relationship.`
      : `I can’t establish that from the dialogue available up to ${formatTimestamp(position.seconds)}. I’ll leave it uncertain rather than guess at the scene or use later events.`
    : `I don’t have reliable dialogue available up to ${formatTimestamp(position.seconds)} for this title yet. I can’t give a grounded answer at this point.`),
    evidence: limited?.evidence ?? [], answer_status: 'insufficient_evidence', charge: false };
}
