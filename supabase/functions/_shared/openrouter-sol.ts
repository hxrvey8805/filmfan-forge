import { openRouterGenerator } from './openrouter.ts';
import { ProviderUnavailable } from './provider-unavailable.ts';
import { SOL_ENDPOINT, SOL_MODEL, SOL_RESOLVED_MODEL, solBody, solReservationMicroUsd, type SolBudget } from './sol-budget.ts';

const unavailable = () => new ProviderUnavailable('The companion is temporarily unavailable. Please try again later.', false);

export function solBudgetedFetch(budget: SolBudget, network: typeof fetch = fetch): typeof fetch {
  // A failed settlement must stop this answer's subsequent calls even if the
  // database is unavailable. The outstanding reservation remains committed.
  let stopped = false;
  return async (url, options) => {
    if (stopped || String(url) !== SOL_ENDPOINT || !options || !('method' in options) || options.method !== 'POST' ||
      !('body' in options) || typeof options.body !== 'string') throw unavailable();
    const body = solBody(JSON.parse(options.body));
    const reservation = solReservationMicroUsd(body);
    const callId = crypto.randomUUID();
    try { if (!await budget.reserve(callId, reservation)) throw unavailable(); }
    catch { stopped = true; throw unavailable(); }
    let response: Response;
    try { response = await network(url, { ...options, body: JSON.stringify(body) }); }
    catch {
      stopped = true;
      // The provider may have completed a timed-out request. Never refund an
      // unknown cost or retry it automatically.
      await budget.settle(callId, null, null, 'transport_error').catch(() => {});
      throw unavailable();
    }
    const result = await response.clone().json().catch(() => null);
    const reportedCost = result?.usage?.cost;
    const actual = typeof reportedCost === 'number' && Number.isFinite(reportedCost) && reportedCost >= 0 && reportedCost <= 1000
      ? Math.ceil(reportedCost * 1e6) : null;
    const generationId = typeof result?.id === 'string' ? result.id.slice(0, 200) : null;
    const routeMatches = [SOL_MODEL, SOL_RESOLVED_MODEL].includes(result?.model) && result?.provider === 'OpenAI';
    const haltReason = actual === null ? 'unknown_cost'
      : actual > reservation ? 'cost_exceeded_reservation'
      : [401, 402, 403, 429].includes(response.status) ? `provider_status_${response.status}`
      : response.ok && !routeMatches ? 'unexpected_model_or_provider' : null;
    try { await budget.settle(callId, actual, generationId, haltReason); }
    catch { stopped = true; throw unavailable(); }
    if (haltReason) { stopped = true; throw unavailable(); }
    return response;
  };
}

// Reuse the evaluated format, prompt, parsing and review pipeline unchanged.
export function solGenerator(key: string, budget: SolBudget, request: typeof fetch = fetch) {
  return openRouterGenerator(key, solBudgetedFetch(budget, request), 'sol');
}
