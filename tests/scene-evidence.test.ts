import { describe, expect, it } from 'vitest';
import { buildPrompts, chunkCues, promptConversation, type Conversation, type SubtitleRecord, type ViewingPosition } from '../supabase/functions/_shared/companion';
import { selectSceneEvidence, subtitleSearchText } from '../supabase/functions/_shared/scene-evidence';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 100 };
const record = (overrides: Partial<SubtitleRecord> = {}): SubtitleRecord => ({ id: 'one', tmdb_id: 1,
  media_type: 'tv', season_number: 1, episode_number: 2, ingestion_version: 2,
  cues: [{ start: 90, end: 99, text: '(SAM) The key is in the drawer. [door opens]' }], ...overrides });
const message = (overrides: Partial<Conversation> = {}): Conversation => ({ id: 'safe', title_id: 1,
  media_type: 'tv', season_number: 1, episode_number: 2, position_seconds: 90, companion_version: 2,
  question: 'Why did Sam hide the key?', answer: 'The key is hidden.', context: '', timestamp: '00:01:30',
  created_at: '2026-10-14T00:00:00Z', ...overrides });

describe('timestamped scene retrieval', () => {
  it('filters crossing cues, later episodes, other titles and legacy caches before ranking', () => {
    const rows = [record({ cues: [{ start: 90, end: 100, text: 'SAFE key' }, { start: 99, end: 100.001, text: 'FUTURE key' }] }),
      record({ id: 'later', episode_number: 3 }), record({ id: 'title', tmdb_id: 2 }), record({ id: 'legacy', ingestion_version: 1 })];
    const result = selectSceneEvidence(rows, position, 'Where is the key?');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 90, end: 100, text: 'SAFE key' });
  });
  it('has no future dialogue at every rewind point and preserves sound/speaker labels', () => {
    const cues = Array.from({ length: 80 }, (_, i) => ({ start: i * 4, end: i * 4 + 3.5, text: `(SAM) [noise] CUE_${i}_END` }));
    for (let seconds = 0; seconds <= 320; seconds++) {
      const selected = selectSceneEvidence([record({ cues })], { ...position, seconds }, 'What is happening right now?');
      for (const item of selected) {
        expect(item.end).toBeLessThanOrEqual(seconds);
        expect(item.text).toContain('(SAM) [noise]');
        for (const [i, cue] of cues.entries()) if (cue.end > seconds) expect(item.text).not.toContain(`CUE_${i}_END`);
      }
    }
  });
  it('keeps only past episode context when switching backwards', () => {
    const earlier = record({ id: 'earlier', episode_number: 1, cues: [{ start: 300, end: 303, text: 'PAST key' }] });
    expect(selectSceneEvidence([earlier, record()], position, 'Explain the key').map(row => row.episode)).toEqual([1, 2]);
    expect(selectSceneEvidence([earlier, record()], { ...position, episodeNumber: 1 }, 'Explain the key')).toEqual([]);
  });
  it('does not present old dialogue as a current silent scene', () => {
    expect(selectSceneEvidence([record()], { ...position, seconds: 400 }, 'What is happening right now?')).toEqual([]);
  });
  it('retrieves a relevant earlier passage beyond the old recent-chunk window', () => {
    const cues = Array.from({ length: 100 }, (_, i) => ({ start: i * 20, end: i * 20 + 5,
      text: i === 33 ? 'SAM: The emerald key opens the vault.' : `Dialogue ${i} about the weather.` }));
    const rows = chunkCues(cues).map((part, i) => record({ id: String(i), cues: part }));
    const result = selectSceneEvidence(rows, { ...position, seconds: 2000 }, 'What does the emerald key open?', [], 1800);
    expect(result.map(row => row.text).join('\n')).toContain('emerald key opens the vault');
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1800);
  });
  it('samples recaps across the watched prefix, within the serialized budget', () => {
    const cues = Array.from({ length: 70 }, (_, i) => ({ start: i * 20, end: i * 20 + 4, text: `Event ${i}.` }));
    const result = selectSceneEvidence([record({ cues })], { ...position, seconds: 1400 }, 'what has happned up until this point');
    expect(result[0].start).toBe(0);
    expect(result.at(-1)?.end).toBe(1384);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(8500);
    expect(new Set(result.map(row => row.id)).size).toBe(result.length);
  });
  it('uses meaningful OR terms and only safe user references for follow-ups', () => {
    const history = [message(), message({ id: 'future', position_seconds: 101, question: 'FUTURESECRET' }),
      message({ id: 'episode', episode_number: 3, question: 'NEXTSECRET' })];
    expect(subtitleSearchText('Why is he hiding it?', history, position)).toContain('"sam" OR "hide" OR "key"');
    expect(subtitleSearchText('Why is he hiding it?', history, position)).not.toMatch(/futuresecret|nextsecret/);
    expect(subtitleSearchText('What is happening right now?', [], position)).toBe('"right"');
  });
  it('bounds conversation size and excludes future turns from the actual model prompt', () => {
    const history = Array.from({ length: 6 }, (_, i) => message({ id: String(i), answer: 'A'.repeat(9000),
      created_at: `2026-10-14T00:00:0${i}Z` }));
    history.push(message({ position_seconds: 101, answer: 'FUTURESECRET' }));
    const memory = promptConversation(history, position);
    expect(JSON.stringify(memory).length).toBeLessThanOrEqual(2800);
    expect(memory.length).toBeGreaterThan(0);
    const prompts = buildPrompts('Why?', position, selectSceneEvidence([record()], position, 'Why?'), history);
    expect(prompts.user).not.toContain('FUTURESECRET');
    expect(JSON.parse(prompts.user).nearbyEvidenceIds).toEqual(['one:90000']);
  });
});
