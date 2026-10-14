import { describe, expect, it, vi } from 'vitest';
import { assertSubtitlePreparation, loadSubtitleFile } from '../supabase/functions/_shared/subtitle-provider';

const position = { tmdbId: 37799, mediaType: 'movie' as const };
const result = { attributes: { language: 'en', files: [{ file_id: 42 }],
  feature_details: { feature_type: 'Movie', tmdb_id: 37799 } } };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mock = () => vi.fn<typeof fetch>().mockResolvedValueOnce(response({ data: [result] }));

describe('subtitle import reliability', () => {
  it('fetches one matching file, identifies the app, and keeps credentials off the file request', async () => {
    const fetcher = mock().mockResolvedValueOnce(response({ link: 'https://files.example/test' }))
      .mockResolvedValueOnce(new Response('1\n00:00:01,000 --> 00:00:02,000\n(SAM) Hello.'));
    await expect(loadSubtitleFile(position, 'secret', fetcher)).resolves.toEqual({ fileId: 42,
      cues: [{ start: 1, end: 2, text: '(SAM) Hello.' }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'User-Agent': 'CineGeek v1.0' });
    expect(fetcher.mock.calls[2][1]?.headers).toBeUndefined();
    const params = new URL(String(fetcher.mock.calls[0][0])).searchParams;
    expect([...params.keys()]).toEqual([...params.keys()].sort());
  });
  it('does not download a wrong movie or episode', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [{ attributes: {
      ...result.attributes, feature_details: { feature_type: 'Movie', tmdb_id: 99 },
    } }] }));
    await expect(loadSubtitleFile(position, 'secret', fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([[406, { remaining: 0 }, 'quota_exceeded'], [406, {}, 'provider_error'],
    [429, {}, 'rate_limited'], [500, { message: 'PRIVATE' }, 'provider_error']] as const)('classifies provider status %i without retrying downloads', async (status, body, reason) => {
    const fetcher = mock().mockResolvedValueOnce(response(body, status));
    await expect(loadSubtitleFile(position, 'secret', fetcher)).rejects.toMatchObject({ reason, stage: 'download', status });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('keeps network errors and malformed file contents private', async () => {
    const fetcher = mock().mockRejectedValueOnce(new Error('SECRET signed URL'));
    await expect(loadSubtitleFile(position, 'secret', fetcher)).rejects.toThrow('temporarily unavailable');
    const malformed = mock().mockResolvedValueOnce(response({ link: 'https://files.example/test' }))
      .mockResolvedValueOnce(new Response('1\n00:00:03,000 --> 00:00:01,000\nReversed cue'));
    await expect(loadSubtitleFile(position, 'secret', malformed)).rejects.toMatchObject({ reason: 'provider_error' });
  });
  it('does not turn failed imports into a saved insufficient-evidence answer', async () => {
    await expect(assertSubtitlePreparation(response({ reason: 'quota_exceeded' }, 503))).rejects.toThrow('daily download limit');
    await expect(assertSubtitlePreparation(response({ error: 'private' }, 500))).rejects.toThrow('temporarily unavailable');
    await expect(assertSubtitlePreparation(response({ success: true }))).resolves.toBeUndefined();
    await expect(assertSubtitlePreparation(response({ success: false, reason: 'unavailable' }))).resolves.toBeUndefined();
    await expect(assertSubtitlePreparation(response({}))).rejects.toThrow('temporarily unavailable');
  });
});
