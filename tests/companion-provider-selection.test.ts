import { describe, expect, it, vi } from 'vitest';
import { companionEvidenceBudget, companionGenerator } from '../supabase/functions/_shared/companion-provider';

const env = (values: Record<string, string>) => (name: string) => values[name];
const completion = () => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
}));

describe('server companion provider selection', () => {
  it('uses an explicit route-specific evidence budget without enlarging legacy Groq requests', () => {
    expect(companionEvidenceBudget(env({}))).toBe(8500);
    expect(companionEvidenceBudget(env({ COMPANION_AI_PROVIDER: 'groq' }))).toBe(8500);
    expect(companionEvidenceBudget(env({ COMPANION_AI_PROVIDER: 'openrouter' }))).toBe(16000);
    expect(companionEvidenceBudget(env({ OPENROUTER_API_KEY: 'staged-only' }))).toBe(8500);
  });
  it('uses the OpenRouter secret only when explicitly selected', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion());
    const generate = companionGenerator(env({ COMPANION_AI_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: ' router-key ', GROQ_API_KEY: 'legacy-key' }), request);
    expect(await generate('System', 'Evidence', 900)).toEqual({ ok: true });
    expect(request.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer router-key' });
    expect(JSON.stringify(request.mock.calls)).not.toContain('legacy-key');
  });

  it('keeps the existing deployment unchanged until explicitly activated', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(completion());
    const generate = companionGenerator(env({ OPENROUTER_API_KEY: 'staged-key', GROQ_API_KEY: 'legacy-key' }), request);
    await generate('System', 'Evidence', 900);
    expect(request.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.stringify(request.mock.calls)).not.toContain('staged-key');
  });

  it.each([
    { COMPANION_AI_PROVIDER: 'openrouter', GROQ_API_KEY: 'legacy-key' },
    { COMPANION_AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: ' ' },
    { COMPANION_AI_PROVIDER: 'unknown', OPENROUTER_API_KEY: 'router-key' },
    { COMPANION_AI_PROVIDER: 'groq', OPENROUTER_API_KEY: 'router-key' },
  ])('fails closed for missing or invalid configuration (%j)', values => {
    const request = vi.fn<typeof fetch>();
    expect(() => companionGenerator(env(values), request)).toThrow('temporarily unavailable');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not fall back to Groq if the selected free service is unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }));
      const generate = companionGenerator(env({ COMPANION_AI_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'router-key', GROQ_API_KEY: 'legacy-key' }), request);
      await expect(generate('System', 'Evidence', 900)).rejects.toThrow('free AI service is currently rate-limited');
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    } finally { log.mockRestore(); }
  });
});
