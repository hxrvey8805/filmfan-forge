import type { Evidence } from './companion.ts';
import { modelCaptionLines } from './caption-lines.ts';

// Surface cues, not a transcript reconstruction. Never propagate a label to
// the next caption, alternate guessed speakers, or resolve my/your to a name.
const name = "[\\p{L}][\\p{L}\\p{M}'’.-]*(?: [\\p{L}][\\p{L}\\p{M}'’.-]*){0,2}";
const leadingLabel = new RegExp(`^(?:\\(\\s*(${name})\\s*\\)|\\[\\s*(${name})\\s*\\]|(${name}):)\\s*(.+)$`, 'u');
const soundWords = /\b(?:music|laugh\w*|sigh\w*|gasp\w*|scream\w*|shout\w*|cry\w*|sob\w*|groan\w*|pant\w*|breath\w*|footsteps|knock\w*|door|phone|ring\w*|thunder|wind|speaking|whisper\w*|sing\w*|closes|opens|addressed)\b/i;
const anotherLabel = new RegExp(`(?:\\(|\\[)${name}(?:\\)|\\])|(?:^|\\s)${name}:`, 'u');
export const soundOnly = (text: string) => /^(?:\[[^\]]+\]\s*)+$/.test(text.trim());

export function captionSpeech(raw: string) {
  const text = modelCaptionLines(raw)[0].trim();
  const match = leadingLabel.exec(text);
  const candidate = match && (match[1] || match[2] || match[3]);
  // Mixed-speaker captions stay anonymous. Sound descriptions such as
  // [MIRA GASPS] are not labels authorizing attributed dialogue.
  const speaker = candidate && !soundWords.test(candidate) && !anotherLabel.test(match![4]) ? candidate : null;
  const words = speaker ? match![4] : text;
  return { speaker, words };
}

export function speechCues(raw: string) {
  const { words } = captionSpeech(raw);
  if (soundOnly(words)) return ['sound_only'];
  const cues: string[] = [];
  if (/\?/.test(words)) cues.push('question');
  if (/\b(?:will|shall|gonna|going to|intend\w*|plan to|want to|would you|could you|can you|let['’]s|take over|look after)\b/i.test(words)) cues.push('possible_request_or_intention');
  if (/\b(?:not|never|no|cannot|can['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|don['’]t|doesn['’]t|didn['’]t|haven['’]t|hasn['’]t)\b/i.test(words)) cues.push('negation');
  if (/\b(?:think|believe|suspect|maybe|perhaps|might|said to|supposed to)\b/i.test(words)) cues.push('belief_or_uncertainty');
  if (/\b(?:my|our)\b/i.test(words)) cues.push('speaker_possession');
  if (/\byour\b/i.test(words)) cues.push('addressee_possession');
  if (/^(?:(?:yes|yeah|yep|no|nope|okay|ok|oh|ah|uh|hmm|fine|right|all right|thank you|thanks)(?:\W|$))+$/i.test(words) || /^thanks? for (?:your )?(?:trust|help)[.!]?$/i.test(words)) cues.push('acknowledgement');
  return cues;
}

export function dialogueEvidence(evidence: Evidence[]) {
  return evidence.map(({ text, ...row }) => ({ ...row,
    lines: modelCaptionLines(text).map((text, i) => {
      const { speaker } = captionSpeech(text), cues = speechCues(text);
      return { id: `${row.id}:${i + 1}`, text,
        ...(speaker ? { explicitSpeaker: speaker } : {}), ...(cues.length ? { cues } : {}) };
    }),
  }));
}

// This deliberately recognizes only an unambiguous single request/intention.
// Mixed or incomplete clauses still require semantic review of the exchange.
export function prospectiveOnly(raw: string) {
  const { words } = captionSpeech(raw);
  if (/[.!?].*\p{L}/u.test(words) || /\b(?:but|because|although|since)\b/i.test(words)) return false;
  return /^(?:(?:would|could|can|will) you\b|(?:I|we|you|they)(?:['’]ll| (?:will|shall|intend to|plan to|want to|are going to))\b|I['’]m (?:going to|leaving)\b|let['’]s\b|(?:please )?(?:you )?take over\b|(?:please )?look after\b|(?:so )?you take care\b)/i.test(words);
}
