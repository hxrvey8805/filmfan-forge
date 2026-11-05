import { describe, expect, it, vi } from 'vitest';
import { wordplayAnswer } from '../supabase/functions/_shared/wordplay';
import { reviewedAttribution } from '../supabase/functions/_shared/reviewed-attribution';
import type { Evidence } from '../supabase/functions/_shared/companion';
import type { PreparedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';

const p = { mediaType: 'tv' as const, tmdbId: 12, seasonNumber: 1, episodeNumber: 2, seconds: 30 };
const pack = (text: string): Evidence => ({ id: 'captions', season: 1, episode: 2, start: 16, end: 28, text });
const old = pack('[00:00:16] When I was your age, streaming was called radio.');
const exchange = pack('[00:00:16] I deserve a medal.\n[00:00:23] You can have a parking ticket.');
const q = 'Why is the line about a medal and a parking ticket funny?';
const pick = {
  kind: 'undercut',
  first: 'P1:1',
  last: 'P1:2',
  setup: 'I deserve a medal',
  payoff: 'a parking ticket',
  startsAs: 'boast',
  landsAs: 'reprimand',
};
describe('jokes are interpretations with bounded sources', () => {
  it('explains the contrast, cites its source, and ignores unselected model prose', async () => {
    const generate = vi.fn().mockResolvedValue({ choice: 'J1', freeText: 'FUTURE_ACTION' });
    const r = await wordplayAnswer('Why call streaming radio?', p, [old], [], generate);
    expect(r?.answer).toContain('older generation');
    expect(r?.answer).not.toContain('FUTURE_ACTION');
    expect(r?.evidence[0]).toMatchObject({ id: 'captions', citations: [{ paragraph: 1, lineIds: ['P1:1'] }] });
  });
  it('does not explain a rejected candidate or inspect another episode or a later payoff', async () => {
    const generate = vi.fn().mockResolvedValue({ choice: '' });
    const rows = [old, { ...old, end: 31, text: 'FUTURE_PAYOFF' }, {
      ...old,
      episode: 1,
      text: 'OTHER_EPISODE',
    }];
    expect(await wordplayAnswer('Why call streaming radio?', p, rows, [], generate)).toBeNull();
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_PAYOFF|OTHER_EPISODE/);
    generate.mockClear();
    expect(await wordplayAnswer('Why call streaming radio?', { ...p, seconds: 15 }, rows, [], generate))
      .toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it('independently checks the meaning of an unfamiliar joke', async () => {
    const generate = vi.fn().mockResolvedValueOnce(pick).mockResolvedValueOnce({ verdict: 'supported' });
    const r = await wordplayAnswer(q, p, [exchange], [], generate);
    expect(r?.answer).toContain('takes the air out');
    expect(r?.evidence[0].citations?.[0].lineIds).toEqual(['P1:1', 'P1:2']);
    expect(JSON.parse(generate.mock.calls[1][1]).answer).toBe(r?.answer);
  });
  it('requires a continuous quotation and an independently verified reading for a split punchline', async () => {
    const split = pack(
      '[00:00:16] I deserve a medal.\n[00:00:19] You can have a parking\n[00:00:23] ticket instead.',
    );
    const joined = { ...pick, last: 'P1:3', payoff: 'a parking ticket instead' };
    const gen = vi.fn().mockResolvedValueOnce(joined).mockResolvedValueOnce({ verdict: 'supported' });
    const r = await wordplayAnswer(q, p, [split], [], gen);
    expect(r?.evidence[0].citations?.[0].lineIds).toEqual(['P1:1', 'P1:2', 'P1:3']);
    for (const payoff of ['a parking ticket tomorrow', 'a ticket instead']) {
      expect(await wordplayAnswer(q, p, [split], [], vi.fn().mockResolvedValue({ ...joined, payoff })))
        .toBeNull();
    }
  });
  it.each([[{ ...pick, first: 'P3:1' }, 'supported'], [{ ...pick, payoff: 'a future arrest' }, 'supported'], [
    pick,
    'unsupported',
  ]])('rejects forged evidence or unverified meaning', async (selection, verdict) => {
    const gen = vi.fn().mockResolvedValueOnce(selection).mockResolvedValueOnce({ verdict });
    expect(await wordplayAnswer(q, p, [exchange], [], gen)).toBeNull();
  });
});
describe('independently reviewed attribution on a provider-sensitive question', () => {
  const note: PreparedSceneNote = {
    id: 'inspection',
    mediaType: 'tv',
    tmdbId: 12,
    season: 1,
    episode: 2,
    start: 12,
    end: 26,
    validUntil: 40,
    text: 'The staff delay the trip because they say the bridge bolts are loose.',
    cueWords: ['The bridge bolts are loose.'],
    cueIds: ['C1'],
    contextIds: [],
    topics: [],
    uses: ['explanation'],
  };
  const why = 'Why does the speaker insist the bridge bolts are loose?';
  it('returns exactly the reviewed attribution with its limits and line IDs', () => {
    const r = reviewedAttribution(why, p, [note]);
    expect(r?.answer.startsWith(note.text)).toBe(true);
    expect(r?.limited).toBe(true);
    expect(r?.evidence[0].citations[0].lineIds).toEqual(['C1']);
  });
  it('refuses wrong scope, negation, uncertain reference and unanchored claims', () => {
    for (
      const bad of [
        { ...note, episode: 1 },
        { ...note, end: 31 },
        { ...note, tmdbId: 13 },
        { ...note, validUntil: 29 },
        { ...note, contextIds: ['other'] },
        { ...note, cueWords: ['Someone says so.'] },
      ]
    ) expect(reviewedAttribution(why, p, [bad])).toBeNull();
    expect(reviewedAttribution(why, p, [note, { ...note, id: 'also' }])).toBeNull();
    expect(reviewedAttribution(why.replace('are loose', 'are not loose'), p, [note])).toBeNull();
    expect(reviewedAttribution(why.replace('the speaker', 'Morgan'), p, [note])).toBeNull();
  });
});
