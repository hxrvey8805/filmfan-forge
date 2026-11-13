import { describe, expect, it, vi } from 'vitest';
import { solBody, solReservationMicroUsd } from '../supabase/functions/_shared/sol-budget';
import { solGenerator } from '../supabase/functions/_shared/openrouter-sol';

const plugins = ['web', 'response-healing', 'context-compression', 'file-parser', 'pareto-router', 'fusion']
  .map(id => ({ id, enabled: false }));
const selections = ['companion_search_terms', 'companion_relevant_sources', 'companion_budgeted_sources'];

describe('source-selection cache billing policy', () => {
  it.each(selections)('keeps all model inputs/settings intact for %s', name => {
    const messages = [{ role: 'system', content: 'Select only these already-scoped source IDs.' },
      { role: 'user', content: JSON.stringify({ question: 'Why did she leave?', target: { episode: 2, seconds: 60 },
        sources: [{ id: 'e2:1', end: 59.5, text: 'I have to catch my train.' }] }) }];
    const response_format = { type: 'json_schema', json_schema: { name, strict: true,
      schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', enum: ['e2:1'] } } } } } };
    const raw = { messages, response_format, plugins, max_tokens: 7000 };
    const before = JSON.stringify(raw);
    expect(solBody(raw)).toEqual({ ...raw, model: 'openai/gpt-6.1-sol', stream: false,
      provider: { only: ['openai'], allow_fallbacks: false, require_parameters: true,
        max_price: { prompt: 2, completion: 10, request: 0 } },
      reasoning: { effort: 'low', exclude: true }, tools: [], tool_choice: 'none',
      prompt_cache_options: { mode: 'explicit' } });
    expect(JSON.stringify(raw)).toBe(before);
    const { prompt_cache_options: _cache, ...baseline } = solBody(raw);
    expect(solReservationMicroUsd(solBody(raw))).toBeGreaterThanOrEqual(solReservationMicroUsd(baseline));
  });

  it.each(['companion_story_discussion', 'companion_story_discussion_check', 'unrecognised'])
    ('retains automatic caching and full reasoning for %s', name => {
      const body = solBody({ plugins, messages: [{ role: 'system', content: 'Independently check every claim.' }],
        response_format: { type: 'json_schema', json_schema: { name } } });
      expect(body).not.toHaveProperty('prompt_cache_options');
      expect(body.reasoning).toEqual({ effort: 'medium', exclude: true });
    });

  it('sends every changed question, rewind and episode switch independently, without reusing a response', async () => {
    const sent: Record<string, any>[] = [];
    const budget = { reserve: vi.fn().mockResolvedValue(true), settle: vi.fn().mockResolvedValue(undefined) };
    const network = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      sent.push(JSON.parse(String(options?.body)));
      return new Response(JSON.stringify({ id: `gen-${sent.length}`, model: 'openai/gpt-6.1-sol', provider: 'OpenAI',
        usage: { cost: 0.001 }, choices: [{ finish_reason: 'stop', message: { content: '{"ids":["allowed"]}' } }] }));
    });
    const generate = solGenerator('test-key', budget, network);
    const packets = [
      { question: 'What happened?', title: 1, episode: 2, seconds: 120, sources: ['allowed'] },
      { question: 'Why?', title: 1, episode: 2, seconds: 120, sources: ['allowed'] },
      { question: 'What happened?', title: 1, episode: 2, seconds: 60, sources: ['earlier-only'] },
      { question: 'What happened?', title: 1, episode: 1, seconds: 60, sources: ['other-episode-only'] },
      { question: 'What happened?', title: 2, episode: 1, seconds: 60, sources: ['other-title-only'] },
    ];
    for (const packet of packets) await generate('Select eligible IDs.', JSON.stringify(packet), 600, 'analyst',
      { type: 'json_schema', json_schema: { name: 'companion_relevant_sources', strict: true, schema: { type: 'object' } } });
    expect(sent.map(body => JSON.parse(body.messages[1].content))).toEqual(packets);
    expect(sent.every(body => body.prompt_cache_options.mode === 'explicit')).toBe(true);
    expect(network).toHaveBeenCalledTimes(packets.length);
    expect(budget.reserve).toHaveBeenCalledTimes(packets.length);
    expect(budget.settle).toHaveBeenCalledTimes(packets.length);
  });
});
