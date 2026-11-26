import { describe, expect, it, vi } from 'vitest';
import { storyDiscussion, type StoryDiscussionContext } from '../supabase/functions/_shared/story-discussion';
import { resumeWatchGenerator, type WatchCheckpoints } from '../supabase/functions/_shared/watch-checkpoints';
import { CompanionWorkDeferred } from '../supabase/functions/_shared/companion-work';

// Two already-permitted exchanges. Splitting their exact lines for storage
// creates ten fragments from just two selected references.
const line = (n: number) => `MIRA: Detail ${n}: sharing the flat makes the rent affordable. ${'The discussion concerns their housing costs. '.repeat(8)}`;
const context: StoryDiscussionContext = {
  question: 'Why did Mira suggest sharing a flat?',
  boundary: { season: 1, episode: 2, seconds: 1200 },
  sources: [1, 2].map(episode => ({ id: `R${episode}`, season: 1, episode, end: episode === 1 ? 90 : 1195,
    text: Array.from({ length: 5 }, (_, n) => line(n)).join('\n') })),
};
const support = context.sources.map(s => ({ id: s.id, firstLine: 1, lastLine: 5 }));
const text = 'Mira suggests sharing a flat to make the rent affordable.';
const draft = { points: [{ text, support }] };
const review = { boundarySafe: true, fit: 'direct', checks: [
  { index: 0, supported: true, issue: 'none', attribution: 'explicit', support },
] };
const malformed = { ...review, checks: [{ ...review.checks[0], support: [] }] };

describe('citation output contract and lossless reference splitting', () => {
  it('retains every selected word when two references expand past eight fragments', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review);
    const result = await storyDiscussion(context, gen);
    expect(result?.answer).toBe(text);
    expect(result?.points[0].support).toHaveLength(10);
    expect(result?.points[0].support.every(r => r.quote.length <= 700)).toBe(true);
    for (const source of context.sources) {
      expect(result?.points[0].support.filter(r => r.id === source.id).map(r => r.quote).join('\n')).toBe(source.text);
    }
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier']);
  });

  it('requires nonempty proof for approval in the actual provider schema, with a separate rejection route', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review);
    await storyDiscussion(context, gen);
    const schema = gen.mock.calls[1][4].json_schema.schema;
    expect(schema.type).toBe('object');
    expect(schema).not.toHaveProperty('anyOf');
    const branches = schema.properties.checks.items.anyOf;
    expect(branches).toHaveLength(2);
    const [approved, rejected] = branches.map(branch => branch.properties);
    expect(approved.supported.enum).toEqual([true]);
    expect(approved.issue.enum).toEqual(['none']);
    expect(approved.attribution.enum).not.toContain('uncertain');
    expect(approved.support.minItems).toBe(1);
    expect(approved.support.maxItems).toBe(8);
    expect(rejected.supported.enum).toEqual([false]);
    expect(rejected.issue.enum).not.toContain('none');
    expect(rejected.support.minItems).toBe(0);
    expect(rejected.support.maxItems).toBe(8);
    expect(branches.every(branch => branch.additionalProperties === false &&
      Object.keys(branch.properties).every(k => branch.required.includes(k)))).toBe(true);
  });

  it('rechecks the unchanged draft using its original references, not the ten internal fragments', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(malformed).mockResolvedValueOnce(review);
    const result = await storyDiscussion(context, gen);
    expect(result?.answer).toBe(text);
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'verifier']);
    const first = JSON.parse(gen.mock.calls[1][1]), second = JSON.parse(gen.mock.calls[2][1]);
    expect(second.points).toEqual(first.points);
    expect(second.sources).toEqual(first.sources);
    expect(result?.points[0].support).toHaveLength(10);
  });

  it('resumes a receipt retry without regenerating the completed draft or review', async () => {
    const saved: Record<string, { value: unknown }> = {};
    const store: WatchCheckpoints = {
      load: async () => structuredClone(saved),
      save: async (key, value) => { saved[key] = { value: structuredClone(value) }; },
    };
    const first = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(malformed).mockRejectedValueOnce(new CompanionWorkDeferred());
    await expect(storyDiscussion(context, resumeWatchGenerator(first, store))).rejects.toBeInstanceOf(CompanionWorkDeferred);
    const resumed = vi.fn().mockResolvedValueOnce(review);
    const answer = await storyDiscussion(context, resumeWatchGenerator(resumed, store));
    expect(answer?.answer).toBe(text);
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(resumed.mock.calls[0]).toEqual(first.mock.calls[2]);
  });

  it('still fails closed if a provider returns approved paragraphs without receipts', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValue(malformed);
    expect(await storyDiscussion(context, gen)).toBeNull();
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'verifier']);
  });

  it.each(['writer', 'verifier'])('still rejects nine model-selected references from the %s', async phase => {
    const tooMany = Array.from({ length: 9 }, () => support[0]);
    const gen = vi.fn().mockImplementation(async (_s, _u, _t, role) => role === 'writer'
      ? { points: [{ text, support: phase === 'writer' ? tooMany : support }] }
      : { ...review, checks: [{ ...review.checks[0], support: tooMany }] });
    expect(await storyDiscussion(context, gen)).toBeNull();
  });

  it('still rejects an oversized single reference even if all its text exists', async () => {
    const sources = [{ ...context.sources[0], text: Array.from({ length: 9 }, (_, n) => line(n)).join('\n') }];
    const gen = vi.fn().mockResolvedValue({ points: [{ text, support: [{ id: 'R1', firstLine: 1, lastLine: 9 }] }] });
    expect(await storyDiscussion({ ...context, sources }, gen)).toBeNull();
    expect(gen.mock.calls.every(c => c[3] === 'writer')).toBe(true);
  });

  it.each(['spoiler', 'speaker', 'identity', 'relevance'])('never repairs a semantic %s rejection by accepting more fragments', async issue => {
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...review,
      ...(issue === 'spoiler' ? { boundarySafe: false } : {}),
      checks: [{ ...review.checks[0], supported: false, issue }],
    }).mockResolvedValue({ points: [] });
    expect(await storyDiscussion(context, gen)).toBeNull();
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier', 'writer']);
  });

  it('rejects a future source before any writer or verifier call', async () => {
    const gen = vi.fn();
    expect(await storyDiscussion({ ...context, sources: [...context.sources, { ...context.sources[1], id: 'F', end: 1201 }] }, gen)).toBeNull();
    expect(gen).not.toHaveBeenCalled();
  });
});
