import { describe, expect, it, vi } from 'vitest';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import type { Conversation, Evidence, ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 30 };
const evidence: Evidence[] = [{ id: 'letter', season: 1, episode: 2, start: 10, end: 12, text: '[00:00:10] (SAM) Keep this letter sealed.' }];
const draft = { status: 'answered', claims: [{ text: 'Sam has asked for the letter to stay sealed.', evidenceIds: ['letter'] }] };
const pass = { supported: true, withinBoundary: true, unsupportedClaimIndexes: [] };
const history = (overrides = {}): Conversation => ({ id: 'a', title_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  position_seconds: 20, companion_version: 2, question: 'What letter?', answer: 'SAFE_ANSWER', context: '',
  timestamp: '00:00:20', created_at: '2026-10-13T12:00:00Z', ...overrides });

describe('answer generation and independent verification', () => {
  it('passes only permitted conversation to the writer and no conversation to the verifier', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    const result = await checkedAnswer('Why?', position, evidence, [history(),
      history({ position_seconds: 50, answer: 'FUTURE_ANSWER' }),
      history({ episode_number: 3, answer: 'NEXT_EPISODE' }),
      history({ episode_number: 1, answer: 'OTHER_EPISODE_THREAD' }),
      history({ companion_version: 1, answer: 'UNVERIFIED_LEGACY' })], generate);
    expect(result?.answer).toBe(draft.claims[0].text);
    expect(result?.evidence[0].label).toBe('S1E2 00:00:10–00:00:12');
    const writer = JSON.parse(generate.mock.calls[0][1]);
    const verifier = JSON.parse(generate.mock.calls[1][1]);
    expect(writer.conversation).toEqual([{ question: 'What letter?', answer: 'SAFE_ANSWER', seconds: 20 }]);
    expect(verifier).not.toHaveProperty('conversation');
    expect(verifier.claims).toEqual(draft.claims);
    expect(verifier.evidence).toEqual(evidence);
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_ANSWER|NEXT_EPISODE|OTHER_EPISODE_THREAD|UNVERIFIED_LEGACY/);
  });
  it.each([null, {}, { ...pass, withinBoundary: false }, { ...pass, unsupportedClaimIndexes: [0] }])(
    'withholds the entire answer if verification fails (%j)', async verdict => {
      const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(verdict);
      expect(await checkedAnswer('Why?', position, evidence, [], generate)).toBeNull();
    });
  it('never sends a draft with invented citations to the verifier or viewer', async () => {
    const generate = vi.fn().mockResolvedValue({ ...draft, claims: [{ text: 'A future plot twist.', evidenceIds: ['future'] }] });
    expect(await checkedAnswer('Why?', position, evidence, [], generate)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('does not call the model without evidence, including at 00:00:00', async () => {
    const generate = vi.fn();
    expect(await checkedAnswer('Tell me the ending', { ...position, seconds: 0 }, [], [], generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it('propagates provider failures instead of publishing an unchecked draft', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(checkedAnswer('Why?', position, evidence, [], generate)).rejects.toThrow('Provider unavailable');
  });
});
