import type { Evidence, GroundedDraft } from './companion.ts';
import type { VerificationIssue } from './verification.ts';

const genericSubjects = new Set(('a an the what whats why how who which where when is are do does did can could ' +
  'would should tell explain describe remind please i we you he she it they his her their its this that these those ' +
  'one another someone anyone everyone nobody both neither each').split(' '));
const sentenceWords = new Set(('at after before during earlier later meanwhile here there now then this these those ' +
  'in on for from by with without as but and or so yet however instead also only even finally captions i').split(' '));
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en');
const token = (text: string) => normalized(text).replaceAll('’', "'").replace(/'s$/, '');
const words = (text: string) => new Set((text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).map(token));
const capitals = (text: string) => text.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’-]*/gu) ?? [];
const speechVerbs = '(?:says?|said|saying|states?|stated|stating|tells?|told|telling|asks?|asked|asking|' +
  'declares?|declared|declaring|insists?|insisted|insisting|expects?|expected|expecting|argues?|argued|arguing|' +
  'claims?|claimed|claiming|believes?|believed|believing|suspects?|suspected|suspecting|replies|replied|replying|' +
  'responds?|responded|responding|announces?|announced|announcing|addresses|addressed|addressing|speaks?|spoke|spoken|speaking|' +
  'accuses?|accused|accusing|expresses|expressed|expressing|complains?|complained|complaining|denies|denied|denying|' +
  'disputes?|disputed|disputing|suggests?|suggested|suggesting|proposes?|proposed|proposing|promises?|promised|promising)';
// Progressive and perfect forms still attribute speech: "Mira is arguing" and
// "Mira has complained" need the same label as "Mira says". Saved failures
// slipped through the old present/past-only check and reversed the speakers.
const auxiliary = '(?:(?:is|are|was|were|has|have|had|been|being)\\s+){0,3}';
const namedSpeech = new RegExp(`(?<![\\p{L}\\p{N}])([\\p{Lu}][\\p{L}\\p{M}'’\\-]*(?: [\\p{Lu}][\\p{L}\\p{M}'’\\-]*)?)\\s+(?:${auxiliary}${speechVerbs}|(?:is|was)\\s+[^.!?]{1,60}\\bwho\\s+${speechVerbs})\\b`, 'gu');

// Necessary grounding conditions, not a replacement for semantic verification.
// A name in the question cannot identify an unlabeled speaker in an unrelated
// exchange. These checks run before either writer draft reaches the verifier.
export function draftGroundingIssues(question: string, draft: GroundedDraft, evidence: Evidence[]): VerificationIssue[] {
  const questionNames = [...new Set(capitals(question).map(token))].filter(name => !genericSubjects.has(name));
  const byId = new Map(evidence.map(item => [item.id, item]));
  // Names already present in the permitted source stay names even at the start
  // of an answer sentence. Their appearance in one scene cannot label speakers
  // in a different, uncited exchange.
  const sourceNames = new Set(evidence.flatMap(item => capitals(item.text).map(token)));
  const issues = new Set<VerificationIssue>();
  for (const claim of draft.claims) {
    const cited = claim.evidenceIds.map(id => byId.get(id)?.text ?? '').join('\n');
    const citedWords = words(cited), claimWords = words(claim.text);
    if (questionNames.some(name => claimWords.has(name) && !citedWords.has(name))) issues.add('identity');
    for (const match of claim.text.matchAll(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’-]*/gu)) {
      const name = token(match[0]);
      if (genericSubjects.has(name) || sentenceWords.has(name)) continue;
      const sentenceStart = !claim.text.slice(0, match.index).trim() || /[.!?]\s*$/.test(claim.text.slice(0, match.index));
      if ((!sentenceStart || sourceNames.has(name) || /^[A-Z]{2,}$/.test(match[0])) && !citedWords.has(name)) issues.add('identity');
    }
    // A name being called or mentioned is not a speaker label. Preserve real
    // labels from SDH/WebVTT; never propagate a guessed name across passages.
    for (const match of claim.text.matchAll(namedSpeech)) {
      const name = normalized(match[1]);
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+');
      const label = new RegExp(`(?:^|\\s)(?:\\(${escaped}\\)|${escaped}\\s*:)`, 'imu');
      if (!genericSubjects.has(name) && !label.test(cited)) issues.add('speaker');
    }
  }
  return [...issues];
}
