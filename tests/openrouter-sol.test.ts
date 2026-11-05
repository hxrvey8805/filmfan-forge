import { describe, expect, it, vi } from 'vitest';
import { solBudgetedFetch, solGenerator } from '../supabase/functions/_shared/openrouter-sol';
import { SOL_ENDPOINT, SOL_MODEL, SOL_RESOLVED_MODEL, solBody, solReservationMicroUsd, type SolBudget } from '../supabase/functions/_shared/sol-budget';
import { companionGenerator } from '../supabase/functions/_shared/companion-provider';

const raw = { messages: [{ role: 'user', content: 'Only this completed caption.' }], max_tokens: 5000,
  plugins: ['web', 'response-healing', 'context-compression', 'file-parser', 'pareto-router', 'fusion'].map(id => ({ id, enabled: false })) };
const options = { method: 'POST', body: JSON.stringify(raw) };
const store = () => ({ reserve: vi.fn<SolBudget['reserve']>().mockResolvedValue(true), settle: vi.fn<SolBudget['settle']>().mockResolvedValue() });
const receipt = (extra = {}, status = 200) => new Response(JSON.stringify({ id: 'gen-test', model: SOL_RESOLVED_MODEL,
  provider: 'OpenAI', usage: { cost: .0012341 }, choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }], ...extra }), { status });

describe('production Sol transport', () => {
  it('keeps sources and formats intact while pinning price, provider, tools and reasoning', () => {
    const response_format = { type: 'json_object' };
    const body = solBody({ ...raw, response_format, temperature: 0, route: 'fallback', models: ['other'], transforms: ['middle-out'] });
    expect(body.messages).toEqual(raw.messages);
    expect(body.response_format).toEqual(response_format);
    expect(body).toMatchObject({ model: SOL_MODEL, stream: false, tools: [], tool_choice: 'none',
      provider: { only: ['openai'], allow_fallbacks: false, require_parameters: true, max_price: { prompt: 2, completion: 10, request: 0 } },
      reasoning: { effort: 'medium', exclude: true }, max_tokens: 5000 });
    for (const key of ['temperature', 'route', 'models', 'transforms']) expect(body).not.toHaveProperty(key);
    expect(solBody({ ...raw, max_tokens: 1 }).max_tokens).toBe(4096);
    expect(solBody({ ...raw, max_tokens: 20000 }).max_tokens).toBe(8192);
    expect(solReservationMicroUsd(body)).toBeGreaterThan(50000);
    expect(() => solBody({ ...raw, plugins: [] })).toThrow();
    expect(() => solBody({ ...raw, messages: [{ content: [] }] })).toThrow();
    expect(() => solReservationMicroUsd(solBody({ ...raw, messages: [{ content: 'x'.repeat(200000) }] }))).toThrow();
  });
  it('reserves before contacting the provider and rounds reported cost upward', async () => {
    const budget = store();
    const network = vi.fn<typeof fetch>().mockImplementation(async () => {
      expect(budget.reserve).toHaveBeenCalledOnce();
      return receipt();
    });
    expect(await solGenerator('private-key', budget, network)('System', 'Evidence', 900)).toEqual({ ok: true });
    expect(budget.settle).toHaveBeenCalledWith(expect.any(String), 1235, 'gen-test', null);
    expect(JSON.parse(String(network.mock.calls[0][1]?.body)).model).toBe(SOL_MODEL);
  });
  it('will not enable Sol without both explicit configuration and a shared budget', async () => {
    const env = (name: string) => ({ COMPANION_AI_PROVIDER: 'openrouter-sol', OPENROUTER_API_KEY: 'key' })[name];
    const network = vi.fn<typeof fetch>().mockResolvedValue(receipt());
    expect(() => companionGenerator(env, network)).toThrow('temporarily unavailable');
    expect(network).not.toHaveBeenCalled();
    expect(await companionGenerator(env, network, store())('System', 'Evidence', 900)).toEqual({ ok: true });
  });
  it.each(['disabled', 'database error'])('does not call the provider on %s', async cause => {
    const budget = store(), network = vi.fn<typeof fetch>();
    if (cause === 'disabled') budget.reserve.mockResolvedValue(false);
    else budget.reserve.mockRejectedValue(new Error('DB unavailable'));
    await expect(solGenerator('key', budget, network)('System', 'Evidence', 900)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it.each([
    [{ usage: {} }, 200, 'unknown_cost'],
    [{ usage: { cost: .9 } }, 200, 'cost_exceeded_reservation'],
    [{ model: 'other' }, 200, 'unexpected_model_or_provider'],
    [{ provider: 'other' }, 200, 'unexpected_model_or_provider'],
    [{}, 429, 'provider_status_429'],
    [{}, 402, 'provider_status_402'],
  ] as const)('halts on invalid billing, route or quota (%j)', async (extra, status, reason) => {
    const budget = store(), network = vi.fn<typeof fetch>().mockResolvedValue(receipt(extra, status));
    const request = solBudgetedFetch(budget, network);
    await expect(request(SOL_ENDPOINT, options)).rejects.toThrow('temporarily unavailable');
    expect(budget.settle.mock.calls[0][3]).toBe(reason);
    await expect(request(SOL_ENDPOINT, options)).rejects.toThrow();
    expect(network).toHaveBeenCalledOnce();
  });
  it('retains the hold after an ambiguous timeout and never retries that request', async () => {
    const budget = store(), network = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout with secret'));
    const generate = solGenerator('key', budget, network);
    await expect(generate('System', 'Evidence', 900)).rejects.toMatchObject({ canShowSource: false });
    expect(budget.settle).toHaveBeenCalledWith(expect.any(String), null, null, 'transport_error');
    await expect(generate('System', 'Evidence', 900)).rejects.toThrow('temporarily unavailable');
    expect(network).toHaveBeenCalledOnce();
  });
  it('does not publish or make another call after a settlement outage', async () => {
    const budget = store(), network = vi.fn<typeof fetch>().mockResolvedValue(receipt());
    budget.settle.mockRejectedValue(new Error('database outage'));
    const generate = solGenerator('key', budget, network);
    await expect(generate('System', 'Evidence', 900)).rejects.toThrow();
    await expect(generate('System', 'Evidence', 900)).rejects.toThrow();
    expect(network).toHaveBeenCalledOnce();
  });
  it('reserves separately for a known-cost transient gateway retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const budget = store(), network = vi.fn<typeof fetch>().mockResolvedValueOnce(receipt({ usage: { cost: 0 } }, 503)).mockResolvedValueOnce(receipt());
      expect(await solGenerator('key', budget, network)('System', 'Evidence', 900)).toEqual({ ok: true });
      expect(budget.reserve).toHaveBeenCalledTimes(2);
      expect(new Set(budget.reserve.mock.calls.map(c => c[0])).size).toBe(2);
      expect(budget.settle).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); }
  });
});
