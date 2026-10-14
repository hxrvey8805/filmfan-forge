import type { ViewingPosition } from './companion.ts';

type TitlePosition = Omit<ViewingPosition, 'seconds'>;
type SubtitleSearchResult = {
  attributes?: {
    language?: string; download_count?: number; nb_cd?: number;
    foreign_parts_only?: boolean; machine_translated?: boolean; ai_translated?: boolean;
    files?: { file_id?: number; cd_number?: number }[];
    feature_details?: { feature_type?: string; tmdb_id?: number; parent_tmdb_id?: number;
      season_number?: number; episode_number?: number };
  };
};

export function subtitleSearchParams(position: TitlePosition): URLSearchParams {
  const params = new URLSearchParams({ languages: 'en', type: position.mediaType === 'tv' ? 'episode' : 'movie',
    order_by: 'download_count', order_direction: 'desc' });
  // OpenSubtitles' tmdb_id means the individual feature, not its parent series.
  params.set(position.mediaType === 'tv' ? 'parent_tmdb_id' : 'tmdb_id', String(position.tmdbId));
  if (position.mediaType === 'tv') {
    params.set('season_number', String(position.seasonNumber));
    params.set('episode_number', String(position.episodeNumber));
  }
  params.sort();
  return params;
}

export function selectSubtitleFile(results: unknown, position: TitlePosition): number | null {
  if (!Array.isArray(results)) return null;
  const eligible = (results as SubtitleSearchResult[]).filter(result => {
    const a = result?.attributes;
    const feature = a?.feature_details;
    const file = a?.files?.[0];
    if (!a || !feature || a.language !== 'en' || a.foreign_parts_only || a.machine_translated || a.ai_translated ||
      a.files?.length !== 1 || (a.nb_cd !== undefined && a.nb_cd !== 1) ||
      (file?.cd_number !== undefined && file.cd_number !== 1) || !Number.isInteger(file?.file_id) || file!.file_id! <= 0) return false;
    // Reject split-disc files: their clock can restart in a later part of a film.
    return position.mediaType === 'movie'
      ? feature.feature_type === 'Movie' && feature.tmdb_id === position.tmdbId
      : feature.feature_type === 'Episode' && feature.parent_tmdb_id === position.tmdbId &&
        feature.season_number === position.seasonNumber && feature.episode_number === position.episodeNumber;
  });
  eligible.sort((a, b) => (b.attributes?.download_count ?? 0) - (a.attributes?.download_count ?? 0));
  return eligible[0]?.attributes?.files?.[0]?.file_id ?? null;
}
