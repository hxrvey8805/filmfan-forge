import { describe, expect, it } from 'vitest';
import { alignDialogueSpeakers, type DialogueTrack } from '../scripts/lib/align-dialogue-speakers';
import type { SubtitleRecord, ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 20 };
const track: DialogueTrack = { tmdbId: 1, mediaType: 'tv', season: 1, episode: 2,
  turns: [{ scene: 'bar', speaker: 'MIRA', text: 'Keep the red letter sealed.' },
    { scene: 'bar', speaker: 'SAM', text: 'I never opened the red letter.' }] };
const record = (overrides = {}): SubtitleRecord => ({ id: 'captions', tmdb_id: 1, media_type: 'tv',
  season_number: 1, episode_number: 2, ingestion_version: 3,
  cues: [{ start: 1, end: 3, text: 'Keep the red letter sealed.' }, { start: 4, end: 6, text: 'I never opened the red letter.' }], ...overrides });

describe('offline dialogue alignment experiment', () => {
  it('uses exact dialogue matches to supply neutral, scene-local speakers without script prose or names', () => {
    const matches = alignDialogueSpeakers([record()], position, track);
    expect(matches.map(row => row.label)).toEqual(['SPEAKER A', 'SPEAKER B']);
    expect(matches.map(row => row.text)).toEqual(['Keep the red letter sealed.', 'I never opened the red letter.']);
    expect(JSON.stringify(matches)).not.toMatch(/MIRA|SAM|bar/);
  });
  it('does not use a crossing or future cue to finish an otherwise ambiguous short caption', () => {
    const source = { ...track, turns: [{ scene: 'bar', speaker: 'MIRA', text: 'Yes I will keep the red letter sealed.' }] };
    const rows = [record({ cues: [{ start: 1, end: 2, text: 'Yes' }, { start: 2.1, end: 20.001, text: 'I will keep the red letter sealed.' }] })];
    expect(alignDialogueSpeakers(rows, position, source)).toEqual([]);
    expect(alignDialogueSpeakers(rows, { ...position, seconds: 21 }, source).map(row => row.label)).toEqual(['SPEAKER A', 'SPEAKER A']);
  });
  it('never assigns a single speaker to a caption containing multiple script turns', () => {
    expect(alignDialogueSpeakers([record({ cues: [{ start: 1, end: 6,
      text: 'Keep the red letter sealed. I never opened the red letter.' }] })], position, track)).toEqual([]);
  });
  it('refuses repeated dialogue from different speakers and never guesses by alternation', () => {
    const source = { ...track, turns: [...track.turns, { scene: 'bar', speaker: 'SAM', text: 'Keep the red letter sealed.' }] };
    expect(alignDialogueSpeakers([record()], position, source).map(row => row.start)).toEqual([4]);
  });
  it('does not join dialogue across a silence or overlap', () => {
    const source = { ...track, turns: [{ scene: 'bar', speaker: 'MIRA', text: 'Yes I will keep the red letter sealed.' }] };
    for (const start of [1.5, 5]) {
      const rows = [record({ cues: [{ start: 1, end: 2, text: 'Yes' }, { start, end: 7, text: 'I will keep the red letter sealed.' }] })];
      expect(alignDialogueSpeakers(rows, position, source).map(row => row.start)).not.toContain(1);
    }
  });
  it('rejects a conflict with an explicit caption speaker label', () => {
    expect(alignDialogueSpeakers([record({ cues: [{ start: 1, end: 3, text: '(SAM) Keep the red letter sealed.' }] })], position, track)).toEqual([]);
  });
  it('never links the same script identity across scenes', () => {
    const source = { ...track, turns: [track.turns[0], { ...track.turns[1], scene: 'phone', speaker: 'MIRA' }] };
    expect(alignDialogueSpeakers([record()], position, source).map(row => row.label)).toEqual(['SPEAKER A', 'SPEAKER B']);
  });
  it('requires matching title, media, episode, subtitle version and unambiguous record IDs', () => {
    for (const source of [{ ...track, tmdbId: 2 }, { ...track, episode: 1 }, { ...track, mediaType: 'movie' as const }]) {
      expect(alignDialogueSpeakers([record()], position, source)).toEqual([]);
    }
    for (const rows of [[record({ tmdb_id: 2 })], [record({ episode_number: 1 })], [record({ ingestion_version: 2 })], [record(), record()]]) {
      expect(alignDialogueSpeakers(rows, position, track)).toEqual([]);
    }
  });
  it('does not replace mismatched words, omitted negations or short generic utterances', () => {
    const rows = [record({ cues: [{ start: 1, end: 3, text: 'Keep the blue letter sealed.' },
      { start: 4, end: 6, text: 'I opened the red letter.' }, { start: 7, end: 8, text: 'Yes.' }] })];
    expect(alignDialogueSpeakers(rows, position, track)).toEqual([]);
  });
  it('exports neither hidden script identities nor extra cue metadata or future script dialogue', () => {
    const source = { ...track, turns: [{ scene: 'SECRET_LOCATION', speaker: 'SECRET_IDENTITY', text: 'Keep the red letter sealed.' },
      { scene: 'finale', speaker: 'SECRET_IDENTITY', text: 'FUTURE_SCRIPT_REVEAL' }] };
    const rows = [record({ cues: [{ start: 1, end: 3, text: 'Keep the red letter sealed.', futureSummary: 'FUTURE_METADATA' },
      { start: 21, end: 23, text: 'FUTURE_SCRIPT_REVEAL' }] })];
    const matches = alignDialogueSpeakers(rows, position, source);
    expect(matches).toHaveLength(1);
    expect(JSON.stringify(matches)).not.toMatch(/SECRET_|FUTURE_/);
  });
  it('normalizes typographic apostrophes without conflating contractions with different words', () => {
    const source = { ...track, turns: [{ scene: 'bar', speaker: 'MIRA', text: "We're keeping the red letter sealed." }] };
    const matching = record({ cues: [{ start: 1, end: 3, text: 'We’re keeping the red letter sealed.' }] });
    expect(alignDialogueSpeakers([matching], position, source)).toHaveLength(1);
    const different = record({ cues: [{ start: 1, end: 3, text: 'Were keeping the red letter sealed.' }] });
    expect(alignDialogueSpeakers([different], position, source)).toEqual([]);
  });
});
