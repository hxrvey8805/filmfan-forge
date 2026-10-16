import { buildPrompts, evidenceLabel, permittedEvidence, unavailableMemoryReply, validateDraft,
  type Conversation, type Evidence, type EvidenceCoverage, type ViewingPosition } from './companion.ts';
import { repairInstruction, verificationEvidence, verifiedSelection, VERIFICATION_PROMPT, type VerificationIssue } from './verification.ts';
import { draftGroundingIssues } from './draft-grounding.ts';
import { writerFormat, verifierFormat, type AnswerFormat } from './answer-schema.ts';

export type JsonGenerator = (system: string, user: string, maxTokens: number, purpose?: 'writer' | 'verifier', format?: AnswerFormat) => Promise<unknown>;

export type AnswerCheckStage = 'no_evidence' | 'memory_unavailable' | 'draft_invalid' | 'draft_insufficient' | 'draft_ungrounded' | 'verification_invalid' | 'verification_rejected' | 'answered' | 'answered_partial';
export type AnswerDiagnostics = { stage: AnswerCheckStage; evidenceCount: number; claimCount: number; attempts: number };

export async function checkedAnswer(question: string, position: ViewingPosition, evidence: Evidence[], history: Conversation[], generate: JsonGenerator,
  observe: (event: AnswerDiagnostics) => void = () => {}, coverage?: EvidenceCoverage) {
  const permitted = permittedEvidence(evidence, position);
  let attempts = 0;
  const report = (stage: AnswerCheckStage, claimCount = 0) => observe({ stage, evidenceCount: permitted.length, claimCount, attempts });
  if (unavailableMemoryReply(question, position, history)) { report('memory_unavailable'); return null; }
  if (!permitted.length) { report('no_evidence'); return null; }
  const prompts = buildPrompts(question, position, permitted, history, coverage);
  const aliases = new Map(prompts.data.evidence.map((item, index) => [item.id, permitted[index]]));
  let issues: VerificationIssue[] = [];
  // One fresh rewrite at most. Never send a rejected draft or checker prose to
  // the writer: both can contain invented/future details. Reuse the same gated
  // evidence and history, then independently check the replacement again.
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    const system = attempt === 0 ? prompts.system : `${prompts.system}\n${repairInstruction(issues)}`;
    const candidate = validateDraft(await generate(system, prompts.user, 1500, 'writer', writerFormat(prompts.data.evidence, prompts.maxClaims)), prompts.data.evidence);
    const draft = candidate && candidate.claims.length <= prompts.maxClaims && candidate.claims.every(claim => claim.text.length <= 260) ? candidate : null;
    if (!draft || draft.status !== 'answered') {
      if (attempt === 0) { issues = draft ? ['relevance'] : ['citation']; continue; }
      report(draft ? 'draft_insufficient' : 'draft_invalid'); return null;
    }
    const groundingIssues = draftGroundingIssues(question, draft, prompts.data.evidence);
    if (groundingIssues.length) {
      if (attempt === 0) { issues = groundingIssues; continue; }
      report('draft_ungrounded', draft.claims.length); return null;
    }
    // Include the complete selected context, not just the writer's chosen
    // excerpts: surrounding dialogue can contradict a plausible paraphrase.
    const verdict = await generate(VERIFICATION_PROMPT,
      JSON.stringify({ question, position, intent: prompts.data.intent, moment: prompts.data.moment,
        coverage: prompts.data.coverage, evidence: verificationEvidence(prompts.data.evidence), claims: draft.claims }), 1800, 'verifier', verifierFormat(prompts.data.evidence, draft.claims.length));
    const selection = verifiedSelection(verdict, draft.claims, prompts.data.evidence);
    if (!selection) { report('verification_invalid', draft.claims.length); return null; }
    if (selection.sufficient && selection.indexes.length) {
      const claims = selection.indexes.map(index => draft.claims[index]);
      const ids = new Set(claims.flatMap(claim => claim.evidenceIds));
      const citedEvidence = [...ids].map(id => aliases.get(id)!);
      report(claims.length === draft.claims.length ? 'answered' : 'answered_partial', claims.length);
      return { answer: claims.map(claim => claim.text.trim()).join('\n\n'),
        evidence: citedEvidence.map(item => ({ id: item.id, label: evidenceLabel(item),
          season: item.season, episode: item.episode, start: item.start, end: item.end })) };
    }
    issues = selection.issues.length ? selection.issues : ['relevance'];
    if (attempt === 1) { report('verification_rejected', draft.claims.length); return null; }
  }
  return null;
}
