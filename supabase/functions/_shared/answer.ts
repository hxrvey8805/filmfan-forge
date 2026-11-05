import { conversationMemory, questionIntent, buildPrompts, evidenceLabel, permittedEvidence, unavailableMemoryReply, validateDraft,
  type Conversation, type Evidence, type EvidenceCoverage, type ViewingPosition } from './companion.ts';
import { repairInstruction, verificationEvidence, verifiedSelection, VERIFICATION_PROMPT, type VerificationIssue } from './verification.ts';
import { draftGroundingIssues } from './draft-grounding.ts';
import { writerFormat, verifierFormat, type AnswerFormat } from './answer-schema.ts';
import { addressesNamedRelationship, coversRecap } from './question-focus.ts';
import { reviewedSceneAnswer, type PreparedSceneNote } from './reviewed-scenes.ts';
import { ProviderUnavailable } from './provider-unavailable.ts';
import { localCaptionExcerpts } from './caption-excerpts.ts';
import { broadDiscussion, exchangeCommentary } from './exchange-commentary.ts';
import { retrievalTerms } from './scene-evidence.ts';
import { reviewedAttribution } from './reviewed-attribution.ts';
import { wordplayAnswer } from './wordplay.ts';
import { directDialogue } from './direct-dialogue.ts';
import { questionFit } from './question-fit.ts';
import { storyExplanation } from './story-explanation.ts';
import { detailExplanation } from './detail-explanation.ts';

export type JsonGenerator = (system: string, user: string, maxTokens: number, purpose?: 'writer' | 'verifier' | 'analyst', format?: AnswerFormat) => Promise<unknown>;

export type AnswerCheckStage = 'no_evidence' | 'memory_unavailable' | 'draft_invalid' | 'draft_insufficient' | 'draft_ungrounded' | 'verification_invalid' | 'verification_rejected' | 'answered' | 'answered_partial' | 'caption_limited' | 'reviewed_answered' | 'reviewed_limited' | 'dialogue_answered' | 'dialogue_limited' | 'story_explained' | 'provider_limited' | 'exchange_explained';
export type AnswerDiagnostics = { stage: AnswerCheckStage; evidenceCount: number; claimCount: number; attempts: number };

// Public orchestration: reviewed notes, then a separately checked factual
// explanation + optional interpretation, then literal source context. A failed
// draft never enters the fallback, a repair prompt, or later story memory.
export async function companionAnswer(question: string, position: ViewingPosition, evidence: Evidence[], history: Conversation[], generate: JsonGenerator,
  observe: (event: AnswerDiagnostics) => void = () => {}, coverage?: EvidenceCoverage, reviewedNotes: PreparedSceneNote[] = [], options: { experimentalCaptionWriter?: boolean } = {}) {
  const permitted = permittedEvidence(evidence, position);
  if (unavailableMemoryReply(question, position, history)) {
    observe({ stage: 'memory_unavailable', evidenceCount: permitted.length, claimCount: 0, attempts: 0 }); return null;
  }
  let attempts = 0;
  const tracked: JsonGenerator = (...args) => { attempts++; return generate(...args); };
  const broad = broadDiscussion(question);
  const specific = !broad && questionIntent(question) === 'explanation';
  try {
    if (specific) {
      const cited = reviewedAttribution(question, position, reviewedNotes);
      if (cited) {
        observe({ stage: 'reviewed_limited', evidenceCount: permitted.length, claimCount: 1, attempts });
        return cited;
      }
    }
    if (specific || (!broad && /\b(?:funny|joke|gag|amusing|humou?r(?:ous)?|comic|hilarious|punchline)\b/i.test(question))) {
      const reading = await wordplayAnswer(question, position, permitted, history, tracked, false) ??
        await detailExplanation(question, position, permitted, history, tracked);
      if (reading) {
        observe({ stage: reading.limited ? 'dialogue_limited' : 'dialogue_answered', evidenceCount: permitted.length, claimCount: reading.evidence.length, attempts });
        return reading;
      }
    }
    if (reviewedNotes.length) {
      const reviewed = await reviewedSceneAnswer(question, position, reviewedNotes, history, tracked);
      if (reviewed) {
        // A relevant quotation cannot make a paragraph about a different exchange relevant.
        const explanationOnly = reviewed.answer.replace(/ The dialogue puts it this way: “[^\n]*”/g, '');
        const focal = question.split(/\b(?:before|after|despite|even though|instead of)\b/i);
        const subject = specific && focal.length > 1 ? retrievalTerms(focal[0], [], position).slice(-2) : [];
        const words = new Set(explanationOnly.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
        const subjectMissing = subject.length > 0 && subject.every(term => !words.has(term));
        const relevant = !subjectMissing && (!specific || reviewed.limited ||
          await questionFit(question, explanationOnly, conversationMemory(history, position).map(row => row.question.slice(0, 400)), tracked) === 'direct');
        if (relevant) {
          observe({ stage: reviewed.limited ? 'reviewed_limited' : 'reviewed_answered', evidenceCount: permitted.length,
            claimCount: reviewed.evidence.length, attempts });
          return reviewed;
        }
      }
    }
    if (!permitted.length) {
      observe({ stage: 'no_evidence', evidenceCount: 0, claimCount: 0, attempts }); return null;
    }
    if (specific) {
      const direct = await directDialogue(question, position, permitted, history, tracked, reviewedNotes);
      if (direct) {
        observe({ stage: direct.limited ? 'dialogue_limited' : 'dialogue_answered', evidenceCount: permitted.length,
          claimCount: direct.evidence.length, attempts });
        return direct;
      }
      const excerpt = localCaptionExcerpts(question, position, permitted);
      observe({ stage: 'caption_limited', evidenceCount: permitted.length, claimCount: excerpt?.evidence.length ?? 0, attempts });
      return excerpt;
    }
    // Free caption-only commentary still fails the manual release suite. Only the
    // private replay opts in. No request body or provider output can enable it.
    const explanation = broad ? (options.experimentalCaptionWriter === true
      ? await exchangeCommentary(question, position, permitted, history, tracked) : null)
      : await storyExplanation(question, position, permitted, history, tracked, coverage);
    if (explanation) {
      observe({ stage: broad ? 'exchange_explained' : 'story_explained', evidenceCount: permitted.length, claimCount: explanation.evidence.length, attempts });
      return explanation;
    }
  } catch (error) {
    if (!(error instanceof ProviderUnavailable)) throw error;
    const excerpts = error.canShowSource ? localCaptionExcerpts(question, position, permitted) : null;
    observe({ stage: 'provider_limited', evidenceCount: permitted.length, claimCount: excerpts?.evidence.length ?? 0, attempts });
    if (excerpts) return { ...excerpts, answer: error.message + '\n\n' + excerpts.answer };
    return { limited: true as const, answer: error.message, evidence: [] };
  }
  const excerpts = localCaptionExcerpts(question, position, permitted);
  observe({ stage: excerpts ? 'caption_limited' : 'draft_insufficient', evidenceCount: permitted.length,
    claimCount: excerpts?.evidence.length ?? 0, attempts });
  return excerpts;
}

// Retained for adversarial/regression evaluation of the old paraphrase path.
// Production and replay entry points must use companionAnswer above.
export async function checkedAnswer(question: string, position: ViewingPosition, evidence: Evidence[], history: Conversation[], generate: JsonGenerator,
  observe: (event: AnswerDiagnostics) => void = () => {}, coverage?: EvidenceCoverage, reviewedNotes: PreparedSceneNote[] = []) {
  const permitted = permittedEvidence(evidence, position);
  let attempts = 0;
  const report = (stage: AnswerCheckStage, claimCount = 0) => observe({ stage, evidenceCount: permitted.length, claimCount, attempts });
  if (unavailableMemoryReply(question, position, history)) { report('memory_unavailable'); return null; }
  if (reviewedNotes.length) {
    const reviewed = await reviewedSceneAnswer(question, position, reviewedNotes, history, (...args) => {
      attempts++;
      return generate(...args);
    });
    if (reviewed) { report(reviewed.limited ? 'reviewed_limited' : 'reviewed_answered', reviewed.evidence.length); return reviewed; }
  }
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
    const candidate = validateDraft(await generate(system, prompts.user, 1500, 'writer', writerFormat(prompts.data.evidence, prompts.maxClaims, prompts.maxCitations)), prompts.data.evidence);
    const draft = candidate && candidate.claims.length <= prompts.maxClaims && candidate.claims.every(claim => claim.text.length <= 260) ? candidate : null;
    if (!draft || draft.status !== 'answered') {
      if (attempt === 0) { issues = draft ? ['relevance'] : ['citation']; continue; }
      report(draft ? 'draft_insufficient' : 'draft_invalid'); return null;
    }
    const groundingIssues = draftGroundingIssues(question, draft, prompts.data.evidence);
    if (!addressesNamedRelationship(question, draft.claims)) groundingIssues.push('relevance');
    if (!coversRecap(question, draft.claims, prompts.data.evidence)) groundingIssues.push('relevance');
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
      // A checker can remove the only relevant claim and still approve the
      // remainder. Apply the same focus requirement to the returned subset.
      if (!addressesNamedRelationship(question, claims) || !coversRecap(question, claims, prompts.data.evidence)) {
        issues = ['relevance'];
        if (attempt === 0) continue;
        report('verification_rejected', claims.length); return null;
      }
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
