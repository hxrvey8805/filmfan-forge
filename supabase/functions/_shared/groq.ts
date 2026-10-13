import type { JsonGenerator } from './answer.ts';

// Groq retired llama-3.3-70b-versatile for developer accounts in August 2026.
export const COMPANION_MODEL = 'openai/gpt-oss-120b';

export function groqGenerator(key: string, request: typeof fetch = fetch): JsonGenerator {
  return async (system, user, maxTokens) => {
    const response = await request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: COMPANION_MODEL, temperature: 0,
        response_format: { type: 'json_object' }, reasoning_effort: 'medium', include_reasoning: false,
        // Reasoning shares the completion budget. The old 500-token verifier
        // budget could end before the model produced its final JSON verdict.
        max_completion_tokens: maxTokens + 4096,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      // Do not log provider bodies: they can echo private questions or evidence.
      console.error('Companion model request failed', { status: response.status, model: COMPANION_MODEL });
      throw new Error(response.status === 429 ? 'AI service busy. Please try again shortly.'
        : 'Unable to generate a checked answer. Please try again.');
    }
    const result = await response.json();
    if (result.choices?.[0]?.finish_reason !== 'stop') throw new Error('The answer was incomplete. Please try again.');
    // Only final content may enter the answer checker, never model reasoning.
    try { return JSON.parse(result.choices[0].message.content); } catch { return null; }
  };
}
