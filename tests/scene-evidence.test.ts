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
  created_at: '2026-10-14T00:00:00Z', answer_status: 'answered', ...overrides });

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
    expect(subtitleSearchText('What is happening right now?', [], position)).toBe('');
    expect(subtitleSearchText('What is happening at this moment, based on the dialogue?', [], position)).toBe('');
  });
  it('retains the first two passages even when larger exchanges compete for recap space', () => {
    const cues = [{ start: 1, end: 4, text: 'EARLIEST_AVAILABLE' },
      { start: 30, end: 34, text: 'EARLY_CONTEXT: This message is for my family.' },
      ...Array.from({ length: 38 }, (_, i) => ({ start: 60 + i * 30, end: 64 + i * 30,
        text: `Later exchange ${i}. We need to change our plans and discuss a different route.` }))];
    const result = selectSceneEvidence([record({ cues })], { ...position, seconds: 1250 }, 'Recap so far', [], 2500);
    expect(result[0].text).toBe('EARLIEST_AVAILABLE');
    expect(result[1].text).toContain('EARLY_CONTEXT');
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(2500);
  });
  it('keeps the entire permitted prefix when it fits, even beyond 14 passages', () => {
    const cues = Array.from({ length: 35 }, (_, i) => ({ start: i * 20, end: i * 20 + 3, text: `Event_${i}.` }));
    const result = selectSceneEvidence([record({ cues })], { ...position, seconds: 700 }, 'Recap so far');
    for (const cue of cues) expect(result.some(item => item.text.includes(cue.text))).toBe(true);
  });
  it('joins adjacent exchanges across storage chunks without importing their future continuation', () => {
    const rows = [record({ id: 'a', cues: [{ start: 80, end: 84, text: 'The first thing I will do when...' }] }),
      record({ id: 'b', cues: [{ start: 85, end: 89, text: '...I take over is thank her.' },
        { start: 99, end: 100.001, text: 'FUTURE_IDENTITY' }] })];
    const result = selectSceneEvidence(rows, position, 'What do we know about the leader so far?');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('The first thing I will do when...\n...I take over is thank her.');
    expect(result[0].end).toBe(89);
    // Same timeline in a different episode must not become the same exchange.
    expect(selectSceneEvidence([...rows, record({ id: 'old', episode_number: 1 })], position, 'Explain')).toHaveLength(2);
  });
  it('removes explicit uploader credits while retaining dialogue and sound labels', () => {
    const cues = [{ start: 1, end: 6, text: 'Subs collected, corrected and adapted by UPLOADER for TV seasons' },
      { start: 7, end: 9, text: '(SAM) Did you turn the subtitles on? [door opens]' },
      { start: 10, end: 12, text: 'The translation was wrong.' }];
    const result = selectSceneEvidence([record({ cues })], position, 'What is happening at this moment?');
    const text = result.map(item => item.text).join('\n');
    expect(text).not.toContain('UPLOADER');
    expect(text).toContain('(SAM) Did you turn the subtitles on? [door opens]');
    expect(text).toContain('The translation was wrong.');
  });
  it('fills recap space with substantive exchanges across time and reserves the current end', () => {
    const cues = Array.from({ length: 60 }, (_, i) => ({ start: i * 30, end: i * 30 + 4,
      text: i % 3 === 0 ? `EXCHANGE_${i}: We have to change our plans because the bridge is closed. Take the ferry instead.` : 'Okay.' }));
    const result = selectSceneEvidence([record({ cues })], { ...position, seconds: 1800 }, 'What happened so far?', [], 2500);
    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThanOrEqual(2500);
    expect(serialized.length).toBeGreaterThan(2200);
    for (const [start, end] of [[0, 450], [450, 900], [900, 1350], [1350, 1800]]) {
      expect(result.some(item => item.start >= start && item.start < end && item.text.includes('EXCHANGE_'))).toBe(true);
    }
    expect(result.at(-1)?.end).toBe(1774);
  });
  it('prioritizes the recent exchange over a distant passage for a scene question', () => {
    const rows = [record({ id: 'old', cues: [{ start: 1, end: 5, text: 'The key opens the vault.' }] }),
      record({ id: 'current', cues: [{ start: 90, end: 95, text: '(SAM) We have to get out now.' }] })];
    const result = selectSceneEvidence(rows, position, 'What is happening right now with the key?', [], 180);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('get out now');
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
    expect(prompts.data.nearbyEvidenceIds).toEqual(['P1']);
  });
});
