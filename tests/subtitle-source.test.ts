import { describe, expect, it } from 'vitest';
import { selectSubtitleFile, subtitleSearchParams } from '../supabase/functions/_shared/subtitle-source';

const tv = { tmdbId: 1396, mediaType: 'tv' as const, seasonNumber: 1, episodeNumber: 2 };
const movie = { tmdbId: 603, mediaType: 'movie' as const };
const episode = { feature_type: 'Episode', parent_tmdb_id: 1396, tmdb_id: 62086, season_number: 1, episode_number: 2 };
const result = (feature = episode, overrides = {}) => ({ attributes: { language: 'en', download_count: 100,
  nb_cd: 1, feature_details: feature, files: [{ file_id: 10, cd_number: 1 }], ...overrides } });

describe('subtitle provider identity and timing source', () => {
  it('uses the series identifier for TV searches and feature identifier for movies', () => {
    const params = subtitleSearchParams(tv);
    expect(params.get('parent_tmdb_id')).toBe('1396');
    expect(params.has('tmdb_id')).toBe(false);
    expect(params.get('episode_number')).toBe('2');
    expect(subtitleSearchParams(movie).get('tmdb_id')).toBe('603');
  });
  it('rejects mismatched episodes, seasons and series regardless of popularity', () => {
    const wrong = [result({ ...episode, episode_number: 3 }), result({ ...episode, season_number: 2 }),
      result({ ...episode, parent_tmdb_id: 9 })];
    expect(selectSubtitleFile(wrong, tv)).toBeNull();
    expect(selectSubtitleFile([...wrong, result(episode, { download_count: 1 })], tv)).toBe(10);
  });
  it('rejects missing identity and split-disc subtitles whose timestamps can restart', () => {
    for (const overrides of [{ feature_details: undefined }, { nb_cd: 2 }, { files: [{ file_id: 10, cd_number: 2 }] },
      { files: [{ file_id: 10 }, { file_id: 11 }] }, { foreign_parts_only: true }, { language: 'fr' }]) {
      expect(selectSubtitleFile([result(episode, overrides)], tv)).toBeNull();
    }
  });
  it('uses only matching movies, and the most downloaded eligible source', () => {
    const feature = { feature_type: 'Movie', tmdb_id: 603 };
    const rows = [result(episode, { feature_details: feature }),
      result(episode, { feature_details: feature, download_count: 200, files: [{ file_id: 20 }] })];
    expect(selectSubtitleFile(rows, movie)).toBe(20);
    expect(selectSubtitleFile(rows, { ...movie, tmdbId: 604 })).toBeNull();
  });
});
