// Prices are USD per million tokens. This route has no model/provider fallback.
export const SOL_MODEL = 'openai/gpt-6.1-sol';
export const SOL_RESOLVED_MODEL = 'openai/gpt-6.1-sol-20260929';
export const SOL_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface SolBudget {
  reserve(callId: string, microUsd: number): Promise<boolean>;
  settle(callId: string, microUsd: number | null, generationId: string | null, haltReason: string | null): Promise<void>;
}

type WireBody = Record<string, unknown>;
export function solBody(raw: WireBody): WireBody {
  const messages = raw.messages as { content?: unknown; cache_control?: unknown }[];
  if (!Array.isArray(messages) || messages.some(m => typeof m.content !== 'string' || m.cache_control)) {
    throw new Error('Sol requires plain text messages without cache directives');
  }
  const plugins = raw.plugins as { id: string; enabled: boolean }[];
  if (!Array.isArray(plugins) || plugins.some(p => p.enabled !== false) ||
    ['web', 'response-healing', 'context-compression', 'file-parser', 'pareto-router', 'fusion']
      .some(id => !plugins.some(p => p.id === id && p.enabled === false))) {
    throw new Error('Sol requires disabled plugins');
  }
  const schema=(raw.response_format as {json_schema?:{name?:string}}|undefined)?.json_schema?.name;
  const selection=['companion_search_terms','companion_relevant_sources','companion_budgeted_sources'].includes(schema??'');
  const body: WireBody = { ...raw, model: SOL_MODEL, stream: false,
    provider: { only: ['openai'], allow_fallbacks: false, require_parameters: true,
      max_price: { prompt: 2, completion: 10, request: 0 } },
    // Sorting already-safe source IDs is bounded clerical work. Keep the
    // writer and independent factual/spoiler reviewer on full medium effort.
    reasoning: { effort: selection?'low':'medium', exclude: true },
    max_tokens: Math.min(8192, Math.max(4096, Number(raw.max_tokens) || 4096)),
    tools: [], tool_choice: 'none',
  };
  // Selection prompts put the question/cutoff before a changing source batch;
  // their short shared prefix does not qualify for caching. Avoid paying the
  // 25% write premium on these usually one-off batches. Explicit mode with no
  // content breakpoints changes billing only: messages, model, reasoning and
  // output limits remain identical. Keep writer/reviewer caching unchanged.
  // https://openrouter.ai/docs/guides/best-practices/prompt-caching#disabling-prompt-caching
  if (selection) body.prompt_cache_options = { mode: 'explicit' };
  delete body.temperature; delete body.models; delete body.route; delete body.transforms;
  return body;
}

export function solReservationMicroUsd(body: WireBody): number {
  // Same conservative bound as the paid evaluation: one UTF-8 byte per input
  // token, protocol margin, 25% input-price margin and 5% total cushion.
  // max_tokens includes billed reasoning. Round UP, never round away spending.
  const inputBound = new TextEncoder().encode(JSON.stringify(body)).length + 2048;
  if (inputBound > 200000) throw new Error('Sol input exceeds the short-context budget');
  return Math.ceil((inputBound * .0000025 + Number(body.max_tokens) * .00001 + .001) * 1.05 * 1e6);
}

// This narrow RPC interface also allows the actual database functions to be
// exercised in tests. The server supplies the authenticated user and request ID.
export type BudgetRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: unknown;
}>;
export function databaseSolBudget(rpc: BudgetRpc, userId: string, requestId: string): SolBudget {
  return {
    async reserve(callId, microUsd) {
      const result = await rpc('reserve_companion_sol_call', {
        p_call_id: callId, p_user_id: userId, p_request_id: requestId, p_micro_usd: microUsd,
      });
      if (result.error) throw new Error('Cannot reserve companion budget');
      return result.data === true;
    },
    async settle(callId, microUsd, generationId, haltReason) {
      const result = await rpc('settle_companion_sol_call', {
        p_call_id: callId, p_micro_usd: microUsd, p_generation_id: generationId, p_halt_reason: haltReason,
      });
      if (result.error || result.data !== true) throw new Error('Cannot settle companion budget');
    },
  };
}
