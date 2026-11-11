import { evidenceLabel, formatTimestamp, permittedEvidence, questionIntent, safeHistory, unavailableMemoryReply,
  type Conversation, type Evidence, type ViewingPosition } from './companion.ts';
import { isRelationshipQuestion } from './question-focus.ts';
import { asksAboutDeath, eventCoverageReply } from './visual-context.ts';
import { storyRecallRequest } from './cut-scope.ts';

export type CitedEvidence = { id: string; label: string; season: number | null; episode: number | null; start: number; end: number; scope?: 'completed_episode'; citations?: { paragraph: number; lineIds: string[] }[] };
export type CheckedResponse = { answer: string; evidence: CitedEvidence[]; limited?: true; sourceGap?: true };
export type CompanionResponse = Omit<CheckedResponse, 'limited' | 'sourceGap'> & { answer_status: 'answered' | 'insufficient_evidence'; charge: boolean };

export function exactRepeatRequest(question: string): boolean {
  return /^(?:please\s+)?(?:(?:what (?:was|is)|what['’]s)|(?:(?:can|could|would) you )?(?:repeat|show me|remind me of)) (?:your|the) (?:last|previous) (?:answer|reply|response)(?: again)?(?: please)?[?.!]*$/i.test(question.trim());
}

// A literal repeat is a read of an already verified server-owned answer. A
// question *about* that answer still takes the normal fresh-evidence path.
export function immediateMemoryResponse(question: string, position: ViewingPosition, history: Conversation[]): CompanionResponse | null {
  const unavailable = unavailableMemoryReply(question, position, history);
  const limited = (answer: string): CompanionResponse => ({ answer, evidence: [], answer_status: 'insufficient_evidence', charge: false });
  if (unavailable) return limited(unavailable);
  if (!exactRepeatRequest(question)) return null;
  const row = safeHistory(history, position)[0];
  // Never silently substitute an older verified answer for a more recent
  // limited one. Re-run the citation boundary check before copying anything.
  if (!row || row.answer_status !== 'answered' || typeof row.answer !== 'string' || !row.answer.trim() ||
      !Array.isArray(row.evidence) || !row.evidence.length || row.evidence.some(e => typeof e.id !== 'string' || !e.id || typeof e.label !== 'string')) {
    return limited(`I don’t have a verified previous answer available to repeat at ${formatTimestamp(position.seconds)}.`);
  }
  const evidence: CitedEvidence[] = row.evidence.map(({ id, label, season, episode, start, end, scope, citations }) => ({
    id, label, season, episode, start, end, ...(scope === 'completed_episode' ? {scope} : {}), ...(Array.isArray(citations) && citations.every(c => c &&
      Number.isInteger(c.paragraph) && c.paragraph > 0 && Array.isArray(c.lineIds) && c.lineIds.every((id: unknown) => typeof id === 'string'))
      ? { citations: citations.map(({ paragraph, lineIds }) => ({ paragraph, lineIds: [...lineIds] })) } : {}),
  }));
  return { answer: row.answer, evidence, answer_status: 'answered', charge: false };
}

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
  const memoryReply = immediateMemoryResponse(question, position, history);
  if (memoryReply) return memoryReply;
  if (position.mediaType === 'tv' && storyRecallRequest(question) && (!checked || checked.limited && checked.sourceGap)) {
    return { answer: 'You’re asking about the earlier story. I’m missing the part that explains this, so I can’t give you a reliable reminder yet.',
      evidence:[], answer_status:'insufficient_evidence', charge:false };
  }
  // Missing dialogue cannot disprove a silent event or establish that its cause
  // is an intentional mystery. Preserve the distinction from an editor-verified
  // unresolved scene and from provider errors. Never recycle the rejected quote.
  if ((!checked || checked.limited && checked.sourceGap) && asksAboutDeath(question)) {
    return { answer: eventCoverageReply(question, formatTimestamp(position.seconds)) ??
        `I can’t verify what happened there from what I have by ${formatTimestamp(position.seconds)}.`,
      evidence: [], answer_status: 'insufficient_evidence', charge: false };
  }
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
