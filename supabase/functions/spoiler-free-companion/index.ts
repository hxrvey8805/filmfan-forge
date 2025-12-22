import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse timestamp to seconds
function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  }
  return 0;
}

// Format seconds to timestamp string
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface CharacterSummary {
  character: string;
  actor?: string;
}

interface TMDbContext {
  type: 'tv' | 'movie';
  title?: string;
  year?: string;
  overview?: string;
  seasonOverview?: string;
  episodeOverview?: string;
  movieOverview?: string;
  runtimeMinutes?: number;
  genres?: string[];
  tagline?: string;
  characters?: CharacterSummary[];
}

interface SubtitleCoverage {
  maxAvailableSeconds: number;
  minAvailableSeconds: number;
  hasData: boolean;
  coverageComplete: boolean;
  adjustedTimestamp: number;
}

function extractYear(dateString?: string | null): string | undefined {
  if (!dateString) return undefined;
  return dateString.split('-')[0];
}

function buildCharacterList(cast: any[] | undefined, limit = 15): CharacterSummary[] {
  if (!Array.isArray(cast)) return [];
  const seen = new Set<string>();
  const summaries: CharacterSummary[] = [];

  for (const member of cast) {
    const actor = member.name || member.original_name;
    const character =
      member.character ||
      member.roles?.[0]?.character ||
      (member.roles?.[0]?.credit_id ? member.roles[0].character : undefined);

    if (!character) continue;

    const key = character.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    summaries.push({ character, actor });
    if (summaries.length >= limit) break;
  }

  return summaries;
}

// Fetch TMDB context for metadata
async function getTMDbContext(
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  seasonNumber?: number,
  episodeNumber?: number,
  apiKey?: string
): Promise<TMDbContext | null> {
  try {
    if (!apiKey) return null;

    if (mediaType === 'tv') {
      const seriesUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&append_to_response=aggregate_credits`;
      const seasonUrl = seasonNumber !== undefined
        ? `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${apiKey}`
        : undefined;
      const episodeUrl = seasonNumber !== undefined && episodeNumber !== undefined
        ? `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${apiKey}&append_to_response=credits`
        : undefined;

      const [seriesResult, seasonResult, episodeResult] = await Promise.allSettled([
        fetch(seriesUrl).then(res => res.ok ? res.json() : Promise.reject(res.status)),
        seasonUrl ? fetch(seasonUrl).then(res => res.ok ? res.json() : Promise.reject(res.status)) : Promise.resolve(null),
        episodeUrl ? fetch(episodeUrl).then(res => res.ok ? res.json() : Promise.reject(res.status)) : Promise.resolve(null),
      ]);

      const context: TMDbContext = { type: 'tv' };

      if (seriesResult.status === 'fulfilled' && seriesResult.value) {
        const series = seriesResult.value;
        context.title = series.name;
        context.year = extractYear(series.first_air_date);
        context.overview = series.overview;
        context.genres = series.genres?.map((g: any) => g.name).filter(Boolean);
        const aggregateCast = series.aggregate_credits?.cast;
        if (aggregateCast) {
          context.characters = buildCharacterList(aggregateCast);
        }
      }

      if (seasonResult.status === 'fulfilled' && seasonResult.value) {
        const season = seasonResult.value;
        context.seasonOverview = season.overview || season.name;
      }

      if (episodeResult.status === 'fulfilled' && episodeResult.value) {
        const episode = episodeResult.value;
        context.episodeOverview = episode.overview;
        context.runtimeMinutes = episode.runtime;
        const episodeCast = episode.credits?.cast;
        if (episodeCast && episodeCast.length > 0) {
          context.characters = buildCharacterList(episodeCast);
        }
      }

      return context;
    }

    // Movie handling
    const movieUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`;
    const response = await fetch(movieUrl);
    if (!response.ok) return null;
    const movie = await response.json();

    return {
      type: 'movie',
      title: movie.title,
      year: extractYear(movie.release_date),
      overview: movie.overview,
      movieOverview: movie.overview,
      runtimeMinutes: movie.runtime,
      genres: movie.genres?.map((g: any) => g.name).filter(Boolean),
      tagline: movie.tagline,
      characters: buildCharacterList(movie.credits?.cast),
    };
  } catch (error) {
    console.error('Error fetching TMDb context:', error);
    return null;
  }
}

// Format TMDB context for AI prompt
function formatTMDbContext(context: TMDbContext | null, mediaType: 'tv' | 'movie', seasonNumber?: number, episodeNumber?: number): string {
  if (!context) return '';

  const parts: string[] = [];
  
  if (context.title) parts.push(`**Title:** ${context.title}`);
  if (context.year) parts.push(`**Year:** ${context.year}`);
  if (context.genres && context.genres.length > 0) parts.push(`**Genres:** ${context.genres.join(', ')}`);
  if (context.tagline) parts.push(`**Tagline:** ${context.tagline}`);
  
  if (mediaType === 'tv') {
    if (context.overview) parts.push(`\n**Series Overview:** ${context.overview}`);
    if (context.seasonOverview) parts.push(`\n**Season ${seasonNumber} Overview:** ${context.seasonOverview}`);
    if (context.episodeOverview) parts.push(`\n**Episode ${episodeNumber} Overview:** ${context.episodeOverview}`);
  } else {
    if (context.movieOverview || context.overview) {
      parts.push(`\n**Movie Overview:** ${context.movieOverview || context.overview}`);
    }
  }
  
  if (context.characters && context.characters.length > 0) {
    parts.push(`\n**Main Characters:**`);
    context.characters.forEach(char => {
      if (char.actor) {
        parts.push(`- ${char.character} (played by ${char.actor})`);
      } else {
        parts.push(`- ${char.character}`);
      }
    });
  }
  
  return parts.join('\n');
}

// Generate embedding using OpenAI text-embedding-3-small (1536 dimensions)
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI embedding error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;
    
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      console.error('Invalid embedding dimensions:', embedding?.length);
      return null;
    }
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

interface RetrievedChunk {
  id: string;
  season_number: number | null;
  episode_number: number | null;
  start_seconds: number;
  end_seconds: number;
  content: string;
  similarity: number;
  recencyScore: number;
  finalScore: number;
}

// Check subtitle coverage for the episode
async function getSubtitleCoverage(
  supabase: any,
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  seasonNumber: number,
  episodeNumber: number,
  requestedSeconds: number
): Promise<SubtitleCoverage> {
  let query = supabase
    .from('subtitle_chunks')
    .select('start_seconds, end_seconds')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType);
  
  if (mediaType === 'tv') {
    query = query.eq('season_number', seasonNumber).eq('episode_number', episodeNumber);
  }
  
  const { data: chunks, error } = await query;
  
  if (error || !chunks || chunks.length === 0) {
    console.log('No subtitle chunks found for coverage check');
    return {
      maxAvailableSeconds: 0,
      minAvailableSeconds: 0,
      hasData: false,
      coverageComplete: false,
      adjustedTimestamp: requestedSeconds,
    };
  }
  
  const maxAvailable = Math.max(...chunks.map((c: any) => Number(c.end_seconds)));
  const minAvailable = Math.min(...chunks.map((c: any) => Number(c.start_seconds)));
  const coverageComplete = requestedSeconds <= maxAvailable;
  
  // If user's timestamp exceeds available data, use the latest available
  const adjustedTimestamp = coverageComplete ? requestedSeconds : maxAvailable;
  
  console.log(`Subtitle coverage: min=${formatTime(minAvailable)}, max=${formatTime(maxAvailable)}, requested=${formatTime(requestedSeconds)}, adjusted=${formatTime(adjustedTimestamp)}, complete=${coverageComplete}`);
  
  return {
    maxAvailableSeconds: maxAvailable,
    minAvailableSeconds: minAvailable,
    hasData: true,
    coverageComplete,
    adjustedTimestamp,
  };
}

// Get chunks directly at/near the user's timestamp with fallback
async function getTimestampChunks(
  supabase: any,
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  currentSeason: number,
  currentEpisode: number,
  targetSeconds: number,
  windowMinutes: number = 5
): Promise<RetrievedChunk[]> {
  const windowSeconds = windowMinutes * 60;
  const minSeconds = Math.max(0, targetSeconds - windowSeconds);
  
  let query = supabase
    .from('subtitle_chunks')
    .select('id, season_number, episode_number, start_seconds, end_seconds, content')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .lte('start_seconds', targetSeconds)
    // Include chunks that OVERLAP the window (chunks can be long)
    .gte('end_seconds', minSeconds)
    .order('start_seconds', { ascending: true }) // Chronological order!
    .limit(15);
  
  if (mediaType === 'tv') {
    query = query.eq('season_number', currentSeason).eq('episode_number', currentEpisode);
  }
  
  const { data: chunks, error } = await query;
  
  // FALLBACK: If no chunks found in the window, get the latest available chunks
  if (error || !chunks || chunks.length === 0) {
    console.log('No chunks in timestamp window, trying fallback to latest chunks');
    
    let fallbackQuery = supabase
      .from('subtitle_chunks')
      .select('id, season_number, episode_number, start_seconds, end_seconds, content')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .order('end_seconds', { ascending: false })
      .limit(10);
    
    if (mediaType === 'tv') {
      fallbackQuery = fallbackQuery.eq('season_number', currentSeason).eq('episode_number', currentEpisode);
    }
    
    const { data: fallbackChunks, error: fallbackError } = await fallbackQuery;
    
    if (fallbackError || !fallbackChunks || fallbackChunks.length === 0) {
      console.error('Fallback chunks also failed:', fallbackError);
      return [];
    }
    
    console.log(`Fallback: Found ${fallbackChunks.length} latest chunks`);
    
    // Reverse to get chronological order
    return fallbackChunks.reverse().map((chunk: any) => ({
      id: chunk.id,
      season_number: chunk.season_number,
      episode_number: chunk.episode_number,
      start_seconds: Number(chunk.start_seconds),
      end_seconds: Number(chunk.end_seconds),
      content: chunk.content,
      similarity: 1.0,
      recencyScore: 1.0,
      finalScore: 1.0,
    }));
  }
  
  console.log(`Found ${chunks.length} timestamp chunks (${formatTime(minSeconds)} to ${formatTime(targetSeconds)})`);
  
  return chunks.map((chunk: any) => ({
    id: chunk.id,
    season_number: chunk.season_number,
    episode_number: chunk.episode_number,
    start_seconds: Number(chunk.start_seconds),
    end_seconds: Number(chunk.end_seconds),
    content: chunk.content,
    similarity: 1.0,
    recencyScore: 1.0,
    finalScore: 1.0,
  }));
}

// Detect if question references previous seasons/episodes
function detectCrossSeasonReference(question: string): { mentionsPrevious: boolean; specificSeason?: number; specificEpisode?: number } {
  const questionLower = question.toLowerCase();
  
  // Check for season/episode references
  const seasonMatch = questionLower.match(/season\s*(\d+)/i);
  const episodeMatch = questionLower.match(/episode\s*(\d+)/i);
  
  // Check for temporal references to past
  const mentionsPast = 
    questionLower.includes('before') ||
    questionLower.includes('earlier') ||
    questionLower.includes('previously') ||
    questionLower.includes('remember when') ||
    questionLower.includes('last season') ||
    questionLower.includes('last episode') ||
    questionLower.includes('in the past') ||
    questionLower.includes('happened to') ||
    questionLower.includes('what happened with');
  
  return {
    mentionsPrevious: mentionsPast || !!seasonMatch,
    specificSeason: seasonMatch ? parseInt(seasonMatch[1]) : undefined,
    specificEpisode: episodeMatch ? parseInt(episodeMatch[1]) : undefined,
  };
}

// Two-stage retrieval with re-ranking
async function retrieveContext(
  supabase: any,
  questionEmbedding: number[],
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  currentSeason: number,
  currentEpisode: number,
  maxSeconds: number,
  question: string
): Promise<RetrievedChunk[]> {
  // STAGE 1: Get chunks directly at the user's timestamp (most important!)
  const timestampChunks = await getTimestampChunks(
    supabase, tmdbId, mediaType, currentSeason, currentEpisode, maxSeconds, 5
  );
  console.log(`Direct timestamp chunks: ${timestampChunks.length}`);
  
  // Check for cross-season references
  const crossSeasonRef = detectCrossSeasonReference(question);
  if (crossSeasonRef.mentionsPrevious) {
    console.log('Question references previous content:', crossSeasonRef);
  }
  
  // STAGE 2: Vector search for semantically relevant content
  const { data: candidates, error } = await supabase.rpc('match_subtitle_chunks', {
    query_embedding: questionEmbedding,
    p_tmdb_id: tmdbId,
    p_media_type: mediaType,
    p_current_season: currentSeason,
    p_current_episode: currentEpisode,
    p_max_seconds: maxSeconds,
    match_count: 60,
  });
  
  if (error) {
    console.error('Vector search error:', error);
    return timestampChunks;
  }
  
  // Get IDs of timestamp chunks to avoid duplicates
  const timestampChunkIds = new Set(timestampChunks.map(c => c.id));
  
  // Filter out duplicates from vector results
  const vectorCandidates = (candidates || []).filter((c: any) => !timestampChunkIds.has(c.id));
  
  const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  // Re-rank vector results with ALWAYS high timestamp priority
  const rerankedVector: RetrievedChunk[] = vectorCandidates.map((chunk: any) => {
    const contentLower = chunk.content.toLowerCase();
    const chunkEndSeconds = Number(chunk.end_seconds);
    const chunkStartSeconds = Number(chunk.start_seconds);
    
    // Timestamp proximity score - ALWAYS prioritize this highly
    let timestampProximityScore = 0;
    if (chunk.season_number === currentSeason && chunk.episode_number === currentEpisode) {
      const distanceFromTimestamp = Math.abs(maxSeconds - chunkEndSeconds);
      const maxDistance = maxSeconds;
      timestampProximityScore = 1 - Math.min(distanceFromTimestamp / maxDistance, 1);
      
      // Extra boost for very close chunks
      if (distanceFromTimestamp <= 300) {
        timestampProximityScore = Math.min(1, timestampProximityScore + 0.3);
      }
    }
    
    // Episode recency score
    let episodeRecencyScore = 0;
    if (mediaType === 'tv') {
      const seasonDiff = currentSeason - (chunk.season_number || 1);
      const episodeDiff = currentEpisode - (chunk.episode_number || 1);
      if (seasonDiff === 0 && episodeDiff === 0) {
        episodeRecencyScore = 1.0;
      } else if (seasonDiff === 0) {
        episodeRecencyScore = 0.7 - (episodeDiff * 0.1);
      } else {
        // Boost previous season content if question references past
        episodeRecencyScore = crossSeasonRef.mentionsPrevious ? 0.5 : 0.3 - (seasonDiff * 0.1);
      }
      episodeRecencyScore = Math.max(0, episodeRecencyScore);
    } else {
      episodeRecencyScore = timestampProximityScore;
    }
    
    // Keyword overlap score
    let keywordScore = 0;
    for (const word of questionWords) {
      if (contentLower.includes(word)) {
        keywordScore += 0.15;
      }
    }
    keywordScore = Math.min(0.4, keywordScore);
    
    // Combined score - ALWAYS prioritize timestamp highly (45%)
    const finalScore = 
      (chunk.similarity * 0.25) + 
      (timestampProximityScore * 0.45) + 
      (episodeRecencyScore * 0.2) + 
      (keywordScore * 0.1);
    
    return {
      id: chunk.id,
      season_number: chunk.season_number,
      episode_number: chunk.episode_number,
      start_seconds: chunkStartSeconds,
      end_seconds: chunkEndSeconds,
      content: chunk.content,
      similarity: chunk.similarity,
      recencyScore: timestampProximityScore,
      finalScore,
    };
  });
  
  // Sort vector results by final score
  rerankedVector.sort((a, b) => b.finalScore - a.finalScore);
  
  // COMBINE: Timestamp chunks FIRST (sorted chronologically), then top vector results
  // Limit to 10 timestamp + 10 vector for more focused context
  const combined = [
    ...timestampChunks.slice(0, 10),
    ...rerankedVector.slice(0, 10),
  ];
  
  console.log(`Combined: ${Math.min(10, timestampChunks.length)} timestamp + ${Math.min(10, rerankedVector.length)} vector = ${combined.length} total`);
  
  return combined;
}

// Retrieve season summaries for previous seasons - more focused
async function retrieveSeasonSummaries(
  supabase: any,
  questionEmbedding: number[],
  tmdbId: number,
  currentSeason: number,
  crossSeasonRef: { mentionsPrevious: boolean; specificSeason?: number }
): Promise<string> {
  if (currentSeason <= 1) return '';
  
  const matchCount = crossSeasonRef.mentionsPrevious ? 5 : 3; // More if question references past
  
  const { data: summaries, error } = await supabase.rpc('match_season_summaries', {
    query_embedding: questionEmbedding,
    p_tmdb_id: tmdbId,
    p_max_season: currentSeason,
    match_count: matchCount,
  });
  
  if (error || !summaries || summaries.length === 0) {
    return '';
  }
  
  // Sort by season number for logical order
  summaries.sort((a: any, b: any) => a.season_number - b.season_number);
  
  const parts: string[] = ['**PREVIOUS SEASONS (Summaries - use for context about past events):**\n'];
  
  // Limit to 2 most relevant seasons to reduce context bloat
  const limitedSummaries = summaries.slice(0, 2);
  
  for (const summary of limitedSummaries) {
    parts.push(`\n**${summary.season_name || `Season ${summary.season_number}`}:**`);
    if (summary.overview) {
      parts.push(summary.overview.substring(0, 300) + (summary.overview.length > 300 ? '...' : ''));
    }
    
    const episodes = summary.episode_summaries as { episode: number; name: string; overview: string }[];
    if (episodes && episodes.length > 0) {
      for (const ep of episodes.slice(0, 3)) { // Limit to first 3 episodes per season
        if (ep.overview) {
          parts.push(`- E${ep.episode}: ${ep.name} - ${ep.overview.substring(0, 100)}${ep.overview.length > 100 ? '...' : ''}`);
        }
      }
    }
  }
  
  return parts.join('\n');
}

// Ensure subtitles are cached and trigger speaker annotation if needed
async function ensureSubtitlesCached(
  supabase: any,
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  currentSeason: number,
  currentEpisode: number,
  title?: string
): Promise<void> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  
  if (mediaType === 'tv') {
    for (let ep = 1; ep <= currentEpisode; ep++) {
      const { data: existing } = await supabase
        .from('subtitle_chunks')
        .select('id, content')
        .eq('tmdb_id', tmdbId)
        .eq('media_type', 'tv')
        .eq('season_number', currentSeason)
        .eq('episode_number', ep)
        .limit(1);
      
      if (!existing || existing.length === 0) {
        console.log(`Triggering subtitle cache for S${currentSeason}E${ep}`);
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/process-subtitles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tmdbId,
              mediaType: 'tv',
              seasonNumber: currentSeason,
              episodeNumber: ep,
            }),
          });
          await delay(500);
        } catch (error) {
          console.error(`Failed to cache S${currentSeason}E${ep}:`, error);
        }
      } else if (ep === currentEpisode) {
        // Check if speaker annotations exist for current episode
        const hasAnnotations = /\*\*[A-Z][A-Za-z\s]+:\*\*/.test(existing[0].content);
        if (!hasAnnotations && title) {
          console.log(`Triggering speaker annotation for S${currentSeason}E${ep}`);
          try {
            // Fire and forget - don't block the response
            fetch(`${SUPABASE_URL}/functions/v1/annotate-speakers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tmdbId, mediaType: 'tv', seasonNumber: currentSeason, episodeNumber: ep, title }),
            }).catch(err => console.error('Annotation trigger failed:', err));
          } catch (error) {
            console.error('Failed to trigger annotation:', error);
          }
        }
      }
    }
  } else {
    const { data: existing } = await supabase
      .from('subtitle_chunks')
      .select('id, content')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', 'movie')
      .limit(1);
    
    if (!existing || existing.length === 0) {
      console.log('Triggering subtitle cache for movie');
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-subtitles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId, mediaType: 'movie' }),
        });
      } catch (error) {
        console.error('Failed to cache movie subtitles:', error);
      }
    } else {
      const hasAnnotations = /\*\*[A-Z][A-Za-z\s]+:\*\*/.test(existing[0].content);
      if (!hasAnnotations && title) {
        console.log('Triggering speaker annotation for movie');
        try {
          fetch(`${SUPABASE_URL}/functions/v1/annotate-speakers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tmdbId, mediaType: 'movie', title }),
          }).catch(err => console.error('Annotation trigger failed:', err));
        } catch (error) {
          console.error('Failed to trigger annotation:', error);
        }
      }
    }
  }
}

// Ensure season summaries are cached
async function ensureSeasonSummariesCached(
  supabase: any,
  tmdbId: number,
  currentSeason: number
): Promise<void> {
  if (currentSeason <= 1) return;
  
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  
  for (let season = 1; season < currentSeason; season++) {
    const { data: existing } = await supabase
      .from('season_summaries')
      .select('id')
      .eq('tmdb_id', tmdbId)
      .eq('season_number', season)
      .limit(1);
    
    if (!existing || existing.length === 0) {
      console.log(`Triggering season summary cache for S${season}`);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/cache-season-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId, seasonNumber: season }),
        });
        await delay(200);
      } catch (error) {
        console.error(`Failed to cache season ${season} summary:`, error);
      }
    }
  }
}

// Validate response contains citations
function validateResponse(response: string): boolean {
  const citationPattern = /\[S?\d+E?\d*\s+\d+:\d+(?::\d+)?\]/i;
  return citationPattern.test(response);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please log in.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role client for cache operations
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please log in.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tmdbId, mediaType, seasonNumber, episodeNumber, title, timestamp, question, previousQA } = await req.json();
    
    console.log('RAG spoiler-free request:', { userId: user.id, tmdbId, mediaType, seasonNumber, episodeNumber, title, timestamp, question });

    // Validate required fields
    if (!tmdbId || !mediaType || !timestamp || !question) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tmdbId, mediaType, timestamp, question' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mediaType !== 'tv' && mediaType !== 'movie') {
      return new Response(
        JSON.stringify({ error: 'Invalid mediaType. Must be "tv" or "movie"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mediaType === 'tv' && (!seasonNumber || !episodeNumber)) {
      return new Response(
        JSON.stringify({ error: 'TV shows require seasonNumber and episodeNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check usage limits and charge coins if needed
    const FREE_QUESTIONS_PER_DAY = 5;
    const COINS_PER_QUESTION = 150;
    const today = new Date().toISOString().split('T')[0];

    let { data: aiUsage } = await supabase
      .from('user_ai_usage')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!aiUsage) {
      const { data: newUsage } = await supabase
        .from('user_ai_usage')
        .insert({ user_id: user.id, questions_today: 0, last_reset_date: today })
        .select()
        .single();
      aiUsage = newUsage;
    }

    if (aiUsage.last_reset_date !== today) {
      await supabase
        .from('user_ai_usage')
        .update({ questions_today: 0, last_reset_date: today })
        .eq('user_id', user.id);
      aiUsage.questions_today = 0;
    }

    const hasFreeQuestions = aiUsage.questions_today < FREE_QUESTIONS_PER_DAY;
    
    if (!hasFreeQuestions) {
      let { data: userStats } = await supabase
        .from('user_stats')
        .select('coins')
        .eq('user_id', user.id)
        .single();

      if (!userStats) {
        const { data: newStats } = await supabase
          .from('user_stats')
          .insert({ user_id: user.id, coins: 100 })
          .select()
          .single();
        userStats = newStats;
      }

      if (!userStats || userStats.coins < COINS_PER_QUESTION) {
        return new Response(
          JSON.stringify({ 
            error: `Insufficient coins. You need ${COINS_PER_QUESTION} coins. You have ${userStats?.coins || 0}.`,
            coinsNeeded: COINS_PER_QUESTION,
            coinsAvailable: userStats?.coins || 0
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('user_stats')
        .update({ coins: userStats.coins - COINS_PER_QUESTION })
        .eq('user_id', user.id);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    let requestedSeconds = timestampToSeconds(timestamp);
    if (requestedSeconds === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid timestamp format. Use HH:MM:SS or MM:SS' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure caches are populated (now also triggers speaker annotation)
    await Promise.all([
      ensureSubtitlesCached(supabaseService, tmdbId, mediaType, seasonNumber || 1, episodeNumber || 1, title),
      mediaType === 'tv' ? ensureSeasonSummariesCached(supabaseService, tmdbId, seasonNumber || 1) : Promise.resolve(),
    ]);

    // CHECK SUBTITLE COVERAGE - Critical fix!
    const coverage = await getSubtitleCoverage(
      supabaseService, tmdbId, mediaType, seasonNumber || 1, episodeNumber || 1, requestedSeconds
    );
    
    // Use adjusted timestamp if user's exceeds available data
    const currentSeconds = coverage.adjustedTimestamp;
    const coverageWarning = !coverage.coverageComplete 
      ? `Note: Subtitle data for this episode ends at ${formatTime(coverage.maxAvailableSeconds)}. Your timestamp (${timestamp}) exceeds this, so I'm using the latest available content.`
      : '';

    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question, OPENAI_API_KEY);
    
    if (!questionEmbedding) {
      console.error('Failed to generate question embedding');
      return new Response(
        JSON.stringify({ error: 'Failed to process question. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect cross-season references
    const crossSeasonRef = detectCrossSeasonReference(question);

    // Retrieve relevant context using two-stage RAG
    const [retrievedChunks, seasonSummaries, tmdbContext] = await Promise.all([
      retrieveContext(
        supabaseService,
        questionEmbedding,
        tmdbId,
        mediaType,
        seasonNumber || 1,
        episodeNumber || 1,
        currentSeconds,
        question
      ),
      mediaType === 'tv' ? retrieveSeasonSummaries(supabaseService, questionEmbedding, tmdbId, seasonNumber || 1, crossSeasonRef) : Promise.resolve(''),
      getTMDbContext(tmdbId, mediaType, seasonNumber, episodeNumber, TMDB_API_KEY),
    ]);

    console.log(`Retrieved ${retrievedChunks.length} chunks, has season summaries: ${seasonSummaries.length > 0}`);

    console.log(`Sample chunks:`, retrievedChunks.slice(0, 3).map(c => ({
      season: c.season_number,
      episode: c.episode_number,
      startSeconds: c.start_seconds,
      endSeconds: c.end_seconds,
      contentPreview: c.content.substring(0, 100)
    })));

    // Format retrieved chunks as evidence - now in chronological order
    let evidenceText = '';
    if (retrievedChunks.length > 0) {
      const formattedChunks = retrievedChunks.map(chunk => {
        const location = mediaType === 'tv' 
          ? `[S${chunk.season_number}E${chunk.episode_number} ${formatTime(chunk.start_seconds)}-${formatTime(chunk.end_seconds)}]`
          : `[${formatTime(chunk.start_seconds)}-${formatTime(chunk.end_seconds)}]`;
        return `${location}\n${chunk.content}`;
      });
      evidenceText = `\n\n**EVIDENCE CHUNKS (in chronological order - cite these in your answer):**\n\n${formattedChunks.join('\n\n')}`;
    }
    
    console.log('Evidence text length:', evidenceText.length);

    const tmdbContextText = formatTMDbContext(tmdbContext, mediaType, seasonNumber, episodeNumber);

    if (!evidenceText && !seasonSummaries && !tmdbContextText) {
      return new Response(
        JSON.stringify({ 
          answer: "I couldn't find enough context for this content yet. The subtitles may still be loading. Please try again in a moment.",
          maxAvailableTimestamp: coverage.hasData ? formatTime(coverage.maxAvailableSeconds) : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build evidence-locked system prompt
    const mediaLabel = mediaType === 'tv' 
      ? `Season ${seasonNumber}, Episode ${episodeNumber}`
      : 'this movie';

    const systemPrompt = `You are the viewer's spoiler-free companion for "${title}" — ${mediaLabel}.
Your vibe: a supportive friend on the couch (warm, casual, human). Never say “as an AI”.

**CRITICAL - SPOILER & TIMESTAMP RULES:**
1. The viewer asked at ${timestamp}. The latest safe point is ${formatTime(currentSeconds)} (based on available subtitles).
2. NEVER reveal events after ${formatTime(currentSeconds)}.
3. NEVER invent plot details or timestamps.

${coverageWarning ? `**SUBTITLE COVERAGE NOTE:** ${coverageWarning}` : ''}

**HOW TO USE EVIDENCE:**
- The EVIDENCE CHUNKS are in chronological order; the LAST chunks are closest to where the viewer is.
- For “what’s happening now / how did this end / what just happened”: rely heavily on the LAST few chunks.
- For “before / earlier / last season / previous episodes”: you may use PREVIOUS SEASONS summaries + earlier chunks.

**EVIDENCE-ONLY RULES (non‑negotiable):**
1. Only state facts that appear in EVIDENCE CHUNKS (and PREVIOUS SEASONS summaries when the user asks about earlier seasons).
2. If the requested moment/ending is beyond what the subtitles cover, say plainly:
   "I can only see subtitles up to ${formatTime(currentSeconds)} right now, so I can’t confirm the true ending yet — here’s the last thing we *do* see."
3. Every claim needs a bracket citation from the evidence, e.g. [S5E4 1:07:40-1:08:05].

**STYLE:**
- 2–6 short paragraphs, conversational.
- If helpful, end with one quick follow‑up question.

${tmdbContextText ? `\n**SHOW INFO (metadata only, not evidence for plot):**\n${tmdbContextText}` : ''}
${seasonSummaries ? `\n\n${seasonSummaries}` : ''}`;

    let previousQAContext = '';
    if (previousQA && Array.isArray(previousQA) && previousQA.length > 0) {
      previousQAContext = '\n\n**PREVIOUS QUESTIONS FROM THIS USER:**\n';
      previousQA.slice(0, 3).reverse().forEach((qa: { question: string; answer: string; context: string }, index: number) => {
        previousQAContext += `${index + 1}. Q: "${qa.question}" A: ${qa.answer.substring(0, 200)}...\n`;
      });
    }

    const userPrompt = `The viewer is at ${timestamp} in ${mediaLabel} and asks: "${question}"
${previousQAContext}
${evidenceText}

Answer the question using the EVIDENCE CHUNKS above. For current scene questions, focus on the LAST chunks (they're closest to the user's position). For past events, use the season summaries. Always cite specific timestamps. If the evidence doesn't contain enough information, say so honestly.`;
    

    console.log('Sending request to Lovable AI with RAG context');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Using Pro for better script understanding
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.', retryAfter: 30 }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service credits exhausted. Please try again later.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";
    console.log('AI response finish_reason:', data.choices[0]?.finish_reason);
    console.log('AI response content length:', answer.length);

    // Validate response has citations (log warning but don't fail)
    if (!validateResponse(answer)) {
      console.warn('Response may lack proper citations');
    }

    console.log('RAG response generated successfully');

    // Update usage tracking
    await supabase
      .from('user_ai_usage')
      .update({ 
        questions_today: aiUsage.questions_today + 1,
        total_questions: (aiUsage.total_questions || 0) + 1
      })
      .eq('user_id', user.id);

    const remainingFree = Math.max(0, FREE_QUESTIONS_PER_DAY - (aiUsage.questions_today + 1));

    return new Response(
      JSON.stringify({ 
        answer,
        remainingFreeQuestions: remainingFree,
        usedCoins: hasFreeQuestions ? 0 : COINS_PER_QUESTION,
        chunksRetrieved: retrievedChunks.length,
        maxAvailableTimestamp: coverage.hasData ? formatTime(coverage.maxAvailableSeconds) : null,
        subtitleCoverageComplete: coverage.coverageComplete,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in spoiler-free-companion:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
