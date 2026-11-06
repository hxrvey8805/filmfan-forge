import { usableSubtitleEdition, type ViewingPosition } from './companion.ts';

type TitlePosition = Omit<ViewingPosition, 'seconds'>;
type SubtitleSearchResult = {
  attributes?: {
    language?: string; download_count?: number; nb_cd?: number;
    foreign_parts_only?: boolean; machine_translated?: boolean; ai_translated?: boolean; hearing_impaired?: boolean;
    release?: string; files?: { file_id?: number; cd_number?: number; file_name?: string }[];
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

// Some combined broadcasts are indexed as a single episode by the provider.
const episodePack = /\bs\d{1,2}e\d{2}(?:[ ._-]*e\d{2}|[ ._-]*-?[ ._-]*s\d{1,2}e\d{2}|\d{2}\b)/i;
const alternateCut = /\b(?:extended(?:[ ._-]+(?:cut|edition|version))?|director['’]?s?[ ._-]+cut|unrated|alternate[ ._-]+(?:cut|ending)|redux)\b/i;
export function mentionsAlternateCut(results: unknown, p: TitlePosition): boolean {
  if (!Array.isArray(results)) return false;
  return (results as SubtitleSearchResult[]).some(({attributes:a}) => {
    const f = a?.feature_details;
    const match = p.mediaType === 'movie' ? f?.feature_type==='Movie' && f.tmdb_id===p.tmdbId :
      f?.feature_type==='Episode' && f.parent_tmdb_id===p.tmdbId && f.season_number===p.seasonNumber && f.episode_number===p.episodeNumber;
    return match && alternateCut.test([a?.release,...(a?.files ?? []).map(v=>v.file_name)].join(' '));
  });
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
    if (!usableSubtitleEdition(position, file!.file_id)) return false;
    if (position.mediaType === 'tv' && episodePack.test([a.release,file?.file_name].join(' '))) return false;
    // Reject split-disc files: their clock can restart in a later part of a film.
    return position.mediaType === 'movie'
      ? feature.feature_type === 'Movie' && feature.tmdb_id === position.tmdbId
      : feature.feature_type === 'Episode' && feature.parent_tmdb_id === position.tmdbId &&
        feature.season_number === position.seasonNumber && feature.episode_number === position.episodeNumber;
  });
  // SDH/closed captions can supply speaker labels and sounds needed to resolve
  // an otherwise ambiguous exchange. Popularity alone favors dialogue-only files.
  eligible.sort((a, b) => Number(b.attributes?.hearing_impaired === true) - Number(a.attributes?.hearing_impaired === true) ||
    (b.attributes?.download_count ?? 0) - (a.attributes?.download_count ?? 0));
  return eligible[0]?.attributes?.files?.[0]?.file_id ?? null;
}
