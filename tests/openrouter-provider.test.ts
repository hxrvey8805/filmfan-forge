import { describe, expect, it, vi } from 'vitest';
import { openRouterGenerator } from '../supabase/functions/_shared/openrouter';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import type { Conversation, Evidence, ViewingPosition } from '../supabase/functions/_shared/companion';

const completion = (content: unknown, finish_reason = 'stop') => new Response(JSON.stringify({
  choices: [{ finish_reason, message: { content,
    reasoning: 'UNVERIFIED_REASONING', reasoning_details: [{ text: 'FUTURE_REASONING' }] } }],
}));

describe('OpenRouter companion transport', () => {
  it('pins the free endpoint, disables paid routing and web plugins, and reads final JSON only', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion('{"supported":true}'));
    expect(await openRouterGenerator('test-key', request)('Check evidence', 'Permitted dialogue', 900)).toEqual({ supported: true });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({ model: 'dots-studio/dots-3-note-preview:free', stream: false,
      provider: { only: ['atlas-cloud/fp8'], allow_fallbacks: false, require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 } },
      tools: [], tool_choice: 'none', reasoning: { enabled: false, exclude: true } });
    expect(body.plugins).toContainEqual({ id: 'web', enabled: false });
    expect(body.plugins).toContainEqual({ id: 'response-healing', enabled: false });
    expect(body.plugins.every((plugin: { enabled: boolean }) => plugin.enabled === false)).toBe(true);
    expect(body).not.toHaveProperty('models');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(900);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Permitted dialogue' });
  });

  it.each([401, 402, 403, 429, 503])('does not retry status %i or reveal provider bodies', async status => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('PRIVATE_BODY_test-key', {
        status, headers: { 'retry-after': '1' },
      }));
      await expect(openRouterGenerator('test-key', request)('System', 'PRIVATE_QUESTION', 900))
        .rejects.toThrow(status === 429 ? 'free AI service is currently rate-limited' : 'Unable to generate');
      expect(request).toHaveBeenCalledOnce();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE|test-key/);
    } finally { log.mockRestore(); }
  });

  it.each(['length', 'tool_calls', 'error'])('rejects %s even when the content is valid JSON', async reason => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion('{"supported":true}', reason));
    await expect(openRouterGenerator('test-key', request)('System', 'Question', 900)).rejects.toThrow('incomplete');
  });
  it('distinguishes provider filtering from truncation and never publishes or retries the blocked answer', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion('{"supported":true}', 'content_filter'));
    await expect(openRouterGenerator('test-key', request)('System', 'Question', 900)).rejects.toThrow('AI provider blocked');
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([null, '', 'not JSON', '<think>future detail</think>{"supported":true}',
    '{"supported":true} unchecked prose', '```json\n{"supported":true}\n```', '[]', 'true'])(
    'does not salvage incomplete or non-JSON output (%j)', async content => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion(content));
    expect(await openRouterGenerator('test-key', request)('System', 'Question', 900)).toBeNull();
  });

  it('sanitizes network failures and rejects error envelopes delivered with HTTP 200', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE_HEADERS_test-key'));
    await expect(openRouterGenerator('test-key', request)('System', 'Question', 900)).rejects.toThrow('Unable to generate');
    const failed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '{"supported":true}' }, error: { message: 'PRIVATE_BODY' } }],
    })));
    await expect(openRouterGenerator('test-key', failed)('System', 'Question', 900)).rejects.toThrow('Unable to generate');
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response('not a completion'));
    await expect(openRouterGenerator('test-key', malformed)('System', 'Question', 900)).rejects.toThrow('Unable to generate');
  });

  it('rejects an empty key before any request', () => {
    const request = vi.fn<typeof fetch>();
    expect(() => openRouterGenerator('  ', request)).toThrow('OPENROUTER_API_KEY');
    expect(request).not.toHaveBeenCalled();
  });

  it('shares a total deadline across writer, verification and repair requests', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      const request = vi.fn<typeof fetch>().mockImplementation(async () => completion('{"supported":true}'));
      const generate = openRouterGenerator('test-key', request);
      await generate('System', 'First draft', 900);
      vi.setSystemTime(new Date('2026-10-15T10:01:31Z'));
      await expect(generate('Check', 'Must not publish without verification', 900)).rejects.toThrow('Unable to generate');
      expect(request).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it.each([
    { tool_calls: [{ function: { name: 'web_search', arguments: '{}' } }] },
    { annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.org/future' } }] },
  ])('rejects tool or external-source output even with valid final JSON', async extra => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '{"supported":true}', ...extra } }],
    })));
    await expect(openRouterGenerator('test-key', request)('System', 'Question', 900))
      .rejects.toThrow('Unable to generate');
  });

  it.each([2, 3])('preserves the rewind and episode boundary in both actual request bodies for episode %i', async episode => {
    const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: episode, seconds: 30 };
    const safe: Evidence = { id: 'letter', season: 1, episode, start: 10, end: 12, text: '(SAM) Keep this letter sealed.' };
    const memory: Conversation = { id: 'safe', title_id: 1, media_type: 'tv', season_number: 1, episode_number: episode,
      position_seconds: 20, companion_version: 3, answer_status: 'answered', question: 'What letter?',
      answer: 'SAFE_MEMORY', context: '', timestamp: '00:00:20', created_at: '2026-10-14T12:00:00Z' };
    const claim = { text: 'Sam asks for the letter to stay sealed.', evidenceIds: ['P1'] };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(completion(JSON.stringify({ status: 'answered', claims: [claim] })))
      .mockResolvedValueOnce(completion(JSON.stringify({ withinBoundary: true, sufficient: true,
        checks: [{ index: 0, supported: true, issue: 'none', basis: 'entailed', reason: 'Sam explicitly asks this.', sources: ['P1:1'] }] })));
    const result = await checkedAnswer('Why?', position, [safe,
      { ...safe, id: 'future', end: 31, text: 'FUTURE_CUE' },
      { ...safe, id: 'other-episode', episode: episode + 1, text: 'OTHER_EPISODE_CUE' }], [memory,
      { ...memory, id: 'future', position_seconds: 60, answer: 'FUTURE_MEMORY' },
      { ...memory, id: 'other', episode_number: episode === 2 ? 3 : 2, answer: 'OTHER_EPISODE_MEMORY' },
      { ...memory, id: 'title', title_id: 2, answer: 'OTHER_TITLE_MEMORY' },
      { ...memory, id: 'failed', answer_status: 'insufficient_evidence', answer: 'FAILED_MEMORY' }],
    openRouterGenerator('test-key', request));
    expect(result?.answer).toBe(claim.text);
    expect(result?.evidence[0].id).toBe('letter');
    const bodies = request.mock.calls.map(([, options]) => JSON.parse(options!.body as string));
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[0])).toContain('SAFE_MEMORY');
    expect(JSON.stringify(bodies)).not.toMatch(/FUTURE_|OTHER_EPISODE_|OTHER_TITLE_|FAILED_MEMORY|UNVERIFIED_REASONING/);
    expect(JSON.stringify(bodies[1])).not.toContain('SAFE_MEMORY');
    const writerSchema = bodies[0].response_format.json_schema;
    const checkerSchema = bodies[1].response_format.json_schema;
    expect(bodies[0].response_format.type).toBe('json_schema');
    expect(writerSchema.strict).toBe(true);
    expect(writerSchema.schema.properties.claims.items.properties.evidenceIds.items.enum).toEqual(['P1']);
    expect(writerSchema.schema.properties.claims.items.properties.text).not.toHaveProperty('maxLength');
    expect(checkerSchema.schema.properties.checks.items.properties.sources.items.enum).toEqual(['P1:1']);
    expect(checkerSchema.schema.properties.checks.minItems).toBe(1);
    expect(checkerSchema.schema.properties.checks.maxItems).toBe(1);
    expect(bodies[0].reasoning).toEqual({ enabled: false, exclude: true });
    expect(bodies[1].reasoning).toEqual({ enabled: true, exclude: true });
    expect(bodies[1].max_tokens).toBe(1800 + 6144);
  });

  it('withholds the writer draft if the verifier hits the free quota', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const request = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(completion('{"status":"answered","claims":[{"text":"The letter is sealed.","evidenceIds":["P1"]}]}'))
        .mockResolvedValueOnce(new Response('', { status: 429 }));
      await expect(checkedAnswer('What happened?', { tmdbId: 1, mediaType: 'movie', seconds: 30 },
        [{ id: 'letter', season: null, episode: null, start: 10, end: 12, text: 'The letter is sealed.' }], [],
        openRouterGenerator('test-key', request))).rejects.toThrow('free AI service is currently rate-limited');
      expect(request).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); }
  });
});
