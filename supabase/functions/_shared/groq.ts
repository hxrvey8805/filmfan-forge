import type { JsonGenerator } from './answer.ts';

// Groq retired llama-3.3-70b-versatile for developer accounts in August 2026.
export const COMPANION_MODEL = 'openai/gpt-oss-120b';

export function groqGenerator(key: string, request: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): JsonGenerator {
  return async (system, user, maxTokens) => {
    const send = () => request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: COMPANION_MODEL, temperature: 0,
        response_format: { type: 'json_object' }, reasoning_effort: 'medium', include_reasoning: false,
        // Reasoning shares the completion budget. The old 500-token verifier
        // budget could end before the model produced its final JSON verdict.
        // Keep room for reasoning without reserving most of the free plan's
        // per-minute allowance for each of the two generation passes.
        max_completion_tokens: maxTokens + 2048,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    let response = await send();
    const retryHeader = response.headers.get('retry-after');
    const retrySeconds = retryHeader === null ? NaN : Number(retryHeader);
    // Honor a short provider-requested cooldown once. Never retry a daily quota
    // or loop indefinitely; failures cannot publish or charge for a draft.
    if (response.status === 429 && Number.isFinite(retrySeconds) && retrySeconds >= 0 && retrySeconds <= 15) {
      await response.body?.cancel();
      await wait(Math.max(1000, Math.ceil(retrySeconds * 1000)));
      response = await send();
    }
    if (!response.ok) {
      // Do not log provider bodies: they can echo private questions or evidence.
      console.error('Companion model request failed', { status: response.status, model: COMPANION_MODEL });
      if (response.status === 429) {
        // Numeric quota diagnostics only; never log prompts, keys or bodies.
        const numericHeader = (name: string) => {
          const value = response.headers.get(name);
          return value !== null && /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
        };
        console.error('Companion quota', {
          retryAfterSeconds: numericHeader('retry-after'),
          tokenLimit: numericHeader('x-ratelimit-limit-tokens'),
          remainingTokens: numericHeader('x-ratelimit-remaining-tokens'),
          remainingRequests: numericHeader('x-ratelimit-remaining-requests'),
        });
      }
      throw new Error(response.status === 429 ? 'AI service busy. Please try again shortly.'
        : 'Unable to generate a checked answer. Please try again.');
    }
    const result = await response.json();
    if (result.choices?.[0]?.finish_reason !== 'stop') throw new Error('The answer was incomplete. Please try again.');
    // Only final content may enter the answer checker, never model reasoning.
    try { return JSON.parse(result.choices[0].message.content); } catch { return null; }
  };
}
