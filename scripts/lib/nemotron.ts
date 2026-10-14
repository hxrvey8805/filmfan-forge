import type { JsonGenerator } from '../../supabase/functions/_shared/answer.ts';

// Private evaluation only. The free endpoint links to NVIDIA API Trial Terms
// §§1.2–1.4, which exclude production use. Do not import into an edge function.
export const NEMOTRON_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const failureMessage = 'Unable to generate a checked answer. Please try again.';

export function nemotronGenerator(key: string, request: typeof fetch = fetch): JsonGenerator {
  if (!key.trim()) throw new Error('Configure OPENROUTER_API_KEY privately before using Nemotron.');
  return async (system, user, maxTokens) => {
    let response: Response;
    try {
      response = await request('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: NEMOTRON_MODEL,
          temperature: 0,
          stream: false,
          // Never fall back to a paid endpoint or a different model. Disable
          // plugins explicitly: an empty array inherits account defaults.
          // The evaluation workspace must not enforce locked-on plugins.
          provider: { only: ['nvidia'], allow_fallbacks: false,
            max_price: { prompt: 0, completion: 0, request: 0 } },
          plugins: [
            { id: 'web', enabled: false },
            { id: 'response-healing', enabled: false },
            { id: 'context-compression', enabled: false },
            { id: 'file-parser', enabled: false },
            { id: 'pareto-router', enabled: false },
            { id: 'fusion', enabled: false },
          ],
          tools: [],
          tool_choice: 'none',
          reasoning: { effort: 'medium', exclude: true },
          max_tokens: maxTokens + 4096,
          // This endpoint does not support response_format. Parse the complete
          // final JSON, then use the existing claim/citation/checker validators.
          messages: [{ role: 'system', content: `${system}\nReturn exactly one JSON object. No Markdown fences, commentary, or thinking text.` },
            { role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      // Transport errors can contain URLs or headers; never surface them.
      throw new Error(failureMessage);
    }
    if (!response.ok) {
      // Failed requests also consume the free daily quota. Do not auto-retry
      // 429s, or log provider bodies that may echo questions or credentials.
      console.error('Nemotron request failed', { status: response.status, model: NEMOTRON_MODEL });
      await response.body?.cancel();
      throw new Error(response.status === 429
        ? 'The free AI request limit has been reached. Please try again later.'
        : failureMessage);
    }
    const result = await response.json().catch(() => null);
    const choice = result?.choices?.[0];
    if (result?.error || choice?.error) throw new Error(failureMessage);
    if (choice?.finish_reason !== 'stop') throw new Error('The answer was incomplete. Please try again.');
    // Never recover a draft from reasoning, tool calls, or prose around JSON.
    const content = choice?.message?.content;
    if (typeof content !== 'string') return null;
    try {
      const value: unknown = JSON.parse(content);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
  };
}
