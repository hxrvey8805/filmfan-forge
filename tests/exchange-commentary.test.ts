import { describe, expect, it, vi } from 'vitest';
import { companionAnswer } from '../supabase/functions/_shared/answer';
import { unsupportedFrame } from '../supabase/functions/_shared/story-speech-grounding';
import { broadDiscussion } from '../supabase/functions/_shared/exchange-commentary';
import type { Evidence, ViewingPosition } from '../supabase/functions/_shared/companion';
const position: ViewingPosition = {
  tmdbId: 9,
  mediaType: 'tv',
  seasonNumber: 1,
  episodeNumber: 2,
  seconds: 45,
};
const rows: Evidence[] = [
  { id: 'prior', season: 1, episode: 2, start: 3, end: 12, text: '[00:00:03] We have to choose a route.' },
  {
    id: 'latest',
    season: 1,
    episode: 2,
    start: 23,
    end: 43,
    text: '[00:00:23] I cannot read this map.\n[00:00:38] Can you explain the route?',
  },
  { id: 'later', season: 1, episode: 2, start: 44, end: 46, text: 'FUTURE_CUE' },
  { id: 'other', season: 1, episode: 3, start: 0, end: 1, text: 'OTHER_EPISODE' },
];
const question = 'What are they discussing at this point, and what is your read?';
const point = {
  beat: 'The map is the sticking point. Someone needs the route explained.',
  lineIds: ['P2:1', 'P2:2'],
};
const approved = {
  boundarySafe: true,
  addressesQuestion: true,
  points: [
    { index: 0, grounded: true, proof: ['P2:1'], issue: 'none' },
    { index: 1, grounded: true, proof: ['P2:1', 'P2:2'], issue: 'none' },
  ],
};

describe('line-cited companion explanations', () => {
  it('shows the exact independently checked prose with real line IDs, excluding future and other-episode material', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ points: [point] }).mockResolvedValueOnce(approved);
    const answer = await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true });
    expect(answer?.answer).toBe(point.beat);
    expect(answer?.evidence).toMatchObject([{
      id: 'latest',
      citations: [{ paragraph: 1, lineIds: point.lineIds }],
    }]);
    expect(generate.mock.calls.map((c) => c[3])).toEqual(['writer', 'verifier']);
    expect(JSON.parse(generate.mock.calls[1][1]).points).toEqual([{
      text: point.beat,
      lineIds: point.lineIds,
    }]);
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/OTHER_EPISODE|FUTURE_CUE/);
  });
  it.each([
    { ...approved, boundarySafe: false },
    { ...approved, addressesQuestion: false },
    { ...approved, points: [] },
    { ...approved, points: [{ index: 0, grounded: false }] },
    { ...approved, points: [approved.points[0], approved.points[0]] },
    { ...approved, points: [approved.points[0], { ...approved.points[1], proof: ['P1:1'] }] },
    { ...approved, points: [approved.points[0], { ...approved.points[1], proof: [] }] },
    { ...approved, points: [approved.points[0], { ...approved.points[1], issue: 'action' }] },
  ])('withholds the complete draft when the independent review fails', async (review) => {
    const generate = vi.fn().mockResolvedValueOnce({ points: [point] }).mockResolvedValueOnce(review);
    const answer = await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true });
    expect(answer).toMatchObject({ limited: true });
    expect(answer?.answer).not.toContain(point.beat);
  });
  it.each([
    { ...point, lineIds: [] },
    { ...point, lineIds: ['P999:2'] },
    { ...point, lineIds: ['P2:1-P2:2'] },
    { ...point, beat: 'The map is a forgery.' },
    { ...point, beat: 'Darth secretly hides the map.' },
  ])('rejects invalid citations and unsupported additions before review', async (candidate) => {
    const generate = vi.fn().mockResolvedValueOnce({ points: [candidate] });
    expect(await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true })).toMatchObject({ limited: true });
    expect(generate.mock.calls.map((c) => c[3])).toEqual(['writer', 'writer']);
  });
  it('rechecks fresh prose from scratch without feeding the rejected claim back to the writer', async () => {
    const generate = vi.fn().mockResolvedValueOnce({
      points: [{ ...point, beat: 'Darth secretly hides the map.' }],
    })
      .mockResolvedValueOnce({ points: [point] }).mockResolvedValueOnce(approved);
    expect((await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true }))?.answer).toBe(point.beat);
    expect(generate.mock.calls.map((c) => c[3])).toEqual(['writer', 'writer', 'verifier']);
    expect(JSON.stringify(generate.mock.calls)).not.toContain('Darth');
  });
  it('allows the reviewer to return only real IDs from the offered proof', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ points: [point] }).mockResolvedValueOnce(approved);
    await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true });
    const schema = generate.mock.calls[1][4].json_schema.schema;
    expect(schema.properties.points.items.properties.proof.items.enum).toEqual(point.lineIds);
  });
  it('checks a second sentence separately after punctuation inside a quote', async () => {
    const beat = "Someone says 'I cannot read this map.' That uncertainty matters.";
    const generate = vi.fn().mockResolvedValueOnce({ points: [{ ...point, beat }] });
    await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true });
    expect(JSON.parse(generate.mock.calls[1][1]).sentenceProofs.map((s: { sentence: string }) => s.sentence))
      .toEqual(["Someone says 'I cannot read this map.'", 'That uncertainty matters.']);
  });
  it.each([true, false])('rechecks the shortened answer for relevance and coherence (accept=%s)', async (accept) => {
    const unsafe = 'That delay puts the whole trip in jeopardy.';
    const draft = { beat: 'Someone cannot read the map. ' + unsafe, lineIds: point.lineIds };
    const mixed = { ...approved, points: [
      { index: 0, grounded: true, proof: ['P2:1'], issue: 'none' },
      { index: 1, grounded: false, proof: [], issue: 'missing_proof' },
    ] };
    const generate = vi.fn().mockResolvedValueOnce({ points: [draft] }).mockResolvedValueOnce(mixed)
      .mockResolvedValueOnce({ ...approved, addressesQuestion: accept, points: [mixed.points[0]] });
    const answer = await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true });
    expect(generate.mock.calls[2][3]).toBe('verifier');
    const finalCheck = JSON.parse(generate.mock.calls[2][1]);
    expect(finalCheck.points).toEqual([{ text: 'Someone cannot read the map.', lineIds: ['P2:1'] }]);
    expect(JSON.stringify(finalCheck)).not.toContain(unsafe);
    if (accept) {
      expect(answer?.answer).toBe('Someone cannot read the map.');
      expect(answer?.evidence[0]).toMatchObject({ citations: [{ paragraph: 1, lineIds: ['P2:1'] }] });
    } else {
      expect(answer).toMatchObject({ limited: true });
    }
  });
  it('rejects canned essay openings even when a line ID is valid', async () => {
    const draft = {
      beat: 'The conversation centers on uncertainty about the route.',
      lineIds: point.lineIds,
    };
    const generate = vi.fn().mockResolvedValue({ points: [draft] });
    expect(await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true })).toMatchObject({ limited: true });
    expect(generate.mock.calls.map((c) => c[3])).toEqual(['writer', 'writer']);
  });
  it('withholds the entire draft if just one paragraph fails review', async () => {
    const generate = vi.fn().mockResolvedValueOnce({
      points: [point, { ...point, beat: 'Someone asks for directions.' }],
    })
      .mockResolvedValueOnce({
        ...approved,
        points: [{ index: 0, grounded: true }, { index: 1, grounded: false }],
      });
    const answer = await companionAnswer(question, position, rows, [], generate, undefined, undefined, [], { experimentalCaptionWriter: true });
    expect(answer).toMatchObject({ limited: true });
    expect(answer?.answer).not.toContain(point.beat);
  });
});
it('does not infer deliberate fabrication or legal status from a disputed account or a request for help', () => {
  expect(unsupportedFrame('The account could be fabricated.', 'They got my name right, but nothing else.'))
    .toBe(
      true,
    );
  expect(unsupportedFrame('The question could be feigned.', 'What country am I from again?')).toBe(true);
  expect(unsupportedFrame('This could be temporary guardianship.', 'Look after her for me.')).toBe(true);
  expect(
    unsupportedFrame(
      'The need to pretend could complicate the offer.',
      'Do I have to pretend to be a student?',
    ),
  ).toBe(true);
  expect(unsupportedFrame('They wonder whether they have to pretend.', 'Do I have to pretend?')).toBe(false);
  expect(unsupportedFrame('They ask whether it is necessary, so a disguise is required.', 'Do I have to pretend?')).toBe(true);
});
it('leaves questions about a named person or specific subject to subject-aware retrieval', () => {
  expect(broadDiscussion(question)).toBe(true);
  expect(broadDiscussion('What are they discussing about the contract?')).toBe(false);
  expect(broadDiscussion('Recap what Mira said about the letter.')).toBe(false);
});

it('keeps an instruction distinct from a completed departure and a correction distinct from an intentional joke', () => {
  expect(
    unsupportedFrame(
      'The instruction turns into an immediate physical departure.',
      'Pack a bag. Take ten minutes.',
    ),
  ).toBe(true);
  expect(
    unsupportedFrame(
      'One person deflects with a joke about the answer.',
      'No, that is the name of a toothpaste.',
    ),
  ).toBe(true);
  expect(unsupportedFrame('There is very little time to get ready.', 'Pack a bag. Take ten minutes.')).toBe(
    false,
  );
});

it('does not expose experimental caption commentary to viewers of an unreviewed scene', async () => {
  const generate = vi.fn().mockResolvedValue({points:[{beat:'Unreviewed content'}]});
  const result = await companionAnswer('What are they discussing at this point?',position,rows,[],generate);
  expect(generate).not.toHaveBeenCalled();
  expect(result).toMatchObject({limited:true});
  expect(result?.answer).not.toContain('Unreviewed content');
});
