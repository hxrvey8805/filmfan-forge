import { describe, expect, it, vi } from 'vitest';
import { draftGroundingIssues, groundingContextHints, namedSpeechSubjects } from '../supabase/functions/_shared/draft-grounding';
import { storyDiscussion, type StoryDiscussionContext } from '../supabase/functions/_shared/story-discussion';

// Invented dialogue exercises the digit/hyphen shape from the captured failure.
const ctx: StoryDiscussionContext = {
  question: 'Explain this scene and why they are blaming each other.',
  boundary: { season: 1, episode: 2, seconds: 1200 },
  request: { intent: 'scene', target: { season: 1, episode: 2, start: 1080, end: 1200 } },
  sources: [
    { id: 'R1', season: 1, episode: 1, end: 100, historicalDialogue: true,
      text: 'MIRA: Unit-7 will bring the fuel.\nUNIT-7: You must check the engine.' },
    { id: 'R2', season: 1, episode: 2, end: 1195,
      text: 'MIRA: You forgot the fuel, Unit-7.\nUNIT-7: You never checked the engine, Mira.' },
  ],
};
const text = 'Both Mira and Unit-7 blame each other for not doing the jobs they agreed to do.';
const support = ctx.sources.map(s => ({ id: s.id, firstLine: 1, lastLine: 2 }));
const draft = { points: [{ text, support }] };
const review = { boundarySafe: true, fit: 'direct', checks: [
  { index: 0, supported: true, issue: 'none', attribution: 'contextual', support },
] };

describe('complete alphanumeric names in checked explanations', () => {
  it('accepts the independently supported name without an unnecessary rewrite', async () => {
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(review).mockResolvedValue({ points: [] });
    const answer = await storyDiscussion(ctx, gen);
    expect(answer?.answer).toBe(text);
    expect(answer?.sourceIds).toEqual(['R1', 'R2']);
    expect(gen.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier']);
  });

  it.each(['Unit-7', 'Unit7', 'R2-D2', 'Sector-12'])('looks up the complete token %s rather than its letter prefix', name => {
    const evidence = [{ id: 'R1', text: `${name} missed the repair.`, start: 0, end: 10 }];
    const claim = { status: 'answered' as const, claims: [{ text: `The problem involves ${name}.`, evidenceIds: ['R1'] }] };
    expect(draftGroundingIssues('Explain this.', claim, evidence)).not.toContain('identity');
    expect(groundingContextHints(claim.claims[0].text, '', evidence).contextCandidates).toContainEqual({ word: name.toLowerCase(), sourceIds: ['R1'] });
    expect(namedSpeechSubjects(`${name} says the repair failed.`)).toEqual([name.toLowerCase()]);
  });

  it.each(['Unit-8', 'Unit7', 'Unknown-7'])('still rejects a different or unsupported identity: %s', name => {
    const evidence = ctx.sources.map(s => ({ ...s, start: 0 }));
    expect(draftGroundingIssues(ctx.question, { status: 'answered', claims: [
      { text: `The problem involves ${name}.`, evidenceIds: ['R1', 'R2'] },
    ] }, evidence)).toContain('identity');
  });

  it('requires independent attribution even when the complete name exists in the sources', async () => {
    const rejected = { ...review, checks: [{ ...review.checks[0], supported: false, issue: 'speaker' }] };
    const gen = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(rejected).mockResolvedValue({ points: [] });
    expect(await storyDiscussion(ctx, gen)).toBeNull();
  });

  it('requires the named speaker in this paragraph’s exact receipts', async () => {
    const speaking = { points: [{ text: 'Unit-7 says the engine was never checked.', support }] };
    const unrelated = { ...ctx, sources: [...ctx.sources,
      { id: 'R3', season: 1, episode: 2, end: 1196, text: 'The engine was never checked.' },
    ] };
    const missingName = { ...review, checks: [{ ...review.checks[0], support: [{ id: 'R3', firstLine: 1, lastLine: 1 }] }] };
    const gen = vi.fn().mockResolvedValueOnce(speaking).mockResolvedValueOnce(missingName).mockResolvedValue({ points: [] });
    expect(await storyDiscussion(unrelated, gen)).toBeNull();
  });

  it('still rejects later source material before calling a model', async () => {
    const gen = vi.fn();
    expect(await storyDiscussion({ ...ctx, sources: [...ctx.sources,
      { id: 'FUTURE', season: 1, episode: 2, end: 1201, text: 'Unit-7 reveals a later secret.' },
    ] }, gen)).toBeNull();
    expect(gen).not.toHaveBeenCalled();
  });
});
