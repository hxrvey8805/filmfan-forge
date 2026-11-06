import { describe, expect, it, vi } from 'vitest';
import { permittedSceneNotes, reviewedSceneAnswer, type ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';
import { companionAnswer } from '../supabase/functions/_shared/answer';
import { companionResponse } from '../supabase/functions/_shared/companion-response';
import { COMPANION_VERSION, promptConversation, safeHistory, type Conversation, type ViewingPosition } from '../supabase/functions/_shared/companion';

// Fictional fixtures: a silent discovery is deliberately absent from dialogue.
const p = { tmdbId: 10, mediaType: 'tv' as const, seasonNumber: 1, episodeNumber: 1, seconds: 60 };
const cues = [{ start: 45, end: 46, text: 'Anyone else know?' }, { start: 47, end: 48, text: 'Just the caretaker.' }];
const records = [{ id: 'final', tmdb_id: 10, media_type: 'tv', season_number: 1, episode_number: 1,
  ingestion_version: 3, source_file_id: 100, cues }];
const note: ReviewedSceneNote = { id: 'silent-discovery', tmdb_id: 10, media_type: 'tv', season_number: 1,
  episode_number: 1, source_file_id: 100, start_seconds: 45, reveal_seconds: 60,
  summary: 'That’s a shock. The ending shows Mira dead, but this episode has not identified the killer. What did you make of that ending?',
  coverage: 'limited', valid_until_seconds: 60, uses: ['scene', 'explanation'], topics: ['Mira', 'killer'], anchors: cues,
  review: { status: 'reviewed', basis: 'scene_prefix', reference: 'Fictional episode-end test review', reviewed_at: '2026-11-05T22:00:00Z' },
  scene_review: { kind: 'episode_review', availability: 'episode_end', reviewed_through_seconds: 60, knowledge: 'unresolved',
    references: [{ url: 'https://review.example/episode-1', locator: 'Ending observation' },
      { url: 'https://another.example/episode-1', locator: 'Confirms unresolved identity' }] } };
const prepare = (notes = [note], pos: ViewingPosition = p, rows = records) => permittedSceneNotes(notes, rows, pos);
const historyRow = (answer: string, overrides = {}): Conversation => ({ id: 'later', title_id: 10, media_type: 'tv',
  season_number: 1, episode_number: 1, position_seconds: 60, companion_version: COMPANION_VERSION,
  question: 'Who killed Mira?', answer, context: '', timestamp: '00:01:00', created_at: '2026-11-05T22:00:00Z',
  answer_status: 'insufficient_evidence', ...overrides });

describe('independently reviewed visual scenes', () => {
  it('acknowledges a silent event before looking for contradictory older dialogue', async () => {
    const ask = vi.fn().mockResolvedValueOnce({ noteIds: ['N1'] })
      .mockResolvedValueOnce({ fit: 'context', receipt: 'this episode has not identified the killer' });
    const answer = await companionAnswer('Who killed Mira?', p,
      [{ id: 'earlier', season: 1, episode: 1, start: 10, end: 12, text: '[00:00:10] Mira tried to kill me.' }],
      [], ask, undefined, undefined, prepare());
    expect(ask).toHaveBeenCalledTimes(2);
    expect(answer?.answer).toBe(note.summary);
    expect(answer?.evidence[0].label).toContain('Reviewed scene note');
    // Caption anchors identify the edition; they must not masquerade as citations
    // proving a visual event that is not spoken in those lines.
    expect(answer?.evidence[0]).not.toHaveProperty('citations');
    expect(JSON.stringify(ask.mock.calls)).not.toMatch(/review\.example|caretaker|tried to kill/);
    expect(companionResponse('Who killed Mira?', p, [], [], answer)).toMatchObject({
      answer: note.summary, answer_status: 'insufficient_evidence', charge: false });
  });

  it('requires a reviewed edition, valid references and an explicit end-only gate', () => {
    expect(prepare()).toHaveLength(1);
    const review = note.scene_review!;
    const invalid = [
      { source_file_id: null }, { source_file_id: 101 }, { scene_review: undefined },
      { scene_review: { ...review, availability: 'timed_scene' } },
      { scene_review: { ...review, reviewed_through_seconds: 61 } },
      { scene_review: { ...review, references: [review.references[0]] } },
      { scene_review: { ...review, references: [review.references[0], review.references[0]] } },
      { scene_review: { ...review, references: [{ url: 'https://[invalid/', locator: 'Invalid URL' }] } },
      { scene_review: { ...review, references: [{ url: 'http://insecure.example/', locator: 'Invalid scheme' }] } },
      { review: { ...note.review, status: 'draft' } }, { review: { ...note.review, basis: 'caption_prefix' } },
      { coverage: 'complete' }, { valid_until_seconds: undefined }, { valid_until_seconds: 61 },
    ];
    for (const change of invalid) expect(prepare([{ ...note, ...change } as ReviewedSceneNote])).toEqual([]);
    expect(prepare([note], p, [{ ...records[0], cues: cues.slice(0, 1) }])).toEqual([]);
    expect(prepare([note], p, [{ ...records[0], cues: cues.map(c => ({ ...c, end: c.end + 0.1 })) }])).toEqual([]);
  });

  it('removes end-only facts and history at a rewind, episode switch or different title', async () => {
    const visible = historyRow(note.summary);
    expect(safeHistory([visible], p)).toEqual([visible]);
    expect(promptConversation([visible], p)).toEqual([]);
    for (const pos of [{ ...p, seconds: 59.999 }, { ...p, episodeNumber: 2 }, { ...p, seasonNumber: 2 },
      { ...p, tmdbId: 11 }, { ...p, mediaType: 'movie' as const, seasonNumber: undefined, episodeNumber: undefined }]) {
      expect(prepare([note], pos)).toEqual([]);
      expect(safeHistory([visible], pos)).toEqual([]);
      expect(promptConversation([visible], pos)).toEqual([]);
      const ask = vi.fn();
      expect(await reviewedSceneAnswer('Who killed Mira?', pos, prepare(), [visible], ask)).toBeNull();
      expect(ask).not.toHaveBeenCalled();
    }
    expect(prepare([note], { ...p, seconds: 60.001 })).toEqual([]); // No stale “still unknown”.
    expect(safeHistory([visible], p)).toEqual([visible]); // Return to original episode.
  });

  it('gates timed observations by their reveal, not by the earlier in-story date', async () => {
    const observed: ReviewedSceneNote = { ...note, id: 'discovery', reveal_seconds: 50, coverage: 'complete',
      valid_until_seconds: undefined, summary: 'The empty chair is shown.',
      scene_review: { ...note.scene_review!, kind: 'released_video', availability: 'timed_scene',
        reviewed_through_seconds: 50, knowledge: 'established' } };
    const future = { ...observed, id: 'later-resolution', reveal_seconds: 80, summary: 'FUTURE_KILLER_SENTINEL',
      scene_review: { ...observed.scene_review!, reviewed_through_seconds: 80 } };
    const futureHistory = historyRow(future.summary, { position_seconds: 80, answer_status: 'answered' });
    const ask = vi.fn().mockResolvedValue({ noteIds: ['N1'] });
    const permitted = prepare([observed, future]);
    expect(permitted.map(n => n.id)).toEqual(['discovery']);
    await reviewedSceneAnswer('What is happening?', p, permitted, [futureHistory], ask);
    expect(JSON.stringify(ask.mock.calls)).not.toContain('FUTURE_KILLER_SENTINEL');
    expect(safeHistory([futureHistory], p)).toEqual([]);
    expect(prepare([observed], { ...p, seconds: 49.999 })).toEqual([]);
  });

  it('rejects provider-added theories and additional prose rather than displaying them', async () => {
    const result = await reviewedSceneAnswer('Who killed Mira?', p, prepare(), [],
      async () => ({ noteIds: ['N1'], theory: 'The caretaker probably did it.' }));
    expect(result).toBeNull();
  });

  it('does not promote a nearby verified visual fact into an identity answer', async () => {
    const nearby = { ...prepare()[0], limited: undefined, knowledge: 'established' as const,
      text: 'The masked visitor is climbing the wall. The climbing does not establish an identity.' };
    const ask = vi.fn().mockResolvedValueOnce({ noteIds: ['N1'] })
      .mockResolvedValueOnce({ fit: 'context', receipt: 'does not establish an identity' })
      .mockResolvedValue(null);
    const stages: string[] = [];
    const answer = await companionAnswer('Has this scene established who the visitor is?', p, [], [], ask,
      event => stages.push(event.stage), undefined, [nearby]);
    expect(answer).toBeNull();
    expect(stages).not.toContain('reviewed_answered');
    expect(JSON.parse(ask.mock.calls[1][1]).answer).toBe(nearby.text);
  });

  it('retains required caption context when giving a visual note first consideration', async () => {
    const caption: ReviewedSceneNote = { ...note, id: 'caption-context', scene_review: undefined,
      coverage: 'complete', valid_until_seconds: undefined, review: { ...note.review, basis: 'caption_prefix' },
      reveal_seconds: 48, summary: 'The speaker says only the caretaker knows.', uses: ['explanation'], topics: [] };
    const contextual = { ...note, context_ids: [caption.id] };
    const ask = vi.fn().mockResolvedValueOnce({ noteIds: ['N1'] })
      .mockResolvedValueOnce({ fit: 'context', receipt: 'this episode has not identified the killer' });
    const answer = await companionAnswer('Who killed Mira?', p, [], [], ask, undefined, undefined, prepare([caption, contextual]));
    expect(ask).toHaveBeenCalledTimes(2);
    const packet = JSON.parse(ask.mock.calls[0][1]);
    expect(packet.notes).toHaveLength(1);
    expect(packet.notes[0].text).toBe(note.summary);
    expect(answer?.answer).toBe(caption.summary + '\n\n' + note.summary);
    // Dropping the caption dependency does not silently promote the visual note.
    expect(prepare([contextual])).toEqual([]);
  });
});

describe('missing visual evidence is not an unresolved story', () => {
  it.each(['Who killed Mira?', 'Why was Mira shot?', 'Mira’s killer?', 'Is Mira dead?'])(
    'does not contradict the viewer or recycle an irrelevant quotation: %s', question => {
      const response = companionResponse(question, p, [], [], { answer: 'OLD_ALLEGATION', evidence: [], limited: true, sourceGap: true });
      expect(response.answer).toContain('00:01:00');
      if (question === 'Is Mira dead?') expect(response.answer).toContain('Mira’s fate');
      expect(response.answer).not.toMatch(/OLD_ALLEGATION|not (?:dead|revealed)|hasn.t been revealed|caretaker|contradict what you saw/);
      expect(response).toMatchObject({ charge: false, answer_status: 'insufficient_evidence', evidence: [] });
      expect(response).not.toHaveProperty('sourceGap');
    });
  it('preserves provider failure messages and confirmed answers', () => {
    const error = { answer: 'The AI service is temporarily unavailable.', evidence: [], limited: true as const };
    expect(companionResponse('Who killed Mira?', p, [], [], error).answer).toBe(error.answer);
    const fact = { answer: 'A verified identity.', evidence: [] };
    expect(companionResponse('Who killed Mira?', p, [], [], fact).answer).toBe(fact.answer);
  });
});

describe('beta explanations from a reviewed timeline', () => {
  const beta = { captionDiscussion: true };
  const after = { ...prepare()[0], end: 80, limited: undefined, validUntil: undefined,
    text: 'A later episode identifies FUTURE_SENTINEL.', id: 'later' };
  const cross = { ...after, end: 50, episode: 2, id: 'different-episode' };
  const ask = (generate: Parameters<typeof companionAnswer>[4]) =>
    companionAnswer('Is Mira dead?', p, [], [historyRow('FUTURE_MEMORY', { position_seconds: 80 })],
      generate, undefined, undefined, [...prepare(), after, cross], beta);
  const draft = (text: string, quote = 'shows Mira dead') => ({ points: [{ text, support: [{ id: 'N1', quote }] }] });

  it('writes a focused answer using only the current reveal and verifies every sentence', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft('Yes, Mira is dead.'))
      .mockResolvedValueOnce({ fit: 'direct', supported: [true] });
    const result = await ask(generate);
    expect(result?.answer).toBe('Yes, Mira is dead.');
    expect(result?.evidence.map(e => e.id)).toEqual(['reviewed:silent-discovery']);
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_SENTINEL|FUTURE_MEMORY|different-episode/);
    expect(generate.mock.calls.map(c => c[3])).toEqual(['writer', 'verifier']);
  });

  it.each([
    ['direct', 'Yes, Mira is dead.'],
    ['reject', undefined],
  ])('uses the shortened answer only if it passes its own review (%s)', async (fit, expected) => {
    const good = draft('Yes, Mira is dead.').points[0];
    const bad = draft('The caretaker poisoned Mira.').points[0];
    const generate = vi.fn().mockResolvedValueOnce({ points: [good, bad] })
      .mockResolvedValueOnce({ fit: 'reject', supported: [true, false] })
      .mockResolvedValueOnce({ fit, supported: [true] });
    expect((await ask(generate))?.answer).toBe(expected);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(JSON.parse(generate.mock.calls[2][1]).points).toEqual([good]);
  });

  it.each([
    [draft('Yes, Mira is dead.', 'Mira was poisoned'), { fit: 'direct', supported: [true] }],
    [draft('The caretaker poisoned Mira.'), { fit: 'direct', supported: [false] }],
    [draft('The caretaker poisoned Mira.'), { fit: 'reject', supported: [true] }],
    [draft('The caretaker poisoned Mira.'), { fit: 'direct', supported: [] }],
  ])('rejects an invented receipt, cause or invalid assessment', async (candidate, review) => {
    const generate = vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(review).mockResolvedValue(null);
    expect(await ask(generate)).toBeNull();
  });
});
