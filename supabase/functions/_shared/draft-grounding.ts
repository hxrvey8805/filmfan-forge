import type { Evidence, GroundedDraft } from './companion.ts';
import type { VerificationIssue } from './verification.ts';

const genericSubjects = new Set(('a an the what whats why how who which where when is are do does did can could ' +
  'would should tell explain describe remind please i we you he she it they his her their its this that these those ' +
  'one another someone anyone everyone nobody both neither each').split(' '));
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en');
const words = (text: string) => new Set(normalized(text).match(/[\p{L}\p{N}]+/gu) ?? []);
const capitals = (text: string) => text.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’-]*/gu) ?? [];
const speechVerbs = '(?:says|said|states|stated|tells|told|asks|asked|declares|declared|insists|insisted|expects|expected|argues|argued|claims|claimed|believes|believed|suspects|suspected|replies|replied|responds|responded|announces|announced|addresses|addressed|speaks|spoke)';
const namedSpeech = new RegExp(`(?<![\\p{L}\\p{N}])([\\p{Lu}][\\p{L}\\p{M}'’\\-]*(?: [\\p{Lu}][\\p{L}\\p{M}'’\\-]*)?)\\s+(?:${speechVerbs}|(?:is|was)\\s+[^.!?]{1,60}\\bwho\\s+${speechVerbs})\\b`, 'gu');

// Necessary grounding conditions, not a replacement for semantic verification.
// A name in the question cannot identify an unlabeled speaker in an unrelated
// exchange. These checks run before either writer draft reaches the verifier.
export function draftGroundingIssues(question: string, draft: GroundedDraft, evidence: Evidence[]): VerificationIssue[] {
  const questionNames = [...new Set(capitals(question).map(normalized))].filter(name => !genericSubjects.has(name));
  const byId = new Map(evidence.map(item => [item.id, item]));
  const issues = new Set<VerificationIssue>();
  for (const claim of draft.claims) {
    const cited = claim.evidenceIds.map(id => byId.get(id)?.text ?? '').join('\n');
    const citedWords = words(cited), claimWords = words(claim.text);
    if (questionNames.some(name => claimWords.has(name) && !citedWords.has(name))) issues.add('identity');
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
