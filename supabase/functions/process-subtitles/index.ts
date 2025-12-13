import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare Supabase AI global
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (input: string, options?: { mean_pool?: boolean; normalize?: boolean }) => Promise<number[]>;
    };
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Chunking configuration
const TARGET_TOKENS = 500;
const MAX_TOKENS = 800;
const OVERLAP_TOKENS = 75;
const APPROX_CHARS_PER_TOKEN = 4;

interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

interface SubtitleChunk {
  chunk_index: number;
  start_seconds: number;
  end_seconds: number;
  content: string;
}

// Estimate tokens from text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

// Parse SRT subtitle format into structured entries
function parseSRT(srtText: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  const blocks = srtText.split('\n\n');
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d+):(\d+):(\d+),?\d* --> (\d+):(\d+):(\d+)/);
    
    if (timeMatch) {
      const startSeconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
      const endSeconds = parseInt(timeMatch[4]) * 3600 + parseInt(timeMatch[5]) * 60 + parseInt(timeMatch[6]);
      
      const text = lines.slice(2).join(' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (text) {
        entries.push({ start: startSeconds, end: endSeconds, text });
      }
    }
  }
  
  return entries;
}

// Chunk subtitles with token cap and overlap
function chunkSubtitles(entries: SubtitleEntry[]): SubtitleChunk[] {
  if (entries.length === 0) return [];
  
  const chunks: SubtitleChunk[] = [];
  let currentLines: SubtitleEntry[] = [];
  let currentTokens = 0;
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryTokens = estimateTokens(entry.text);
    
    // If adding this entry would exceed max, finalize current chunk
    if (currentTokens + entryTokens > MAX_TOKENS && currentLines.length > 0) {
      // Create chunk
      chunks.push({
        chunk_index: chunks.length,
        start_seconds: currentLines[0].start,
        end_seconds: currentLines[currentLines.length - 1].end,
        content: currentLines.map(e => `[${formatTime(e.start)}] ${e.text}`).join(' '),
      });
      
      // Calculate overlap: keep last entries that fit within OVERLAP_TOKENS
      let overlapTokens = 0;
      let overlapStart = currentLines.length;
      for (let j = currentLines.length - 1; j >= 0; j--) {
        const tokens = estimateTokens(currentLines[j].text);
        if (overlapTokens + tokens <= OVERLAP_TOKENS) {
          overlapTokens += tokens;
          overlapStart = j;
        } else {
          break;
        }
      }
      
      currentLines = currentLines.slice(overlapStart);
      currentTokens = overlapTokens;
    }
    
    currentLines.push(entry);
    currentTokens += entryTokens;
    
    // If we've reached target size and entry ends a natural break, create chunk
    if (currentTokens >= TARGET_TOKENS && isNaturalBreak(entry.text)) {
      chunks.push({
        chunk_index: chunks.length,
        start_seconds: currentLines[0].start,
        end_seconds: currentLines[currentLines.length - 1].end,
        content: currentLines.map(e => `[${formatTime(e.start)}] ${e.text}`).join(' '),
      });
      
      // Calculate overlap
      let overlapTokens = 0;
      let overlapStart = currentLines.length;
      for (let j = currentLines.length - 1; j >= 0; j--) {
        const tokens = estimateTokens(currentLines[j].text);
        if (overlapTokens + tokens <= OVERLAP_TOKENS) {
          overlapTokens += tokens;
          overlapStart = j;
        } else {
          break;
        }
      }
      
      currentLines = currentLines.slice(overlapStart);
      currentTokens = overlapTokens;
    }
  }
  
  // Push remaining content
  if (currentLines.length > 0) {
    chunks.push({
      chunk_index: chunks.length,
      start_seconds: currentLines[0].start,
      end_seconds: currentLines[currentLines.length - 1].end,
      content: currentLines.map(e => `[${formatTime(e.start)}] ${e.text}`).join(' '),
    });
  }
  
  return chunks;
}

// Format seconds to MM:SS or HH:MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Check if text ends at a natural break (sentence end, question, etc.)
function isNaturalBreak(text: string): boolean {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) || /[.!?][\"']$/.test(trimmed);
}

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

// Generate embedding using Supabase's built-in gte-small model
const embeddingModel = new Supabase.ai.Session('gte-small');

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const embedding = await embeddingModel.run(text.slice(0, 2000), {
      mean_pool: true,
      normalize: true,
    });
    
    if (!Array.isArray(embedding) || embedding.length !== 384) {
      console.error('Invalid embedding dimensions:', embedding?.length);
      return null;
    }
    
    return embedding as number[];
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdbId, mediaType, seasonNumber, episodeNumber } = await req.json();
    
    console.log('Process subtitles request:', { tmdbId, mediaType, seasonNumber, episodeNumber });
    
    if (!tmdbId || !mediaType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tmdbId, mediaType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (mediaType === 'tv' && (!seasonNumber || !episodeNumber)) {
      return new Response(
        JSON.stringify({ error: 'TV shows require seasonNumber and episodeNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const OPENSUBTITLES_API_KEY = Deno.env.get('OPENSUBTITLES_API_KEY');
    if (!OPENSUBTITLES_API_KEY) {
      throw new Error('OPENSUBTITLES_API_KEY is not configured');
    }
    
    // Create Supabase client with service role for inserts
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Check if already cached
    let existingQuery = supabase
      .from('subtitle_chunks')
      .select('id')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType);
    
    if (mediaType === 'tv') {
      existingQuery = existingQuery
        .eq('season_number', seasonNumber)
        .eq('episode_number', episodeNumber);
    }
    
    const { data: existing } = await existingQuery.limit(1);
    
    if (existing && existing.length > 0) {
      console.log('Subtitles already cached, skipping');
      return new Response(
        JSON.stringify({ success: true, cached: true, message: 'Already cached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Search for subtitles
    const params = new URLSearchParams({
      tmdb_id: String(tmdbId),
      languages: 'en',
      type: mediaType === 'tv' ? 'episode' : 'movie',
      order_by: 'download_count',
      order_direction: 'desc',
    });

    if (mediaType === 'tv') {
      params.set('season_number', String(seasonNumber));
      params.set('episode_number', String(episodeNumber));
    }

    const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`;
    
    const searchResponse = await fetchWithRetry(searchUrl, {
      method: 'GET',
      headers: {
        'Api-Key': OPENSUBTITLES_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('Subtitle search failed:', searchResponse.status);
      return new Response(
        JSON.stringify({ error: 'Subtitle search failed', status: searchResponse.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];
    
    if (results.length === 0) {
      console.log('No subtitles found');
      return new Response(
        JSON.stringify({ success: false, message: 'No subtitles found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    results.sort((a: any, b: any) => (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0));
    const best = results[0];
    
    if (!best?.attributes?.files?.[0]?.file_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'No valid subtitle file found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await delay(500);

    const downloadResponse = await fetchWithRetry(`https://api.opensubtitles.com/api/v1/download`, {
      method: 'POST',
      headers: {
        'Api-Key': OPENSUBTITLES_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: best.attributes.files[0].file_id }),
    });

    if (!downloadResponse.ok) {
      console.error('Subtitle download failed:', downloadResponse.status);
      return new Response(
        JSON.stringify({ error: 'Subtitle download failed', status: downloadResponse.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const downloadData = await downloadResponse.json();
    if (!downloadData.link) {
      return new Response(
        JSON.stringify({ success: false, message: 'No download link returned' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const subtitleResponse = await fetch(downloadData.link);
    const subtitleText = await subtitleResponse.text();
    
    // Parse and chunk subtitles
    const entries = parseSRT(subtitleText);
    console.log(`Parsed ${entries.length} subtitle entries`);
    
    if (entries.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'No valid subtitle entries parsed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const chunks = chunkSubtitles(entries);
    console.log(`Created ${chunks.length} chunks`);
    
    // Process chunks in small batches to avoid CPU timeout
    // Insert WITHOUT embeddings first, then we can add embeddings later if needed
    const BATCH_SIZE = 5;
    let successCount = 0;
    
    for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
      const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE);
      const insertData: any[] = [];
      
      for (const chunk of batch) {
        // Generate embedding for this chunk
        const embedding = await generateEmbedding(chunk.content);
        
        insertData.push({
          tmdb_id: tmdbId,
          media_type: mediaType,
          season_number: mediaType === 'tv' ? seasonNumber : null,
          episode_number: mediaType === 'tv' ? episodeNumber : null,
          chunk_index: chunk.chunk_index,
          start_seconds: chunk.start_seconds,
          end_seconds: chunk.end_seconds,
          content: chunk.content,
          embedding: embedding,
        });
      }
      
      // Insert this batch immediately
      const { error: insertError } = await supabase
        .from('subtitle_chunks')
        .upsert(insertData, { 
          onConflict: 'tmdb_id,media_type,season_number,episode_number,chunk_index',
          ignoreDuplicates: true 
        });
      
      if (insertError) {
        console.error(`Batch insert error at ${batchStart}:`, insertError);
        // Continue with next batch instead of failing completely
      } else {
        successCount += batch.length;
        console.log(`Inserted batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
      }
      
      // Small delay between batches to avoid rate limits
      if (batchStart + BATCH_SIZE < chunks.length) {
        await delay(100);
      }
    }
    
    if (successCount === 0) {
      return new Response(
        JSON.stringify({ error: 'Failed to store any chunks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Successfully cached ${successCount}/${chunks.length} chunks for ${mediaType === 'tv' ? `S${seasonNumber}E${episodeNumber}` : 'movie'}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        cached: false,
        chunksStored: successCount,
        chunksCreated: chunks.length,
        entriesParsed: entries.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in process-subtitles:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
