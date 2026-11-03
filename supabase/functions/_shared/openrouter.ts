import type { JsonGenerator } from './answer.ts';

// Pin a free endpoint; never route to paid models or unreviewed providers.
export const OPENROUTER_MODEL = 'dots-studio/dots-3-note-preview:free';
const failureMessage = 'Unable to generate a checked answer. Please try again.';

export function openRouterGenerator(key: string, request: typeof fetch = fetch): JsonGenerator {
  if (!key.trim()) throw new Error('Configure OPENROUTER_API_KEY privately before using OpenRouter.');
  // One generator serves a complete answer, including verification/repair.
  // Keep all model calls within one budget, leaving time for subtitle import.
  const deadline = Date.now() + 90000;
  return async (system, user, maxTokens, purpose, format) => {
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
          // The fast draft is untrusted. Keep reasoning enabled for the check:
          // direct-mode checks approved invented actions in the saved replays.
          // This is a total completion limit, not a separate reasoning cap.
          reasoning: { enabled: purpose === 'verifier' || purpose === 'analyst', exclude: true },
          max_tokens: maxTokens + (purpose === 'verifier' ? 6144 : purpose === 'analyst' ? 3072 : 0),
          // Native constraints avoid malformed line IDs; runtime validation and
          // the evidence check still decide whether an answer can be published.
          response_format: format ?? { type: 'json_object' },
          messages: [{ role: 'system', content: `${system}\nReturn exactly one JSON object. No Markdown fences, commentary, or thinking text.` },
            { role: 'user', content: user }],
        }),
        // Verification can take longer than drafting. Share the existing
        // total budget instead of aborting a valid second call at 45 seconds.
        signal: AbortSignal.timeout(remainingMs),
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
      // A 429 can come from the serving provider even after the account's
      // daily allowance resets. Do not claim the user's daily quota is spent.
      throw new Error(response.status === 429
        ? 'The free AI service is currently rate-limited. Please try again later.'
        : failureMessage);
    }
    const result = await response.json().catch(() => null);
    if (!result || !Array.isArray(result.choices) || !result.choices.length) throw new Error(failureMessage);
    const choice = result?.choices?.[0];
    if (result?.error || choice?.error) throw new Error(failureMessage);
    if (choice?.message?.tool_calls?.length || choice?.message?.annotations?.length) throw new Error(failureMessage);
    if (choice?.finish_reason === 'content_filter') {
      throw new Error('The AI provider blocked this request, so I could not verify an answer. You have not been charged.');
    }
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
