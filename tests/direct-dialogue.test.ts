import { describe, expect, it, vi } from 'vitest';
import { directDialogue } from '../supabase/functions/_shared/direct-dialogue';
import { type Evidence, questionIntent, type ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = {
  tmdbId: 1,
  mediaType: 'tv',
  seasonNumber: 1,
  episodeNumber: 2,
  seconds: 45,
};
const source: Evidence = {
  id: 'local',
  season: 1,
  episode: 2,
  start: 20,
  end: 38,
  text: '[00:00:20] Would you do the honors?\n[00:00:25] [Sighs]\n[00:00:29] I hate this!',
};
const rows = [source, { ...source, id: 'wrong', episode: 1, text: 'SECRET_OTHER_EPISODE' }, {
  ...source,
  id: 'later',
  end: 60,
  text: 'SECRET_FUTURE',
}];
const question = 'What happens before the request?';
const draft = { kind: 'sequence', from: 'P1:1', to: 'P1:2', pivot: 'P1:2', answer: 'UNVERIFIED_INVENTION' };
describe('specific dialogue answers', () => {
  it('routes an exact why question with a time modifier to the explanation path', () => {
    expect(questionIntent('Why does the speaker object right now?')).toBe('explanation');
    expect(questionIntent('What is happening right now?')).toBe('scene');
  });
  it('corrects a reversed sound cue without attributing it to the person in the question', async () => {
    const generate = vi.fn();
    const result = await directDialogue(
      'Why did Kim sigh before being asked to do the honors?',
      position,
      rows,
      [],
      generate,
    );
    expect(result?.answer).toContain('The order is reversed.');
    expect(result?.answer).not.toContain('Kim');
    expect(result?.limited).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });
  it('orders original lines and never displays invented model wording or exposes ineligible scope', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({
      verdict: 'direct',
      reading: 'UNVERIFIED_INVENTION',
    });
    const result = await directDialogue(question, position, rows, [], generate);
    expect(result?.answer).toBe(
      'In the subtitles, first comes “Would you do the honors?” Then comes “[Sighs]”',
    );
    expect(result?.evidence).toMatchObject([{
      id: 'local',
      citations: [{ paragraph: 1, lineIds: ['P1:1', 'P1:2'] }],
    }]);
    expect(JSON.stringify(generate.mock.calls)).not.toContain('SECRET_');
  });
  it('only renders approved contiguous source and keeps uncertain answers out of memory', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ ...draft, kind: 'bounded', to: 'P1:3' })
      .mockResolvedValueOnce({ verdict: 'direct', reading: '' });
    const result = await directDialogue(question, position, rows, [], generate);
    expect(result).toMatchObject({ limited: true });
    expect(result?.answer).toContain('Would you do the honors? [Sighs] I hate this!');
  });
  it('does not promote an unexplained joke to answered even when both models approve the quote', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ kind: 'stated', from: 'P1:1', to: 'P1:3', pivot: '' })
      .mockResolvedValueOnce({ verdict: 'direct', reading: '' });
    const result = await directDialogue('What makes that joke funny?', position, rows, [], generate);
    expect(result?.limited).toBe(true);
    expect(result?.answer).toContain('couldn’t verify an explanation');
  });
  it.each(['Why does the wording matter?', 'What does the comparison mean?', 'What does this contrast suggest?'])(
    'does not count a quote as an explanation: %s', async q => {
      const generate = vi.fn().mockResolvedValueOnce({ kind: 'stated', from: 'P1:1', to: 'P1:3', pivot: '' })
        .mockResolvedValueOnce({ verdict: 'direct', reading: '' });
      const result = await directDialogue(q, position, rows, [], generate);
      expect(result?.limited).toBe(true);
      expect(result?.answer).toContain('couldn’t verify an explanation of that detail');
    });
  it('preserves the reviewed meaning of a named joke without claiming a motive or accepting an adjacent note', async () => {
    const lines = { ...source, text: '[00:00:20] Your map is blank.\n[00:00:25] Call it the atlas joke.' };
    const note = {
      id: 'map',
      tmdbId: 1,
      mediaType: 'tv' as const,
      season: 1,
      episode: 2,
      start: 20,
      end: 30,
      uses: ['explanation' as const],
      contextIds: [],
      topics: [],
      cueWords: ['Your map is blank.', 'Call it the atlas joke.'],
      cueIds: ['C1', 'C2'],
      text: 'The atlas joke plays on how useless a map without markings is.',
    };
    const q = 'Why do they call it the atlas joke?';
    const run = (text: string) =>
      directDialogue(
        q,
        position,
        [lines],
        [],
        vi.fn()
          .mockResolvedValueOnce({ kind: 'bounded', from: 'P1:1', to: 'P1:2', pivot: '' })
          .mockResolvedValueOnce({ verdict: 'bounded', reading: 'R1' }),
        [{ ...note, text }],
      );
    const r = await run(note.text);
    expect(r?.limited).toBe(true);
    expect(r?.answer).toContain(note.text);
    expect(r?.evidence.at(-1)).toMatchObject({ id: 'reviewed:map', citations: [{ lineIds: ['C1', 'C2'] }] });
    expect((await run('The badge joke plays on a misspelling.'))?.answer).not.toContain('badge');
  });
  it.each([
    [{ ...draft, from: 'P2:1' }, 'direct'],
    [{ ...draft, to: 'P9:1' }, 'direct'],
    [{ ...draft, to: 'P1:1' }, 'direct'],
    [{ ...draft, pivot: 'P3:1' }, 'direct'],
    [draft, 'unrelated'],
  ])('withholds invalid spans, fabricated aliases and rejected selections', async (value, verdict) => {
    const generate = vi.fn().mockResolvedValueOnce(value).mockResolvedValueOnce({ verdict, reading: '' });
    expect(await directDialogue(question, position, rows, [], generate)).toBeNull();
  });
});
