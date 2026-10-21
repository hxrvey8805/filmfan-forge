import type { JsonGenerator } from './answer.ts';
import { groqGenerator } from './groq.ts';
import { openRouterGenerator } from './openrouter.ts';
import { DEFAULT_EVIDENCE_BUDGET, OPENROUTER_EVIDENCE_BUDGET } from './scene-evidence.ts';

export function companionEvidenceBudget(env: (name: string) => string | undefined): number {
  // The legacy Groq request-size cap must not silently remove whole exchanges
  // on the separately configured OpenRouter route. Keep both bounds explicit.
  return env('COMPANION_AI_PROVIDER')?.trim() === 'openrouter' ? OPENROUTER_EVIDENCE_BUDGET : DEFAULT_EVIDENCE_BUDGET;
}

// Deployment is explicit. Adding a secret alone cannot change the live model,
// and failure of the selected service must never enable another provider.
export function companionGenerator(env: (name: string) => string | undefined,
  request: typeof fetch = fetch): JsonGenerator {
  const provider = env('COMPANION_AI_PROVIDER')?.trim() || 'groq';
  if (provider !== 'groq' && provider !== 'openrouter') {
    throw new Error('The companion is temporarily unavailable. Please try again later.');
  }
  const key = env(provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'GROQ_API_KEY')?.trim();
  if (!key) throw new Error('The companion is temporarily unavailable. Please try again later.');
  return provider === 'openrouter' ? openRouterGenerator(key, request) : groqGenerator(key, request);
}
