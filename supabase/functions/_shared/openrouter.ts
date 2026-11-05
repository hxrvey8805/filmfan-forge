import { captionCards } from './caption-cards.ts';
import { ProviderUnavailable } from './provider-unavailable.ts';
import { storyWire, exchangeWire, unpackExchangeDraft } from './story-wire.ts';
import type { JsonGenerator } from './answer.ts';

// Pin a free endpoint; never route to paid models or unreviewed providers.
export const OPENROUTER_MODEL = 'dots-studio/dots-3-note-preview:free';
// On general caption questions the independent verifier stays on the original route.
export const CAPTION_WRITER_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
const failureMessage = 'Unable to generate a checked answer. Please try again.';

export function openRouterGenerator(key: string, request: typeof fetch = fetch, route: 'free' | 'sol' = 'free'): JsonGenerator {
  if (!key.trim()) throw new Error('Configure OPENROUTER_API_KEY privately before using OpenRouter.');
  // One generator serves a complete answer, including verification/repair.
  // Keep all model calls within one budget, leaving time for subtitle import.
  const deadline = Date.now() + 90000;
  const generate: JsonGenerator = async (system, user, maxTokens, purpose, format) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new ProviderUnavailable(failureMessage);
    // The pinned provider's native story schemas have returned invalid fields
    // and repeated suffixes until truncation. Use ordinary JSON for story
    // responses and describe the response object explicitly. The source/state
    // validators and independent review remain the publication gate.
    const storyFormat = format?.type === 'json_schema' &&
      ['companion_story_draft', 'companion_story_review', 'companion_story_reading'].includes(format.json_schema.name);
    // Do not paste JSON Schema into the prompt: captured responses copied its
    // "type"/"properties" wrapper instead of returning the requested instance.
    const shape = format?.json_schema.name === 'companion_story_draft'
      ? { facts: [{ state: 'question', clause: '<short clause grounded in the chosen exchange>', window: 'EXACT_EXCHANGE_ID' }],
        readings: [{ text: 'One tentative interpretation.', basedOn: [0] }] }
      : format?.json_schema.name === 'companion_story_reading'
      ? { readings: [{ text: 'One tentative interpretation.', basedOn: [0] }] }
      : { boundarySafe: true, boundaryReason: '', relevant: true,
        facts: [{ index: 0, verdict: 'supported', state: 'statement', sources: ['EXACT_LINE_ID'], issue: 'none' }],
        readings: [{ index: 0, verdict: 'grounded', issue: 'none' }] };
    const spanDraft = format?.json_schema.name === 'companion_story_draft';
    const schemaInstruction = spanDraft ? '\nReturn an object shaped like '+JSON.stringify(shape)+'. Write only the clause after the selected stem: statement = The discussion concerns; proposal = A speaker proposes; question = A speaker asks; denial = A speaker denies; uncertain = A speaker suggests it might be. Choose the single exchange ID that supports each fact, including its qualifications. Pick different passages for a recap. Never copy IDs into answer text; never line ranges. Do not write a full scene, invent an actor, or use he/she/his/her for an anonymous speaker. For a recap choose three to five exchanges from different passages, in time order. For a discussion explain the central issue in the latest exchange and why it matters. Keep each point to one idea.' : storyFormat ? `\nReturn the answer object itself in this shape: ${JSON.stringify(shape)}\nReplace the example values. Do not return a schema or type/properties wrapper. Sources must be individual exact line IDs copied from the input, never line ranges. Use [] for no readings. Follow the fact counts and state/verdict rules above.` : '';
    const detailDraft = format?.json_schema.name === 'companion_detail_explanation';
    const detailReview = format?.json_schema.name === 'companion_detail_review';
    const captionDraft = format?.json_schema.name === 'companion_caption_card';
    const nvidiaDraft = captionDraft || ['companion_dialogue_selection', 'comic_exchange_selection', 'companion_detail_explanation'].includes(format?.json_schema.name ?? '');
    const model = nvidiaDraft ? CAPTION_WRITER_MODEL : OPENROUTER_MODEL;
    const endpoint = nvidiaDraft ? 'nvidia' : 'atlas-cloud/fp8';
    let response: Response;
    try {
      const options: RequestInit = {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          stream: false,
          // Never fall back to a paid endpoint or a different model. Disable
          // plugins explicitly: an empty array inherits account defaults.
          // The serving workspace must not enforce locked-on plugins.
          provider: { only: [endpoint], allow_fallbacks: false, require_parameters: true,
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
          reasoning: { enabled: detailDraft || purpose === 'verifier' || purpose === 'analyst' && !spanDraft, exclude: true },
          max_tokens: maxTokens + (purpose === 'verifier' ? 6144 : detailDraft || purpose === 'analyst' && !spanDraft ? 3072 : 0),
          response_format: storyFormat || nvidiaDraft || detailReview ? { type: 'json_object' } : format ?? { type: 'json_object' },
          messages: [{ role: 'system', content: `${system}\nReturn exactly one JSON object. No Markdown fences, commentary, or thinking text.${schemaInstruction}` },
            { role: 'user', content: spanDraft ? exchangeWire(user) : storyFormat ? storyWire(user) : user }],
        }),
        // Verification can take longer than drafting. Share the existing
        // total budget instead of aborting a valid second call at 45 seconds.
        signal: AbortSignal.timeout(remainingMs),
      };
      response = await request('https://openrouter.ai/api/v1/chat/completions', options);
      // One retry for a transient gateway failure, inside the same deadline
      // and on the same route (a paid attempt must reserve again). Never retry quota/auth/filter or
      // malformed-completion failures, and never publish an unchecked draft.
      if ([502, 503, 504].includes(response.status) && deadline - Date.now() > 8000) {
        console.error('OpenRouter transient failure', { status: response.status, model: route === 'sol' ? 'openai/gpt-6.1-sol' : model });
        await response.body?.cancel();
        response = await request('https://openrouter.ai/api/v1/chat/completions', {
          ...options, signal: AbortSignal.timeout(deadline - Date.now()),
        });
      }
    } catch (error) {
      if (error instanceof ProviderUnavailable) throw error;
      // Transport errors can contain URLs or headers; never surface them.
      throw new ProviderUnavailable(failureMessage);
    }
    if (!response.ok) {
      // Failed requests also consume the free daily quota. Do not auto-retry
      // 429s, or log provider bodies that may echo questions or credentials.
      console.error('OpenRouter request failed', { status: response.status, model: route === 'sol' ? 'openai/gpt-6.1-sol' : model });
      await response.body?.cancel();
      // A 429 can come from the serving provider even after the account's
      // daily allowance resets. Do not claim the user's daily quota is spent.
      throw new ProviderUnavailable(response.status === 429
        ? `The ${route === 'free' ? 'free ' : ''}AI service is currently rate-limited. Please try again later.`
        : failureMessage);
    }
    const result = await response.json().catch(() => null);
    if (!result || !Array.isArray(result.choices) || !result.choices.length) throw new ProviderUnavailable(failureMessage);
    const choice = result?.choices?.[0];
    if (result?.error || choice?.error) throw new ProviderUnavailable(failureMessage);
    if (choice?.message?.tool_calls?.length || choice?.message?.annotations?.length) throw new ProviderUnavailable(failureMessage);
    if (choice?.finish_reason === 'content_filter') {
      throw new ProviderUnavailable('The AI provider blocked this request, so I could not verify an answer. You have not been charged.', false);
    }
    if (choice?.finish_reason !== 'stop') throw new ProviderUnavailable('The answer was incomplete. Please try again.');
    // Never recover a draft from reasoning, tool calls, or prose around JSON.
    const content = choice?.message?.content;
    if (typeof content !== 'string') return null;
    try {
      const value: unknown = JSON.parse(content);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return spanDraft ? unpackExchangeDraft(value, user) : value;
    } catch { return null; }
  };
  return (system, user, tokens, purpose, format) => format?.json_schema.name === 'companion_caption_paragraphs'
    ? captionCards(user, generate, system.includes('Fresh attempt:'))
    : generate(system, user, tokens, purpose, format);
}
