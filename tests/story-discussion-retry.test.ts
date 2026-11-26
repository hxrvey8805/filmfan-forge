import { describe, expect, it, vi } from 'vitest';
import { storyDiscussion, type StoryDiscussionContext } from '../supabase/functions/_shared/story-discussion';
import type { WatchDiagnostic } from '../supabase/functions/_shared/watch-diagnostics';
import { resumeWatchGenerator, type WatchCheckpoints } from '../supabase/functions/_shared/watch-checkpoints';
import { CompanionWorkDeferred } from '../supabase/functions/_shared/companion-work';

// Invented two-episode scene matching the live failure sequence, not its private captions.
const context: StoryDiscussionContext = {
  question: 'Explain this scene and why they are blaming each other.',
  boundary: { season: 1, episode: 2, seconds: 1200 },
  request: { intent: 'scene', target: { season: 1, episode: 2, start: 1080, end: 1200 } },
  sources: [
    { id: 'R1', season: 1, episode: 1, end: 90, historicalDialogue: true,
      text: 'MIRA: I will check the engine.\nTHEO: I will bring the fuel.' },
    { id: 'R2', season: 1, episode: 2, end: 1190,
      text: 'MIRA: You forgot the fuel.\nTHEO: You never checked the engine.' },
  ],
};
const support = [{ id: 'R1', firstLine: 1, lastLine: 2 }, { id: 'R2', firstLine: 1, lastLine: 2 }];
const draft = (text = 'Mira and Theo blame each other for not doing the jobs they agreed to do earlier.') => ({ points: [{ text, support }] });
const review = (changes = {}) => ({ boundarySafe: true, fit: 'direct', checks: [
  { index: 0, supported: true, issue: 'none', attribution: 'contextual', support, ...changes },
] });
const malformed = () => review({ support: [] });

describe('bounded receipt retry and answer repair', () => {
  it.each(['local identity', 'reviewer identity'])('keeps an answer repair after a receipt retry reveals %s', async failure => {
    const unsupported = draft('Both Theo and UnknownPerson blame each other for the missing fuel.');
    const identity = failure === 'local identity' ? review() : review({ supported: false, issue: 'identity', support: [] });
    const gen = vi.fn().mockResolvedValueOnce(unsupported).mockResolvedValueOnce(malformed())
      .mockResolvedValueOnce(identity).mockResolvedValueOnce(draft()).mockResolvedValueOnce(review());
    const events: WatchDiagnostic[] = [];
    const result = await storyDiscussion(context, gen, event => events.push(event));
    expect(result?.answer).toBe(draft().points[0].text);
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'verifier', 'writer', 'verifier']);
    expect(events).toContainEqual({ stage: 'review_invalid', attempt: 1, reason: 'receipt_count' });
    expect(events).toContainEqual({ stage: 'review_rejected', attempt: 2, issues: ['identity'] });
    const repair = gen.mock.calls[3];
    expect(repair[0]).toContain('Identify people only through the permitted context');
    expect(repair[1]).not.toContain('UnknownPerson');
    expect(JSON.parse(repair[1]).sources).toEqual(JSON.parse(gen.mock.calls[0][1]).sources);
    expect(JSON.parse(gen.mock.calls[4][1]).points).toEqual(draft().points.map(({ text }) => ({ text })));
    expect(result?.sourceIds).toEqual(['R1', 'R2']);
  });

  it('never sends a spoiler verdict or rejected prose into the new writer', async () => {
    const unsafeReview = { ...review(), boundarySafe: false, explanation: 'FUTURE_SECRET' };
    const gen = vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(malformed())
      .mockResolvedValueOnce(unsafeReview).mockResolvedValueOnce(draft()).mockResolvedValueOnce(review());
    expect((await storyDiscussion(context, gen))?.answer).toBe(draft().points[0].text);
    expect(gen.mock.calls[3][0]).toContain('remove predictions');
    expect(JSON.stringify(gen.mock.calls.slice(3))).not.toContain('FUTURE_SECRET');
    expect(JSON.parse(gen.mock.calls[3][1])).not.toHaveProperty('points');
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'verifier', 'writer', 'verifier']);
  });

  it('requires full independent approval after repair and stops at two drafts', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft('Both Theo and UnknownPerson blame each other.'))
      .mockResolvedValueOnce(malformed()).mockResolvedValueOnce(review())
      .mockResolvedValueOnce(draft()).mockResolvedValueOnce({ ...review(), boundarySafe: false });
    expect(await storyDiscussion(context, gen)).toBeNull();
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'verifier', 'writer', 'verifier']);
  });

  it('allows one receipt retry on the second draft too', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft('Both Theo and UnknownPerson blame each other.')).mockResolvedValueOnce(review())
      .mockResolvedValueOnce(draft()).mockResolvedValueOnce(malformed()).mockResolvedValueOnce(review());
    expect((await storyDiscussion(context, gen))?.answer).toBe(draft().points[0].text);
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'writer', 'verifier', 'verifier']);
  });

  it('stops on repeated malformed receipts without spending another writer call', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft()).mockResolvedValue(malformed());
    expect(await storyDiscussion(context, gen)).toBeNull();
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'verifier']);
  });

  it('propagates an unchanged spending guard instead of releasing an unverified answer', async () => {
    const stopped = new Error('Existing question spending limit');
    const gen = vi.fn().mockResolvedValueOnce(draft('Both Theo and UnknownPerson blame each other.'))
      .mockResolvedValueOnce(malformed()).mockResolvedValueOnce(review()).mockRejectedValueOnce(stopped);
    await expect(storyDiscussion(context, gen)).rejects.toBe(stopped);
    expect(gen).toHaveBeenCalledTimes(4);
  });

  it('continues rejecting a source beyond the timestamp before any call', async () => {
    const gen = vi.fn();
    expect(await storyDiscussion({ ...context, sources: [...context.sources,
      { id: 'future', text: 'A later revelation.', season: 1, episode: 2, end: 1201 },
    ] }, gen)).toBeNull();
    expect(gen).not.toHaveBeenCalled();
  });

  it('resumes the identity repair without paying for completed draft and receipt checks again', async () => {
    const saved: Record<string, { value: unknown }> = {};
    const store: WatchCheckpoints = {
      load: async () => structuredClone(saved),
      save: async (key, value) => { saved[key] = { value: structuredClone(value) }; },
    };
    const first = vi.fn().mockResolvedValueOnce(draft('Both Theo and UnknownPerson blame each other.'))
      .mockResolvedValueOnce(malformed()).mockResolvedValueOnce(review())
      .mockRejectedValueOnce(new CompanionWorkDeferred());
    await expect(storyDiscussion(context, resumeWatchGenerator(first, store))).rejects.toBeInstanceOf(CompanionWorkDeferred);
    expect(Object.keys(saved)).toHaveLength(3);
    const resumed = vi.fn().mockResolvedValueOnce(draft()).mockResolvedValueOnce(review());
    const result = await storyDiscussion(context, resumeWatchGenerator(resumed, store));
    expect(result?.answer).toBe(draft().points[0].text);
    expect(resumed.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier']);
    expect(resumed.mock.calls[0]).toEqual(first.mock.calls[3]);
  });
});
