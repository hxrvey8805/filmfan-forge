import { describe, expect, it, vi } from 'vitest';
import { modelCaptionLines } from '../supabase/functions/_shared/caption-lines';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import { verificationEvidence } from '../supabase/functions/_shared/verification';
import type { Evidence, ViewingPosition } from '../supabase/functions/_shared/companion';

describe('compact model captions', () => {
  it('preserves all dialogue, denials, sounds, names and line boundaries', () => {
    const text = "[00:00:10] (MIRA) I'm leaving.\n[00:00:11] No, I'm not.\n\n[00:00:12] [DOOR CLOSES]\nThe display says [00:00:13].";
    expect(modelCaptionLines(text)).toEqual(["(MIRA) I'm leaving.", "No, I'm not.", '', '[DOOR CLOSES]', 'The display says [00:00:13].']);
    const row: Evidence = { id: 'P1', season: 1, episode: 2, start: 10, end: 13, text };
    const result = verificationEvidence([row])[0];
    expect(result).toMatchObject({ id: 'P1', start: 10, end: 13, season: 1, episode: 2 });
    expect(result.lines.map(line => line.id)).toEqual(['P1:1', 'P1:2', 'P1:3', 'P1:4', 'P1:5']);
    expect(row.text).toBe(text);
  });
  it('clips future and other-episode evidence before formatting; preserves citation times', async () => {
    const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 20 };
    const original: Evidence = { id: 'original', season: 1, episode: 2, start: 10, end: 12,
      text: '[00:00:10] (MIRA) Stay here.\n[00:00:11] Wait for me.' };
    const rows = [original, { ...original, id: 'future', end: 21, text: 'FUTURE_CUE' },
      { ...original, id: 'next', episode: 3, text: 'NEXT_EPISODE_CUE' }];
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [{ text: 'Mira asks someone to stay.', evidenceIds: ['P1'] }] })
      .mockResolvedValueOnce({ withinBoundary: true, answersQuestion: true, sufficient: true,
        checks: [{ index: 0, supported: true, basis: 'entailed', issue: 'none', sources: ['P1:1'] }] });
    const result = await checkedAnswer('What is said?', position, rows, [], generate);
    expect(result?.evidence[0]).toMatchObject({ id: 'original', start: 10, end: 12, season: 1, episode: 2 });
    expect(generate.mock.calls[0][1]).toContain('00:00:10–00:00:12');
    expect(generate.mock.calls[0][1]).toContain('(MIRA) Stay here.\nWait for me.');
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_CUE|NEXT_EPISODE_CUE/);
    expect(original.text).toContain('[00:00:11]');
  });
  it('does not send whole-script or summary metadata beside a permitted excerpt', async () => {
    const position: ViewingPosition = { tmdbId: 1, mediaType: 'movie', seconds: 20 };
    const row = { id: 'source', season: null, episode: null, start: 10, end: 12,
      text: '[00:00:10] The letter is sealed.', fullScript: 'FUTURE_SCRIPT_SENTINEL',
      seasonSummary: 'FUTURE_SUMMARY_SENTINEL', sourceNotes: { hiddenIdentity: 'FUTURE_IDENTITY_SENTINEL' } };
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [{ text: 'A speaker says the letter is sealed.', evidenceIds: ['P1'] }] })
      .mockResolvedValueOnce({ withinBoundary: true, sufficient: true, answersQuestion: true,
        checks: [{ index: 0, supported: true, basis: 'entailed', issue: 'none', sources: ['P1:1'] }] });
    const result = await checkedAnswer('What is said?', position, [row], [], generate);
    expect(result?.answer).toContain('letter is sealed');
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_.*_SENTINEL|fullScript|seasonSummary|sourceNotes/);
    expect(JSON.parse(generate.mock.calls[1][1]).evidence[0]).toEqual({ id: 'P1', season: null, episode: null,
      start: 10, end: 12, lines: [{ id: 'P1:1', text: 'The letter is sealed.' }] });
  });
});
