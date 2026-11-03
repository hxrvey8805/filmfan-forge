import { captionSpeech, prospectiveOnly, soundOnly, speechCues } from './dialogue-evidence.ts';
import { namedSpeechSubjects } from './draft-grounding.ts';

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en').replaceAll('’', "'");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const possessionNouns = 'parents?|mother|father|sisters?|brothers?|family|children|son|daughter|wife|husband|home|house|room|job|income|memories|life';
const possessions = new RegExp(`\\b([\\p{Lu}][\\p{L}\\p{M}'’-]*|(?:the )?speaker|(?:the )?listener|(?:the )?addressee)['’]s\\s+(${possessionNouns})\\b`, 'gu');

// Necessary textual conditions only. Matching a surface cue never proves a
// fact: the independent reviewer must still check the complete exchange.
export function storySpeechIssue(text: string, state: string, sourceLines: string[]): string | null {
  const dialogue = sourceLines.map(captionSpeech).filter(line => !soundOnly(line.words));
  if (!dialogue.length) return state === 'observation' ? null : 'sound';
  // A label elsewhere in a citation bundle cannot lend its identity to an
  // unlabeled reply. Multi-person facts should use neutral exchange wording.
  const named = namedSpeechSubjects(text);
  if (named.length && (new Set(named).size !== 1 || dialogue.some(line => !line.speaker || normalize(line.speaker) !== named[0]))) return 'speaker';

  for (const match of text.matchAll(possessions)) {
    const owner = normalize(match[1]), noun = normalize(match[2]);
    const phrase = new RegExp(`\\b${escape(owner)}'s\\s+${escape(noun)}\\b`, 'i');
    const first = new RegExp(`\\b(?:my|our)\\s+${escape(noun)}\\b`, 'i');
    const second = new RegExp(`\\byour\\s+${escape(noun)}\\b`, 'i');
    const established = dialogue.some(line => {
      if (phrase.test(normalize(line.words))) return true;
      if (/^(?:the )?speaker$/.test(owner)) return first.test(line.words);
      if (/^(?:the )?(?:listener|addressee)$/.test(owner)) return second.test(line.words);
      return line.speaker && normalize(line.speaker) === owner && first.test(line.words);
    });
    if (!established) return 'ownership';
  }
  // An anonymous "your parents" must not quietly become the speaker's own
  // family via a gendered pronoun. Keep listener-relative wording instead.
  const shifted = new RegExp(`\\b(?:his|her|their own)\\s+(${possessionNouns})\\b`, 'gi');
  for (const match of text.matchAll(shifted)) {
    const noun = escape(match[1]);
    if (dialogue.some(line => new RegExp(`\\byour\\s+${noun}\\b`, 'i').test(line.words)) &&
      !dialogue.some(line => new RegExp(`\\b(?:my|our|his|her|their)\\s+${noun}\\b`, 'i').test(line.words))) return 'ownership';
  }
  const substantive = sourceLines.filter(line => !soundOnly(captionSpeech(line).words) && !speechCues(line).includes('acknowledgement'));
  if (!substantive.length) return 'acknowledgement';
  if (substantive.every(prospectiveOnly) && !['proposal', 'question'].includes(state)) return 'proposal';
  if (state === 'denial' && !/\b(?:deny|denies|denied|denying|not|never|no|cannot|can['’]t|isn['’]t|wasn['’]t|doesn['’]t|didn['’]t|hasn['’]t|haven['’]t|reject\w*|disput\w*)\b/i.test(text)) return 'denial';
  if (state === 'question' && !/\b(?:asks?|asked|question\w*|wonders?|wondered)\b/i.test(text)) return 'question';
  return collectiveSpeechIssue(text, sourceLines);
}

export function collectiveSpeechIssue(text: string, sourceLines: string[]): string | null {
  // A repeated first-person denial plus a question does not establish two
  // people making the same admission. Without two explicitly labeled first-
  // person accounts, leave the number of believers/deniers unresolved.
  if (!/\b(?:mutual (?:denial|admission|belief|realization)|(?:both|each|two) (?:of )?(?:the )?(?:characters|speakers|people|participants)?[^.!?]{0,45}\b(?:deny|denies|denying|admit\w*|realiz\w*|believ\w*|agree\w*|recogniz\w*)|shared (?:belief|admission|realization))\b/i.test(text)) return null;
  const speakers = new Set(sourceLines.flatMap(raw => {
    const { speaker, words } = captionSpeech(raw);
    return speaker && /\b(?:I|my)\b/i.test(words) && !/\?/.test(words) ? [normalize(speaker)] : [];
  }));
  return speakers.size >= 2 ? null : 'collective_speaker';
}
