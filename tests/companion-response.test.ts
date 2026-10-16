import { describe, expect, it } from 'vitest';
import { companionResponse, limitedSceneContext } from '../supabase/functions/_shared/companion-response';
import { conversationMemory, safeHistory, type Conversation, type Evidence, type ViewingPosition } from '../supabase/functions/_shared/companion';
import { selectSceneContext } from '../supabase/functions/_shared/scene-evidence';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 300 };
const question = 'What is happening at this moment, based on the dialogue?';
const recent: Evidence = { id: 'recent', season: 1, episode: 2, start: 281, end: 299,
  text: '[00:04:41] [ENGINE REVS]\n[00:04:44] (BOTH) Yes!\n[00:04:57] [MAN GROANS]' };
const conversation = (overrides = {}): Conversation => ({ id: 'a', title_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  position_seconds: 300, companion_version: 3, question, answer: 'FUTURE_MEMORY_SENTINEL', context: '', timestamp: '00:05:00',
  created_at: '2026-10-16T10:00:00Z', answer_status: 'answered', ...overrides });

describe('limited caption responses after an unverified explanation', () => {
  it('shows complete recent captions without inventing successful actions, identities or causes', () => {
    const result = companionResponse(question, position, [recent], [], null);
    expect(result.answer).toContain(recent.text);
    expect(result.answer).toContain('couldn’t verify a full explanation');
    expect(result.answer).not.toMatch(/start(?:s|ed)? successfully|celebrat|injur|Jesse|Walt/);
    expect(result).toMatchObject({ answer_status: 'insufficient_evidence', charge: false });
    expect(result.evidence.map(item => item.id)).toEqual(['recent']);
  });
  it('does not put an uncharged excerpt response into trusted memory', () => {
    const response = companionResponse(question, position, [recent], [], null);
    const row = conversation({ answer: response.answer, answer_status: response.answer_status });
    expect(safeHistory([row], position)).toEqual([row]); // Visible at the permitted point.
    expect(conversationMemory([row], position)).toEqual([]); // Not story evidence on follow-up.
    expect(safeHistory([row], { ...position, seconds: 298 })).toEqual([]);
    expect(safeHistory([row], { ...position, episodeNumber: 1 })).toEqual([]);
  });
  it('gives unavailable memory priority even if a caller supplied scene evidence and a model result', () => {
    const response = companionResponse('What is happening at this moment after your last answer?', { ...position, seconds: 295 },
      [recent], [conversation()], { answer: 'UNSAFE_DRAFT', evidence: [] });
    expect(response.answer).toContain('previous answer');
    expect(response.answer).not.toMatch(/UNSAFE_DRAFT|FUTURE_MEMORY_SENTINEL|ENGINE|GROANS/);
    expect(response).toMatchObject({ answer_status: 'insufficient_evidence', charge: false, evidence: [] });
  });
  it('never describes older episodes or earlier dialogue as current evidence', () => {
    const older: Evidence[] = [{ ...recent, id: 'prior', episode: 1, start: 281, end: 299, text: 'OTHER_EPISODE' },
      { ...recent, id: 'earlier', start: 240, end: 269, text: 'EARLIER_PLAN' }];
    const response = companionResponse(question, position, [...older, recent], [], null);
    expect(response.answer).toContain(recent.text);
    expect(response.answer).not.toMatch(/OTHER_EPISODE|EARLIER_PLAN/);
    expect(limitedSceneContext(question, position, older)).toBeNull();
  });
  it('rejects crossing, later-episode and duplicate evidence at the response boundary', () => {
    const invalid = [{ ...recent, end: 300.001, text: 'CROSSING' }, { ...recent, id: 'next', episode: 3, text: 'NEXT' },
      { ...recent, id: 'dup', text: 'AMBIGUOUS_A' }, { ...recent, id: 'dup', text: 'AMBIGUOUS_B' }];
    expect(limitedSceneContext(question, position, invalid)).toBeNull();
    expect(companionResponse(question, position, invalid, [], null).answer).not.toMatch(/CROSSING|NEXT|AMBIGUOUS/);
  });
  it('handles movie evidence without accidentally including TV packets', () => {
    const movie: ViewingPosition = { tmdbId: 1, mediaType: 'movie', seconds: 300 };
    const response = limitedSceneContext(question, movie, [recent, { ...recent, id: 'film', season: null, episode: null }]);
    expect(response?.evidence.map(item => item.id)).toEqual(['film']);
  });
  it('never turns a scene excerpt into an answer to a recap or relationship question', () => {
    for (const text of ['Recap the story so far.', 'What do we know about their relationship?']) {
      expect(limitedSceneContext(text, position, [recent])).toBeNull();
    }
  });
  it('does not truncate long or dense packets, including their final denials', () => {
    for (const text of ['A'.repeat(1601), Array.from({ length: 17 }, () => '[00:04:55] No, that is not true.').join('\n')]) {
      expect(limitedSceneContext(question, position, [{ ...recent, text }])).toBeNull();
    }
  });
  it('keeps packet order and preserves denials verbatim', () => {
    const first = { ...recent, id: 'claim', start: 271, end: 280, text: '[00:04:31] You broke it.' };
    const last = { ...recent, text: '[00:04:41] No, I did not.' };
    const response = limitedSceneContext(question, position, [last, first]);
    expect(response?.answer).toContain(`${first.text}\n${last.text}`);
    expect(response?.evidence.map(item => item.id)).toEqual(['claim', 'recent']);
  });
  it('keeps the same cue-end cutoff after retrieval and a rewind', () => {
    const records = [{ id: 'track', tmdb_id: 1, media_type: 'tv', season_number: 1, episode_number: 2, ingestion_version: 3,
      cues: [{ start: 280, end: 285, text: '[ENGINE REVS]' }, { start: 294, end: 300, text: 'FUTURE_CUE' }] }];
    const rewound = { ...position, seconds: 295 };
    const { evidence } = selectSceneContext(records, rewound, question);
    const response = companionResponse(question, rewound, evidence, [], null);
    expect(response.answer).toContain('[ENGINE REVS]');
    expect(JSON.stringify(response)).not.toContain('FUTURE_CUE');
    expect(companionResponse(question, { ...position, episodeNumber: 1 }, evidence, [], null).evidence).toEqual([]);
  });
  it('preserves a successfully checked explanation and its charging status', () => {
    const checked = { answer: 'A speaker asks to leave the letter sealed.', evidence: [] };
    expect(companionResponse('Why?', position, [recent], [], checked)).toEqual({ ...checked, answer_status: 'answered', charge: true });
  });
});
