import { questionIntent, type Evidence, type GroundedDraft } from './companion.ts';

const questionWords = new Set(('what whats how why who whose which when where do does did is are was were can could would should ' +
  'tell explain describe please we you i me he she they them his her their the a an and with about between so far ' +
  'know relationship relationships related connection connections to of in this that these those').split(' '));
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en').replaceAll('’', "'").replace(/'s$/, '');

export function isRelationshipQuestion(question: string): boolean {
  return /\b(?:relationship|related to|connection (?:between|with|to))\b/i.test(question);
}

// A necessary focus check for explicitly named relationships. Correct facts
// about a nearby person must not answer a question about somebody else. This
// does not identify speakers or prove the relationship; grounding still must.
export function addressesNamedRelationship(question: string, claims: GroundedDraft['claims']): boolean {
  if (!isRelationshipQuestion(question)) return true;
  const names = [...new Set((question.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{M}'’-]*/gu) ?? [])
    .map(normalize))].filter(word => !questionWords.has(word));
  const answerWords = new Set((claims.map(claim => claim.text).join(' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [])
    .map(normalize));
  return names.every(name => answerWords.has(name));
}

// A recap of a long prefix cannot consist of several details from its opening.
// This checks breadth/order, not which events matter or whether claims are true.
export function coversRecap(question: string, claims: GroundedDraft['claims'], evidence: Evidence[]): boolean {
  if (questionIntent(question) !== 'recap') return true;
  if (claims.some(claim => claim.evidenceIds.length !== 1)) return false;
  const ids = claims.map(claim => claim.evidenceIds[0]);
  if (new Set(ids).size !== ids.length) return false;
  const ranks = ids.map(id => evidence.findIndex(item => item.id === id));
  if (ranks.some((rank, i) => rank < 0 || (i > 0 && rank < ranks[i - 1]))) return false;
  // Ignore sound-only passages and tiny exclamations when asking for breadth;
  // otherwise the model would be pressured to invent an event for a final gasp.
  const substantive = evidence.filter(item => (item.text.replace(/\[[^\]]*\]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []).length >= 12);
  if (substantive.length < 6) return true;
  const early = new Set(substantive.slice(0, Math.ceil(substantive.length / 3)).map(item => item.id));
  const late = new Set(substantive.slice(Math.floor(substantive.length * 2 / 3)).map(item => item.id));
  return ids.length >= 3 && ids.some(id => early.has(id)) && ids.some(id => late.has(id));
}
