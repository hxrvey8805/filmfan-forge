import type { JsonGenerator } from './answer.ts';
import { groqGenerator } from './groq.ts';
import { openRouterGenerator } from './openrouter.ts';

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
