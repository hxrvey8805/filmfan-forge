import { chunkCues, formatTimestamp, SUBTITLE_VERSION, type Cue, type ViewingPosition } from './companion.ts';

// The provider and offline reviewed-source importer publish the same cache shape.
export function subtitleCacheRows(position: Omit<ViewingPosition, 'seconds'>, fileId: number | null, cues: Cue[]) {
  if (!Number.isSafeInteger(position.tmdbId) || position.tmdbId <= 0 ||
      !['movie', 'tv'].includes(position.mediaType) ||
      (position.mediaType === 'tv' && (!Number.isInteger(position.seasonNumber) || position.seasonNumber! < 0 ||
        !Number.isInteger(position.episodeNumber) || position.episodeNumber! < 1)) ||
      (position.mediaType === 'movie' && (position.seasonNumber != null || position.episodeNumber != null)) ||
      (fileId !== null && (!Number.isSafeInteger(fileId) || fileId <= 0)) || !cues.length ||
      cues.some(cue => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 ||
        cue.end < cue.start || cue.end > 43200 || typeof cue.text !== 'string' || !cue.text.trim())) {
    throw new Error('Invalid subtitle scope or cues');
  }
  return chunkCues([...cues].sort((a, b) => a.start - b.start || a.end - b.end)).map((chunk, index) => ({
    tmdb_id: position.tmdbId, media_type: position.mediaType,
    season_number: position.mediaType === 'tv' ? position.seasonNumber! : null,
    episode_number: position.mediaType === 'tv' ? position.episodeNumber! : null,
    chunk_index: index, start_seconds: chunk[0].start, end_seconds: Math.max(...chunk.map(cue => cue.end)),
    content: chunk.map(cue => `[${formatTimestamp(cue.start)}] ${cue.text}`).join('\n'),
    cues: chunk, ingestion_version: SUBTITLE_VERSION, source_file_id: fileId,
    cache_key: `${position.mediaType}:${position.tmdbId}:${position.seasonNumber ?? 0}:${position.episodeNumber ?? 0}:${SUBTITLE_VERSION}:${index}`,
    embedding: null as number[] | null,
  }));
}
