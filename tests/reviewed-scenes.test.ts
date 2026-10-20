import { describe, expect, it, vi } from 'vitest';
import { permittedSceneNotes, reviewedSceneAnswer, type ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';
import { COMPANION_VERSION, promptConversation, type Conversation, type SubtitleRecord } from '../supabase/functions/_shared/companion';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import { companionResponse } from '../supabase/functions/_shared/companion-response';

const position = { tmdbId: 10, mediaType: 'tv' as const, seasonNumber: 1, episodeNumber: 2, seconds: 30 };
const records: (SubtitleRecord & { source_file_id: number })[] = [{ id: 'chunk', tmdb_id: 10, media_type: 'tv', season_number: 1,
  episode_number: 2, ingestion_version: 3, source_file_id: 100,
  cues: [{ start: 10, end: 12, text: 'I plan to leave.' }, { start: 13, end: 14, text: 'Not yet.' }] }];
const note: ReviewedSceneNote = { id: 'plan', tmdb_id: 10, media_type: 'tv', season_number: 1, episode_number: 2,
  source_file_id: 100, start_seconds: 10, reveal_seconds: 14, summary: 'A departure is proposed but postponed.',
  uses: ['scene', 'recap', 'explanation'], topics: ['departure'], anchors: records[0].cues as ReviewedSceneNote['anchors'],
  review: { status: 'reviewed', basis: 'caption_prefix', reference: 'Editorial review of caption span', reviewed_at: '2026-10-19T12:00:00Z' } };
const prepare = (notes = [note], rows = records, pos = position) => permittedSceneNotes(notes, rows, pos);

describe('reviewed scene source boundaries', () => {
  it('requires the complete reviewed span, including a contradiction', () => {
    expect(prepare()).toHaveLength(1);
    expect(prepare([{ ...note, anchors: note.anchors.slice(0, 1), reveal_seconds: 12 }])).toHaveLength(1);
    // A note claiming to include both lines cannot cherry-pick the denial out.
    expect(prepare([{ ...note, reveal_seconds: 16, anchors: [note.anchors[0], { start: 15, end: 16, text: 'Okay.' }] }],
      [{ ...records[0], cues: [...note.anchors, { start: 15, end: 16, text: 'Okay.' }] }])).toEqual([]);
    expect(prepare([{ ...note, anchors: [note.anchors[0]] }])).toEqual([]);
    expect(prepare([note], [{ ...records[0], cues: [note.anchors[0]] }])).toEqual([]);
  });
  it('does not expose a note before all its anchors and reveal point', () => {
    expect(prepare([note], records, { ...position, seconds: 13.999 })).toEqual([]);
    expect(prepare([note], records, { ...position, seconds: 14 })).toHaveLength(1);
    expect(prepare([{ ...note, reveal_seconds: 13 }])).toEqual([]);
    expect(prepare([{ ...note, reveal_seconds: 31 }])).toEqual([]);
  });
  it.each([
    { tmdb_id: 11 }, { media_type: 'movie', season_number: null, episode_number: null },
    { season_number: 2 }, { episode_number: 1 }, { episode_number: 3 }, { source_file_id: 101 },
  ])('rejects other title, episode, season or subtitle edition: %j', change => {
    expect(prepare([{ ...note, ...change } as ReviewedSceneNote])).toEqual([]);
  });
  it('rejects shifted, edited or overlapping conflicting captions', () => {
    for (const cues of [note.anchors.map(c => ({ ...c, start: c.start + 1, end: c.end + 1 })),
      [note.anchors[0], { ...note.anchors[1], text: 'Yes, now.' }],
      [...note.anchors, { start: 11, end: 12, text: 'A different edition.' }]]) {
      expect(prepare([note], [{ ...records[0], cues }])).toEqual([]);
    }
  });
  it('rejects unreviewed notes, stage-direction sources and duplicate IDs', () => {
    expect(prepare([{ ...note, review: { ...note.review, status: 'draft' } } as unknown as ReviewedSceneNote])).toEqual([]);
    expect(prepare([{ ...note, review: { ...note.review, basis: 'screenplay' } } as unknown as ReviewedSceneNote])).toEqual([]);
    expect(prepare([note, { ...note, summary: 'Contradiction' }])).toEqual([]);
    expect(prepare([null, {}, { ...note, review: { ...note.review, reference: 123 } }] as unknown as ReviewedSceneNote[])).toEqual([]);
  });
  it('projects only approved fields and accepts duplicate retrieval of the same captions', () => {
    const safe = prepare([{ ...note, hidden: 'FUTURE' } as ReviewedSceneNote], [...records, ...records]);
    expect(safe).toHaveLength(1);
    expect(JSON.stringify(safe)).not.toMatch(/FUTURE|reference|anchors|reviewed_at/);
    expect(prepare([note], [{ ...records[0], ingestion_version: 2 }])).toEqual([]);
  });
  it('refuses missing, later, cross-episode and cyclic context dependencies', () => {
    const contextual = { ...note, id: 'event', context_ids: ['plan'] };
    expect(prepare([contextual])).toEqual([]);
    expect(prepare([contextual, { ...note, reveal_seconds: 20 }])).toHaveLength(1);
    expect(prepare([contextual, { ...note, episode_number: 1 }])).toEqual([]);
    expect(prepare([contextual, { ...note, context_ids: ['event'] }])).toEqual([]);
    expect(prepare([contextual, note])).toHaveLength(2);
  });
});

describe('limited reviewed context', () => {
  const limited: ReviewedSceneNote = { ...note, coverage: 'limited', valid_until_seconds: 30,
    summary: 'Morgan proposes a departure. These captions do not establish Morgan’s relationship with Lee.' };

  it('requires an explicit review boundary and rejects invalid coverage', () => {
    expect(prepare([limited])).toHaveLength(1);
    for (const change of [{ valid_until_seconds: undefined }, { valid_until_seconds: 13 },
      { valid_until_seconds: NaN }, { valid_until_seconds: Infinity }, { coverage: 'anything' }]) {
      expect(prepare([{ ...limited, ...change } as ReviewedSceneNote])).toEqual([]);
    }
  });

  it('expires a limitation when viewing moves beyond the reviewed context', () => {
    expect(prepare([limited], records, { ...position, seconds: 30.001 })).toEqual([]);
    expect(prepare([limited], records, { ...position, seconds: 13.999 })).toEqual([]);
    expect(prepare([limited], records, { ...position, seconds: 14 })).toHaveLength(1);
  });

  it('rechecks both ends of the boundary and episode scope on prepared context', async () => {
    const generate = vi.fn();
    for (const pos of [{ ...position, seconds: 30.001 }, { ...position, seconds: 13.999 },
      { ...position, episodeNumber: 1 }, { ...position, tmdbId: 11 }]) {
      expect(await reviewedSceneAnswer('What is Morgan’s relationship with Lee?', pos,
        prepare([limited]), [], generate)).toBeNull();
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it('displays supported facts and their qualification without charging or trusting them as complete memory', async () => {
    const question = 'What is Morgan’s relationship with Lee?';
    const generate = vi.fn().mockResolvedValue({ noteIds: ['N1'] });
    const observe = vi.fn();
    const result = await checkedAnswer(question, position, [], [], generate, observe, undefined, prepare([limited]));
    expect(generate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ answer: limited.summary, limited: true });
    expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'reviewed_limited' }));
    const response = companionResponse(question, position, [], [], result);
    expect(response).toMatchObject({ answer: limited.summary, answer_status: 'insufficient_evidence', charge: false });
    expect(response).not.toHaveProperty('limited');
    const history: Conversation[] = [{ id: 'partial', title_id: 10, media_type: 'tv', season_number: 1, episode_number: 2,
      position_seconds: 30, companion_version: COMPANION_VERSION, question, answer: response.answer,
      context: '', timestamp: '00:00:30', created_at: '2026-10-20T12:00:00Z', answer_status: response.answer_status }];
    expect(promptConversation(history, position)).toEqual([]);
    generate.mockClear();
    expect(await checkedAnswer('Explain your last answer.', position, [], history, generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('propagates a required context limitation even if the selected note is otherwise complete', async () => {
    const notes = prepare([limited, { ...note, id: 'event', reveal_seconds: 20, context_ids: ['plan'], summary: 'A noise follows.' }]);
    const result = await reviewedSceneAnswer('What is happening?', position, notes, [], async () => ({ noteIds: ['N2'] }));
    expect(result).toMatchObject({ limited: true, answer: `${limited.summary}\n\nA noise follows.` });
    expect(prepare([limited, { ...note, id: 'event', context_ids: ['plan'] }], records,
      { ...position, seconds: 31 })).toEqual([]);
  });
});

describe('selection without generated plot prose', () => {
  it('renders only complete reviewed wording even if IDs are returned out of order', async () => {
    const notes = prepare([note, { ...note, id: 'later', reveal_seconds: 20, summary: 'The plan is still only a plan.' }]);
    const generate = vi.fn().mockResolvedValue({ noteIds: ['N2', 'N1'] });
    const answer = await reviewedSceneAnswer('What has happened so far?', position, notes, [], generate);
    expect(answer?.answer).toBe(`${note.summary}\n\nThe plan is still only a plan.`);
    expect(answer?.evidence[0].id).toBe('reviewed:plan');
    expect(generate).toHaveBeenCalledOnce();
  });
  it.each([{ noteIds: ['N1'], text: 'He leaves.' }, { noteIds: ['N2'] }, { noteIds: ['N1', 'N1'] },
    { noteIds: [] }, { noteIds: ['plan'] }, { noteIds: 'N1' }, null])('rejects malformed selections or invented prose: %j', async value => {
    expect(await reviewedSceneAnswer('What is happening here?', position, prepare(), [], async () => value)).toBeNull();
  });
  it('does not let a recap omit reviewed milestones', async () => {
    const notes = prepare([note, { ...note, id: 'other' }]);
    expect(await reviewedSceneAnswer('Recap so far', position, notes, [], async () => ({ noteIds: ['N1'] }))).toBeNull();
  });
  it('refuses stale scene context and irrelevant named relationships', async () => {
    expect(await reviewedSceneAnswer('What is happening at this moment?', { ...position, seconds: 60 }, prepare(), [],
      async () => ({ noteIds: ['N1'] }))).toBeNull();
    expect(await reviewedSceneAnswer('What is Morgan’s relationship with Lee?', position, prepare(), [],
      async () => ({ noteIds: ['N1'] }))).toBeNull();
  });
  it('rechecks scope if prepared notes are accidentally reused after a rewind or switch', async () => {
    const generate = vi.fn();
    for (const pos of [{ ...position, seconds: 13 }, { ...position, episodeNumber: 1 }, { ...position, tmdbId: 11 }]) {
      expect(await reviewedSceneAnswer('What happened?', pos, prepare(), [], generate)).toBeNull();
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it('includes required earlier context and labels it separately from the current moment', async () => {
    const notes = prepare([note, { ...note, id: 'event', reveal_seconds: 40, context_ids: ['plan'], summary: 'The captions mark a noise.' }],
      records, { ...position, seconds: 45 });
    const answer = await reviewedSceneAnswer('What is happening at this moment?', { ...position, seconds: 45 }, notes, [],
      async () => ({ noteIds: ['N2'] }));
    expect(answer?.answer).toBe(`Earlier (00:00:10–00:00:14): ${note.summary}\n\nThe captions mark a noise.`);
    expect(answer?.evidence).toHaveLength(2);
  });
  it('does not send future or other-episode history to note selection', async () => {
    const history: Conversation[] = [{ id: 'future', title_id: 10, media_type: 'tv', season_number: 1, episode_number: 2,
      position_seconds: 50, companion_version: COMPANION_VERSION, question: 'Later?', answer: 'FUTURE_MEMORY_SENTINEL',
      context: '', timestamp: '00:00:50', created_at: '2026-10-19T12:00:00Z', answer_status: 'answered' }];
    const generate = vi.fn().mockResolvedValue({ noteIds: ['N1'] });
    await reviewedSceneAnswer('What is happening?', position, prepare(), history, generate);
    expect(JSON.stringify(generate.mock.calls)).not.toContain('FUTURE_MEMORY_SENTINEL');
    generate.mockClear();
    await reviewedSceneAnswer('Why that plan?', position, prepare(), [...history,
      { ...history[0], id: 'other', episode_number: 1, position_seconds: 12, answer: 'OTHER_EPISODE' },
      { ...history[0], id: 'safe', position_seconds: 14, answer: 'SAFE_EARLIER_PLAN' }], generate);
    expect(JSON.stringify(generate.mock.calls)).toContain('SAFE_EARLIER_PLAN');
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_MEMORY_SENTINEL|OTHER_EPISODE/);
    generate.mockClear();
    const result = await checkedAnswer('Remind me where they decided to park the RV in your last answer.', position, [], history,
      generate, undefined, undefined, prepare());
    expect(result).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it('retains a complete longer recap for follow-ups without enlarging the memory budget', async () => {
    const answer = 'A reviewed event is described. '.repeat(40) + 'The outcome is not established.';
    const history: Conversation[] = [{ id: 'recap', title_id: 10, media_type: 'tv', season_number: 1, episode_number: 2,
      position_seconds: 20, companion_version: COMPANION_VERSION, question: 'Recap so far', answer,
      context: '', timestamp: '00:00:20', created_at: '2026-10-19T12:00:00Z', answer_status: 'answered' }];
    const generate = vi.fn().mockResolvedValue({ noteIds: ['N1'] });
    expect(await reviewedSceneAnswer('Explain the plan in your last answer.', position, prepare(), history, generate)).not.toBeNull();
    const data = JSON.parse(generate.mock.calls[0][1]);
    expect(data.conversation[0].answer).toBe(answer);
    const crowded = promptConversation([...history, { ...history[0], id: 'other' }, { ...history[0], id: 'third' }], position);
    expect(JSON.stringify(crowded).length).toBeLessThanOrEqual(2800);
    expect(crowded.every(turn => turn.answer === answer)).toBe(true);
    expect(promptConversation(history, { ...position, seconds: 19 })).toEqual([]);
    expect(promptConversation(history, { ...position, episodeNumber: 1 })).toEqual([]);
  });
});
