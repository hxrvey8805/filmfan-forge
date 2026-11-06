import type { JsonGenerator } from './answer.ts';
import { groqGenerator } from './groq.ts';
import { openRouterGenerator } from './openrouter.ts';
import { solGenerator } from './openrouter-sol.ts';
import type { SolBudget } from './sol-budget.ts';
import { DEFAULT_EVIDENCE_BUDGET, OPENROUTER_EVIDENCE_BUDGET } from './scene-evidence.ts';

export function companionAnswerOptions(env: (name: string) => string | undefined) {
  return { captionDiscussion: env('COMPANION_AI_PROVIDER')?.trim() === 'openrouter-sol' };
}

// The caller passes the user returned by Auth.getUser(), never the request
// body or user-editable profile metadata.
export function companionReleaseFor(user: { app_metadata: Record<string, unknown> }, env: (name: string) => string | undefined) {
  const enrolled = user.app_metadata.cinegeek_visual_beta === true;
  const noteTables = enrolled
    ? ['companion_scene_notes', 'companion_visual_notes']
    : ['companion_scene_notes'];
  return { noteTables, answerOptions: { captionDiscussion: enrolled && companionAnswerOptions(env).captionDiscussion } };
}

export function companionEvidenceBudget(env: (name: string) => string | undefined): number {
  // The legacy Groq request-size cap must not silently remove whole exchanges
  // on the separately configured OpenRouter route. Keep both bounds explicit.
  return ['openrouter', 'openrouter-sol'].includes(env('COMPANION_AI_PROVIDER')?.trim() ?? '') ? OPENROUTER_EVIDENCE_BUDGET : DEFAULT_EVIDENCE_BUDGET;
}

// Deployment is explicit. Adding a secret alone cannot change the live model,
// and failure of the selected service must never enable another provider.
export function companionGenerator(env: (name: string) => string | undefined,
  request: typeof fetch = fetch, solBudget?: SolBudget): JsonGenerator {
  const provider = env('COMPANION_AI_PROVIDER')?.trim() || 'groq';
  if (!['groq', 'openrouter', 'openrouter-sol'].includes(provider)) {
    throw new Error('The companion is temporarily unavailable. Please try again later.');
  }
  const key = env(provider === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY')?.trim();
  if (!key) throw new Error('The companion is temporarily unavailable. Please try again later.');
  if (provider === 'openrouter-sol') {
    if (!solBudget) throw new Error('The companion is temporarily unavailable. Please try again later.');
    return solGenerator(key, solBudget, request);
  }
  return provider === 'openrouter' ? openRouterGenerator(key, request) : groqGenerator(key, request);
}
