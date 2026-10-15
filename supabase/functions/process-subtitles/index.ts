import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunkCues, COMPANION_VERSION, formatTimestamp } from "../_shared/companion.ts";
import { loadSubtitleFile, SubtitleProviderError } from "../_shared/subtitle-provider.ts";

const headers = { 'Content-Type': 'application/json' };
serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Subtitle ingestion is an internal operation, not a public paid-API proxy.
  if (!serviceKey || req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }
  try {
    const { tmdbId, mediaType, seasonNumber, episodeNumber } = await req.json();
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !['movie', 'tv'].includes(mediaType) ||
        (mediaType === 'tv' && (!Number.isInteger(seasonNumber) || seasonNumber < 0 ||
          !Number.isInteger(episodeNumber) || episodeNumber < 1))) {
      return new Response(JSON.stringify({ error: 'Invalid title or episode' }), { status: 400, headers });
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    let existing = db.from('subtitle_chunks').select('id').eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType).eq('ingestion_version', COMPANION_VERSION);
    if (mediaType === 'tv') existing = existing.eq('season_number', seasonNumber).eq('episode_number', episodeNumber);
    const cached = await existing.limit(1);
    if (cached.error) throw cached.error;
    if (cached.data?.length) return new Response(JSON.stringify({ success: true, cached: true }), { headers });

    const apiKey = Deno.env.get('OPENSUBTITLES_API_KEY');
    if (!apiKey) throw new Error('Subtitle service is not configured');
    const source = await loadSubtitleFile({ tmdbId, mediaType, seasonNumber, episodeNumber }, apiKey);
    if (!source) return new Response(JSON.stringify({ success: false, reason: 'unavailable' }), { headers });
    const { fileId, cues } = source;
    const chunks = chunkCues(cues);
    const rows = chunks.map((cues, index) => ({
      tmdb_id: tmdbId, media_type: mediaType,
      season_number: mediaType === 'tv' ? seasonNumber : null,
      episode_number: mediaType === 'tv' ? episodeNumber : null,
      chunk_index: index, start_seconds: cues[0].start, end_seconds: Math.max(...cues.map(cue => cue.end)),
      content: cues.map(cue => `[${formatTimestamp(cue.start)}] ${cue.text}`).join('\n'),
      cues, ingestion_version: COMPANION_VERSION, source_file_id: fileId,
      cache_key: `${mediaType}:${tmdbId}:${seasonNumber ?? 0}:${episodeNumber ?? 0}:${COMPANION_VERSION}:${index}`,
      embedding: null as number[] | null,
    }));
    // Timestamp and keyword retrieval need no paid embedding service.
    // A single database transaction publishes the entire parsed file. A failed
    // import cannot leave a partially populated cache that looks complete.
    const { error } = await db.from('subtitle_chunks').upsert(rows, {
      onConflict: mediaType === 'tv' ? 'tmdb_id,media_type,season_number,episode_number,chunk_index' : 'cache_key',
    });
    if (error) throw error;
    return new Response(JSON.stringify({ success: true, chunksStored: rows.length }), { headers });
  } catch (error) {
    if (error instanceof SubtitleProviderError) {
      console.error('Subtitle provider failed', { reason: error.reason, stage: error.stage, status: error.status, detail: error.detail });
      return new Response(JSON.stringify({ error: error.message, reason: error.reason }), { status: 503, headers });
    }
    console.error('Subtitle ingestion failed', error instanceof Error ? error.message : 'database error');
    return new Response(JSON.stringify({ error: 'Unable to prepare subtitles' }), { status: 503, headers });
  }
});
