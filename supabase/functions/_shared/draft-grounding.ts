import type { Evidence, GroundedDraft } from './companion.ts';
import type { VerificationIssue } from './verification.ts';
import { unqualifiedCaptionAction } from './action-grounding.ts';

const genericSubjects = new Set(('a an the what whats why how who which where when is are do does did can could ' +
  'would should tell explain describe remind please i we you he she it they his her their its this that these those ' +
  'one another someone anyone everyone nobody both neither each ' +
  // Kinship/address words are roles, not invented proper names. Their actual
  // relationship and attribution still require independent contextual proof.
  'grandpa granddad grandad grandma granny dad daddy papa mom mum mommy mummy ' +
  "i'm i'll i've i'd you're you'll you've you'd he's he'll he'd she's she'll she'd it's it'll it'd " +
  "we're we'll we've we'd they're they'll they've they'd that's that'll what's who's").split(' '));
const sentenceWords = new Set(('at after before during earlier later meanwhile here there now then this these those ' +
  'in on for from by with without as but and or so yet however instead also only even finally captions i').split(' '));
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en');
const token = (text: string) => normalized(text).replaceAll('’', "'").replace(/'s$/, '');
const words = (text: string) => new Set((text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).map(token));
// Some OCR subtitle editions systematically render lowercase l as uppercase I.
// Keep original receipts untouched. Add only this narrow token equivalent
// when several distinct ordinary words in the cited text show the same defect.
// This is not fuzzy name matching or a substitute for attribution review.
export function captionIdentityWords(text:string) {
  const result=words(text);
  if(new Set(text.match(/\b[a-z]+I[a-z]+\b/g)??[]).size<3)return result;
  for(const word of text.match(/[\p{L}]+/gu)??[]) {
    if(/[a-z]I(?=[a-z])/.test(word))result.add(token(word.replace(/(?<=[a-z])I(?=[a-z])/g,'l')));
  }
  return result;
}
const capitals = (text: string) => text.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’-]*/gu) ?? [];
const speechVerbs = '(?:says?|said|saying|states?|stated|stating|tells?|told|telling|asks?|asked|asking|' +
  'confirms?|confirmed|confirming|notes?|noted|noting|advises?|advised|advising|clarifies|clarified|clarifying|' +
  'declares?|declared|declaring|insists?|insisted|insisting|expects?|expected|expecting|argues?|argued|arguing|' +
  'claims?|claimed|claiming|believes?|believed|believing|suspects?|suspected|suspecting|replies|replied|replying|' +
  'responds?|responded|responding|announces?|announced|announcing|addresses|addressed|addressing|speaks?|spoke|spoken|speaking|' +
  'accuses?|accused|accusing|expresses|expressed|expressing|complains?|complained|complaining|denies|denied|denying|' +
  'disputes?|disputed|disputing|suggests?|suggested|suggesting|proposes?|proposed|proposing|promises?|promised|promising|' +
  'offers?|offered|offering|admits?|admitted|admitting|reports?|reported|reporting|denies|denied|denying|' +
  'thanks?|thanked|thanking|explains?|explained|explaining|describes?|described|describing|' +
  'warns?|warned|warning|requests?|requested|requesting|reiterates?|reiterated|reiterating|introduces?|introduced|introducing)';
// Progressive and perfect forms still attribute speech: "Mira is arguing" and
// "Mira has complained" need the same label as "Mira says". Saved failures
// slipped through the old present/past-only check and reversed the speakers.
const auxiliary = '(?:(?:is|are|was|were|has|have|had|been|being)\\s+){0,3}';
const namedSpeech = new RegExp(`(?<![\\p{L}\\p{N}])([\\p{Lu}][\\p{L}\\p{M}'’\\-]*(?: [\\p{Lu}][\\p{L}\\p{M}'’\\-]*)?)\\s+(?:${auxiliary}${speechVerbs}|(?:is|was)\\s+[^.!?]{1,60}\\bwho\\s+${speechVerbs})\\b`, 'gu');
// "Mira is described as a cousin" describes Mira; it does not say she spoke.
// Preserve active progressive/perfect forms such as "Mira has described...".
const passiveSpeech = /\b(?:is|are|was|were|be|been|being)\s+(?:[\p{L}]+ed|said|told|spoken)\b/u;
const speechMatches = (text: string) => [...text.matchAll(namedSpeech)].filter(match => !passiveSpeech.test(match[0]) && !/^(?:Strictly|Generally|Technically|Broadly) speaking$/i.test(match[0]));

export function namedSpeechSubjects(text: string): string[] {
  // A capitalized clause opener is not part of the person's name: "When Mira
  // says..." refers to Mira, not a character called "When Mira".
  return speechMatches(text).map(match => normalized(match[1]).replace(/^(?:when|while|as|if|because|although|but|and|then|later)\s+/, ''))
    .map(name=>name.replace(/['’]s$/i,''))
    .filter(name => !genericSubjects.has(name));
}

// Point the independent reviewer to already-permitted context that may resolve
// a name missing from the chosen quotes. Presence alone never proves a binding.
// Only source-backed words may later be reused as rewrite hints.
export function groundingContextHints(text:string, quotes:string, evidence:Pick<Evidence,'id'|'text'>[]) {
  const cited=words(quotes);
  const missing=[...new Set(capitals(text).map(token))].filter(name=>!genericSubjects.has(name)&&!sentenceWords.has(name)&&!cited.has(name));
  const contextCandidates=missing.flatMap(name=>{
    const sourceIds=evidence.filter(e=>words(e.text).has(name)).map(e=>e.id);
    return sourceIds.length?[{word:name,sourceIds}]:[];
  });
  return {missingNames:missing,contextCandidates};
}

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
    if (unqualifiedCaptionAction(claim.text)) issues.add('action');
    const cited = claim.evidenceIds.map(id => byId.get(id)?.text ?? '').join('\n');
    const citedWords = captionIdentityWords(cited), claimWords = words(claim.text);
    if (questionNames.some(name => claimWords.has(name) && !citedWords.has(name))) issues.add('identity');
    for (const match of claim.text.matchAll(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’-]*/gu)) {
      const name = token(match[0]);
      if (genericSubjects.has(name) || sentenceWords.has(name)) continue;
      // Common descriptive wording is not a newly introduced person or
      // institution. The semantic reviewer must still ground the treatment;
      // this does not license "VIP says..." or an unknown acronym such as FBI.
      if (match[0] === 'VIP' && /^\s+(?:treatment|service|experience)\b/i.test(claim.text.slice(match.index! + match[0].length))) continue;
      const sentenceStart = !claim.text.slice(0, match.index).trim() || /[.!?][”"'’\)\]]*\s*$/.test(claim.text.slice(0, match.index));
      if ((!sentenceStart || sourceNames.has(name) || /^[A-Z]{2,}$/.test(match[0])) && !citedWords.has(name)) issues.add('identity');
    }
    // A name being called or mentioned is not a speaker label. Preserve real
    // labels from SDH/WebVTT; never propagate a guessed name across passages.
    for (const match of speechMatches(claim.text)) {
      const name = normalized(match[1]);
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+');
      const label = new RegExp(`(?:^|\\s)(?:\\(\\s*${escaped}\\s*\\)|\\[\\s*${escaped}\\s*\\]|${escaped}\\s*:)`, 'imu');
      if (!genericSubjects.has(name) && !label.test(cited)) issues.add('speaker');
    }
  }
  return [...issues];
}
