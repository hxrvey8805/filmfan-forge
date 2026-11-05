import { captionSpeech, prospectiveOnly, soundOnly, speechCues } from './dialogue-evidence.ts';
import { namedSpeechSubjects } from './draft-grounding.ts';

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en').replaceAll('’', "'");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const possessionNouns = 'parents?|mother|mom|mum|father|dad|sisters?|brothers?|family|children|son|daughter|wife|husband|home|house|room|job|income|memories|life';
const nounPattern = (noun: string) => /^(?:mother|mom|mum)$/i.test(noun) ? '(?:mother|mom|mum)' :
  /^(?:father|dad)$/i.test(noun) ? '(?:father|dad)' : escape(noun);
const possessions = new RegExp(`\\b([\\p{Lu}][\\p{L}\\p{M}'’-]*|(?:the )?speaker|(?:the )?listener|(?:the )?addressee)['’]s\\s+(${possessionNouns})\\b`, 'gu');

// Necessary textual conditions only. Matching a surface cue never proves a
// fact: the independent reviewer must still check the complete exchange.
export function storySpeechIssue(text: string, state: string, sourceLines: string[]): string | null {
  const dialogue = sourceLines.map(captionSpeech).filter(line => !soundOnly(line.words));
  if (!dialogue.length) return state === 'observation' ? null : 'sound';
  // A label elsewhere in a citation bundle cannot lend its identity to an
  // unlabeled reply. Multi-person facts should use neutral exchange wording.
  if (dialogue.some(line => !line.speaker) &&
    /\b(?:the same (?:voice|speaker)|one (?:voice|speaker|person)\b[^.!?]{1,140}\b(?:the other|another (?:voice|speaker))|(?:the|one) (?:voice|speaker)\b[^.!?]{1,80}\bthen (?:asks?|tells?|urges?|suggests?|insists?))\b/i.test(text)) return 'speaker';
  const named = namedSpeechSubjects(text);
  if (named.length && (new Set(named).size !== 1 || dialogue.some(line => !line.speaker || normalize(line.speaker) !== named[0]))) return 'speaker';

  // Anonymous first-person captions cannot establish a speaker's gender.
  // Preserve third-person references actually present in the cited words,
  // but do not import a remembered character through she/he instead of a name.
  if (dialogue.every(line => !line.speaker)) {
    const proof = dialogue.map(line => line.words).join(' ');
    for (const family of [/\b(?:she|her|hers|herself)\b/i, /\b(?:he|him|his|himself)\b/i]) {
      if (family.test(text) && !family.test(proof)) return 'speaker';
    }
  }
  const proofWords = dialogue.map(line => line.words).join(' ');
  // A mentioned person is not automatically a sibling or romantic partner.
  // These specific relationships need words in the cited evidence, not cast
  // knowledge. The semantic reviewer still checks whose relationship it is.
  for (const relation of ['sister', 'brother', 'cousin', 'wife', 'husband']) {
    const mention = new RegExp(`\\b${relation}(?:s)?\\b`, 'i');
    if (mention.test(text) && !mention.test(proofWords)) return 'relationship';
  }
  if (/\b(?:agreed|agrees|accepted|secured (?:a |the )?promise)\b/i.test(text) &&
      !/\b(?:agree\w*|accept\w*|I (?:promise|swear)|of course|yes)\b/i.test(proofWords)) return 'agreement';

  for (const match of text.matchAll(possessions)) {
    const owner = normalize(match[1]), noun = nounPattern(normalize(match[2]));
    const phrase = new RegExp(`\\b${escape(owner)}'s\\s+${noun}\\b`, 'i');
    const first = new RegExp(`\\b(?:my|our)\\s+${noun}\\b`, 'i');
    const second = new RegExp(`\\byour\\s+${noun}\\b`, 'i');
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
    const noun = nounPattern(match[1]);
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

// These words add a concrete status, medium or intent to otherwise neutral
// dialogue. Hedges don't license that addition. The full source review is
// still required even when the necessary lexical support exists.
export function unsupportedFrame(comment: string, proof: string) {
  // A question about an obligation does not establish the obligation. Check
  // clauses independently: a later "so it is required" can undo a faithful lead.
  const obligation = /\b(?:must|ha(?:s|ve|d) to|need(?:s|ed)? to|requir\w*|mandatory|compulsory|necess(?:ary|ity)|a condition)\b/i;
  const sourceSentences = proof.split(/(?<=[.?!])\s+/u);
  if (sourceSentences.some(s => s.includes('?') && obligation.test(s)) &&
    !sourceSentences.some(s => !s.includes('?') && (obligation.test(s) || /^\s*(?:yes|correct|you do)\b/i.test(s)))) {
    const clauses = comment.split(/[,;:]|\s+(?:so|therefore|which (?:means|makes)|but (?:actually|in fact))\s+/i);
    if (clauses.some(c => obligation.test(c) && !/\?|\b(?:if|whether|ask\w*|wonder\w*|question\w*|unclear|unknown|unanswered|unsure)\b/i.test(c))) return true;
  }
  // A sequence alone cannot establish that an instruction was caused by the preceding exchange.
  if (/\b(?:which is why|that's why|that is why|so that explains why|as a direct result|the reason for)\b/i.test(comment) &&
    !/\b(?:because|that.s why|the reason|since|as a result)\b/i.test(proof)) return true;
  // When the dialogue offers rival glosses of a word, don't allow the writer
  // to substitute another nearby event for one of the definitions.
  if (/\b(?:translation|definition|translates?|means?|word)\b/i.test(comment) &&
    /\b(?:turns?|rather than|instead of|versus|vs\.?|two (?:different )?(?:translations|meanings))\b/i.test(comment)) {
    const glosses = [...proof.matchAll(/\bmeans?\s+(?!of\b)([a-z][^.!?\n]{2,70})|\bmeans?\?\s*[-–—]\s*([a-z][^.!?\n]{2,70})/gi)]
      .map(match => normalize(match[1] ?? match[2]).match(/[a-z]{3,}/g)?.filter(w => !['the','and','for','that','with','more','less','what','this','just'].includes(w)) ?? []);
    if (glosses.length >= 2 && glosses.some(words => words.length && !words.some(w => new RegExp('\\b'+escape(w)+'\\b','i').test(comment)))) return true;
  }
  // A direction to pack or go is not evidence that a departure took place.
  if (/\b(?:actual|physical|immediate|hasty) departure\b|\b(?:they|he|she|the group) (?:departed|depart|set off)\b/i.test(comment) &&
    !/\b(?:departed|set off|have left|has left|we left|they left)\b/i.test(proof)) return true;
  // A humorous-sounding line alone does not tell us that someone meant it
  // as a joke or used it deliberately to deflect a question.
  if (/\b(?:deflect\w*|dodg\w*) (?:it |the question )?(?:with|by)|\b(?:jokes?|joked|joking) (?:to avoid|to deflect|about)\b/i.test(comment) &&
    !/\b(?:jok\w*|deflect\w*|dodg\w*)\b/i.test(proof)) return true;
  const frames = [
    // A disagreement about a description doesn't establish its physical medium.
    /\b(?:files?|dossiers?|paperwork|documents?|records?)\b/i,
    /\b(?:forg(?:ed|ery)|fabricat\w*|feign\w*|fake|faking|counterfeit|pretend\w*)\b/i,
    /\b(?:mass media|media|public records?|published|press coverage)\b/i,
    /\b(?:legal guardian\w*|guardianship|custody)\b/i,
    /\b(?:sarcas\w*|sarcastic\w*)\b/i,
    /\b(?:deliberate\w*|on purpose|intentionally)\b/i,
  ];
  if (/\b(?:the (?:entire|sole|only) (?:reason|basis)|manufactured urgency|urgency is manufactured|power grab)\b/i.test(comment) &&
    !/\b(?:sole|only (?:reason|because)|because|manufactur\w*|seiz\w* power)\b/i.test(proof)) return true;
  return frames.some((frame) => frame.test(comment) && !frame.test(proof));
}
