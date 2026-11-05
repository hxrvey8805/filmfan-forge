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
    const ask = vi.fn().mockResolvedValue({ noteIds: ['N1'] });
    const answer = await companionAnswer('Who killed Mira?', p,
      [{ id: 'earlier', season: 1, episode: 1, start: 10, end: 12, text: '[00:00:10] Mira tried to kill me.' }],
      [], ask, undefined, undefined, prepare());
    expect(ask).toHaveBeenCalledOnce();
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

  it('retains required caption context when giving a visual note first consideration', async () => {
    const caption: ReviewedSceneNote = { ...note, id: 'caption-context', scene_review: undefined,
      coverage: 'complete', valid_until_seconds: undefined, review: { ...note.review, basis: 'caption_prefix' },
      reveal_seconds: 48, summary: 'The speaker says only the caretaker knows.', uses: ['explanation'], topics: [] };
    const contextual = { ...note, context_ids: [caption.id] };
    const ask = vi.fn().mockResolvedValue({ noteIds: ['N1'] });
    const answer = await companionAnswer('Who killed Mira?', p, [], [], ask, undefined, undefined, prepare([caption, contextual]));
    expect(ask).toHaveBeenCalledOnce();
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
      expect(response.answer).toContain('missing the scene context');
      expect(response.answer).not.toMatch(/OLD_ALLEGATION|not (?:dead|revealed)|hasn.t been revealed|caretaker/);
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
