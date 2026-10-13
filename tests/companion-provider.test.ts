import { describe, expect, it, vi } from 'vitest';
import { groqGenerator } from '../supabase/functions/_shared/groq';

const completion = (content: string, finish_reason = 'stop') => new Response(JSON.stringify({
  choices: [{ finish_reason, message: { content, reasoning: 'Unverified internal text must stay out of answers.' } }],
}));

describe('companion model transport', () => {
  it('uses the supported model with separate room for reasoning and parses only final JSON', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion('{"supported":true}'));
    expect(await groqGenerator('test-key', request)('Check evidence', 'Question and evidence', 500)).toEqual({ supported: true });
    const body = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', include_reasoning: false,
      response_format: { type: 'json_object' }, max_completion_tokens: 4596 });
    expect(body.messages).toEqual([{ role: 'system', content: 'Check evidence' }, { role: 'user', content: 'Question and evidence' }]);
  });

  it('rejects incomplete output even if its JSON parses', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion('{"supported":true}', 'length'));
    await expect(groqGenerator('test-key', request)('System', 'Question', 500)).rejects.toThrow('incomplete');
  });

  it('does not substitute reasoning when final content is invalid', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion('not JSON'));
    expect(await groqGenerator('test-key', request)('System', 'Question', 500)).toBeNull();
  });

  it('reports provider failure without exposing private provider response bodies', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('private echoed question', { status: 400 }));
      await expect(groqGenerator('test-key', request)('System', 'Question', 500)).rejects.toThrow('Unable to generate');
      expect(JSON.stringify(log.mock.calls)).not.toContain('private echoed question');
      expect(log).toHaveBeenCalledWith('Companion model request failed', { status: 400, model: 'openai/gpt-oss-120b' });
    } finally { log.mockRestore(); }
  });
});
