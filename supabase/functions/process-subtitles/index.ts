import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunkCues, COMPANION_VERSION, formatTimestamp, parseSubtitles } from "../_shared/companion.ts";

const headers = { 'Content-Type': 'application/json' };
// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with retry for rate limiting
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  initialDelayMs: number = 2000
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : initialDelayMs * Math.pow(2, attempt);
        
        console.log(`Rate limited (429). Attempt ${attempt + 1}/${maxRetries + 1}. Waiting ${waitTime}ms...`);
        
        if (attempt < maxRetries) {
          await delay(waitTime);
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`Fetch attempt ${attempt + 1} failed:`, error);
      
      if (attempt < maxRetries) {
        await delay(initialDelayMs * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}


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
    const apiHeaders = { 'Api-Key': apiKey, 'Content-Type': 'application/json' };
    const params = new URLSearchParams({ tmdb_id: String(tmdbId), languages: 'en',
      type: mediaType === 'tv' ? 'episode' : 'movie', order_by: 'download_count', order_direction: 'desc' });
    if (mediaType === 'tv') {
      params.set('season_number', String(seasonNumber));
      params.set('episode_number', String(episodeNumber));
    }
    const search = await fetchWithRetry(`https://api.opensubtitles.com/api/v1/subtitles?${params}`, { headers: apiHeaders });
    if (!search.ok) throw new Error('Subtitle search failed');
    const results = (await search.json()).data ?? [];
    const best = results.sort((a: any, b: any) => (b.attributes?.download_count ?? 0) - (a.attributes?.download_count ?? 0))[0];
    const fileId = best?.attributes?.files?.[0]?.file_id;
    if (!fileId) return new Response(JSON.stringify({ success: false, reason: 'unavailable' }), { headers });
    const download = await fetchWithRetry('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST', headers: apiHeaders, body: JSON.stringify({ file_id: fileId }),
    });
    if (!download.ok) throw new Error('Subtitle download failed');
    const link = (await download.json()).link;
    if (!link) throw new Error('Subtitle download unavailable');
    const file = await fetch(link);
    if (!file.ok) throw new Error('Subtitle file unavailable');
    const chunks = chunkCues(parseSubtitles(await file.text()));
    if (!chunks.length) return new Response(JSON.stringify({ success: false, reason: 'unavailable' }), { headers });
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
    const embeddingKey = Deno.env.get('OPENAI_API_KEY');
    if (embeddingKey) {
      for (let offset = 0; offset < rows.length; offset += 32) {
        const batch = rows.slice(offset, offset + 32);
        try {
          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST', headers: { Authorization: `Bearer ${embeddingKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: batch.map(row => row.content) }),
          });
          if (response.ok) {
            for (const item of (await response.json()).data ?? []) {
              if (Number.isInteger(item.index) && batch[item.index] && item.embedding?.length === 1536) {
                batch[item.index].embedding = item.embedding;
              }
            }
          }
        } catch { /* Exact-time and keyword retrieval still work without embeddings. */ }
      }
    }
    // A single database transaction publishes the entire parsed file. A failed
    // import cannot leave a partially populated cache that looks complete.
    const { error } = await db.from('subtitle_chunks').upsert(rows, {
      onConflict: mediaType === 'tv' ? 'tmdb_id,media_type,season_number,episode_number,chunk_index' : 'cache_key',
    });
    if (error) throw error;
    return new Response(JSON.stringify({ success: true, chunksStored: rows.length }), { headers });
  } catch (error) {
    console.error('Subtitle ingestion failed', error instanceof Error ? error.message : 'database error');
    return new Response(JSON.stringify({ error: 'Unable to prepare subtitles' }), { status: 503, headers });
  }
});
