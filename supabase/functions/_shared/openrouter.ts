import type { JsonGenerator } from './answer.ts';

// Pin a free endpoint; never route to paid models or unreviewed providers.
export const OPENROUTER_MODEL = 'dots-studio/dots-3-note-preview:free';
const failureMessage = 'Unable to generate a checked answer. Please try again.';

export function openRouterGenerator(key: string, request: typeof fetch = fetch): JsonGenerator {
  if (!key.trim()) throw new Error('Configure OPENROUTER_API_KEY privately before using OpenRouter.');
  // One generator serves a complete answer, including verification/repair.
  // Keep all model calls within one budget, leaving time for subtitle import.
  const deadline = Date.now() + 90000;
  return async (system, user, maxTokens) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error(failureMessage);
    let response: Response;
    try {
      response = await request('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0,
          stream: false,
          // Never fall back to a paid endpoint or a different model. Disable
          // plugins explicitly: an empty array inherits account defaults.
          // The serving workspace must not enforce locked-on plugins.
          provider: { only: ['atlas-cloud/fp8'], allow_fallbacks: false, require_parameters: true,
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
          reasoning: { enabled: true, exclude: true },
          max_tokens: maxTokens + 4096,
          // JSON mode controls shape; the claim checker still controls publication.
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: `${system}\nReturn exactly one JSON object. No Markdown fences, commentary, or thinking text.` },
            { role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(Math.min(45000, remainingMs)),
      });
    } catch {
      // Transport errors can contain URLs or headers; never surface them.
      throw new Error(failureMessage);
    }
    if (!response.ok) {
      // Failed requests also consume the free daily quota. Do not auto-retry
      // 429s, or log provider bodies that may echo questions or credentials.
      console.error('OpenRouter request failed', { status: response.status, model: OPENROUTER_MODEL });
      await response.body?.cancel();
      throw new Error(response.status === 429
        ? 'The free AI request limit has been reached. Please try again later.'
        : failureMessage);
    }
    const result = await response.json().catch(() => null);
    const choice = result?.choices?.[0];
    if (result?.error || choice?.error) throw new Error(failureMessage);
    if (choice?.message?.tool_calls?.length || choice?.message?.annotations?.length) throw new Error(failureMessage);
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
