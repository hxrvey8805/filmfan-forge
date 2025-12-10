import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configurable parameters
const EPISODE_CONTEXT_WINDOW = 5;  // how many previous episodes to pull for TV shows
const MAX_SUBTITLE_LINES_PER_EPISODE = 200; // limit lines per episode/movie to manage token count
const AI_MODEL = 'llama-3.3-70b-versatile'; // Groq model - fast and accurate

// In-memory subtitle cache
const subtitleCache = new Map<string, string>();

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

// Enhanced TMDB context fetching with summaries and character info
async function getTMDbContext(
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  seasonNumber?: number,
  episodeNumber?: number,
  apiKey?: string
): Promise<TMDbContext | null> {
  try {
    if (!apiKey) {
      console.log('No TMDb API key available');
      return null;
    }

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
          // Prefer episode-specific cast if available
          context.characters = buildCharacterList(episodeCast);
        }
      }

      console.log('TMDb TV context fetched:', {
        title: context.title,
        hasOverview: Boolean(context.overview),
        hasSeasonOverview: Boolean(context.seasonOverview),
        hasEpisodeOverview: Boolean(context.episodeOverview),
        characterCount: context.characters?.length || 0,
      });

      return context;
    }

    // Movie handling
    const movieUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`;
    const response = await fetch(movieUrl);
    if (!response.ok) {
      console.error('TMDb movie API error:', response.status);
      return null;
    }
    const movie = await response.json();

    const context: TMDbContext = {
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

    console.log('TMDb movie context fetched:', { 
      title: context.title, 
      hasOverview: Boolean(context.overview),
      characterCount: context.characters?.length || 0,
    });

    return context;
  } catch (error) {
    console.error('Error fetching TMDb context:', error);
    return null;
  }
}

// Parse SRT subtitle format into structured entries
interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

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

interface FetchSubtitlesParams {
  mediaType: 'tv' | 'movie';
  tmdbId: number;
  apiKey: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

// Helper function to delay execution
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with retry logic for rate limiting
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
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

// Fetch and cache subtitles for TV episodes or movies
async function fetchSubtitles({
  mediaType,
  tmdbId,
  apiKey,
  seasonNumber,
  episodeNumber,
}: FetchSubtitlesParams): Promise<SubtitleEntry[] | null> {
  const cacheKey = mediaType === 'tv'
    ? `tv:${tmdbId}:${seasonNumber}:${episodeNumber}`
    : `movie:${tmdbId}`;
  
  if (subtitleCache.has(cacheKey)) {
    console.log(`Using cached subtitles for ${cacheKey}`);
    return parseSRT(subtitleCache.get(cacheKey)!);
  }
  
  try {
    const params = new URLSearchParams({
      tmdb_id: String(tmdbId),
      languages: 'en',
      type: mediaType === 'tv' ? 'episode' : 'movie',
      order_by: 'download_count',
      order_direction: 'desc',
    });

    if (mediaType === 'tv' && seasonNumber !== undefined && episodeNumber !== undefined) {
      params.set('season_number', String(seasonNumber));
      params.set('episode_number', String(episodeNumber));
    }

    const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`;
    
    const searchResponse = await fetchWithRetry(searchUrl, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    }, 3, 2000); // 3 retries, starting at 2 seconds

    if (!searchResponse.ok) {
      console.error('Subtitle search failed after retries:', searchResponse.status);
      return null;
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];
    
    if (results.length === 0) {
      console.log(`No subtitles found for ${cacheKey}`);
      return null;
    }

    results.sort((a: any, b: any) => (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0));
    const best = results[0];
    
    if (!best?.attributes?.files?.[0]?.file_id) {
      return null;
    }

    // Add delay between search and download to avoid rate limiting
    await delay(500);

    const downloadResponse = await fetchWithRetry(`https://api.opensubtitles.com/api/v1/download`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: best.attributes.files[0].file_id }),
    }, 3, 2000);

    if (!downloadResponse.ok) {
      console.error('Subtitle download failed after retries:', downloadResponse.status);
      return null;
    }

    const downloadData = await downloadResponse.json();
    if (!downloadData.link) return null;

    const subtitleResponse = await fetch(downloadData.link);
    const subtitleText = await subtitleResponse.text();
    
    subtitleCache.set(cacheKey, subtitleText);
    console.log(`Cached subtitles for ${cacheKey}`);
    
    return parseSRT(subtitleText);
  } catch (error) {
    console.error('Error fetching subtitles:', error);
    return null;
  }
}

// Format subtitle entries into readable text
function formatSubtitles(entries: SubtitleEntry[], label: string): string {
  if (entries.length === 0) return '';
  
  // Sample subtitles evenly if too many to fit token limits
  const sampled = entries.length > MAX_SUBTITLE_LINES_PER_EPISODE
    ? entries.filter((_, i) => i % Math.ceil(entries.length / MAX_SUBTITLE_LINES_PER_EPISODE) === 0)
    : entries;
  
  const text = sampled.map(e => e.text).join(' ');
  return `**${label}:**\n${text}`;
}

// Fetch multi-episode context for TV shows
async function getTVContext(
  tmdbId: number,
  currentSeason: number,
  currentEpisode: number,
  currentTimestamp: number,
  apiKey: string
): Promise<{ priorContext: string[], currentContext: string }> {
  const priorContext: string[] = [];
  let currentContext = '';
  
  // Fetch previous episodes
  const episodesToFetch: Array<{season: number, episode: number}> = [];
  for (let ep = currentEpisode - 1; ep >= Math.max(1, currentEpisode - EPISODE_CONTEXT_WINDOW); ep--) {
    episodesToFetch.push({ season: currentSeason, episode: ep });
  }
  
  console.log(`Fetching ${episodesToFetch.length} prior episodes for context`);
  
  for (const { season, episode } of episodesToFetch.reverse()) {
    const entries = await fetchSubtitles({
      mediaType: 'tv',
      tmdbId,
      apiKey,
      seasonNumber: season,
      episodeNumber: episode,
    });
    if (entries && entries.length > 0) {
      const formatted = formatSubtitles(entries, `S${season}E${episode}`);
      if (formatted) {
        priorContext.push(formatted);
      }
    }
    // Small delay between episodes to avoid rate limiting
    await delay(300);
  }
  
  // Fetch current episode up to timestamp
  const currentEntries = await fetchSubtitles({
    mediaType: 'tv',
    tmdbId,
    apiKey,
    seasonNumber: currentSeason,
    episodeNumber: currentEpisode,
  });
  if (currentEntries && currentEntries.length > 0) {
    const filteredEntries = currentEntries.filter(e => e.end <= currentTimestamp);
    console.log(`Current episode: ${filteredEntries.length} subtitle entries up to timestamp`);
    
    if (filteredEntries.length > 0) {
      const hours = Math.floor(currentTimestamp / 3600);
      const mins = Math.floor((currentTimestamp % 3600) / 60);
      const secs = Math.floor(currentTimestamp % 60);
      const timeStr = hours > 0 
        ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${mins}:${String(secs).padStart(2, '0')}`;
      currentContext = formatSubtitles(filteredEntries, `S${currentSeason}E${currentEpisode} (up to ${timeStr})`);
    }
  }
  
  return { priorContext, currentContext };
}

// Fetch movie context
async function getMovieContext(
  tmdbId: number,
  currentTimestamp: number,
  apiKey: string
): Promise<string> {
  const entries = await fetchSubtitles({
    mediaType: 'movie',
    tmdbId,
    apiKey,
  });
  
  if (entries && entries.length > 0) {
    const filteredEntries = entries.filter(e => e.end <= currentTimestamp);
    console.log(`Movie: ${filteredEntries.length} subtitle entries up to timestamp`);
    
    if (filteredEntries.length > 0) {
      const hours = Math.floor(currentTimestamp / 3600);
      const mins = Math.floor((currentTimestamp % 3600) / 60);
      const secs = Math.floor(currentTimestamp % 60);
      const timeStr = hours > 0 
        ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${mins}:${String(secs).padStart(2, '0')}`;
      return formatSubtitles(filteredEntries, `Movie (up to ${timeStr})`);
    }
  }
  
  return '';
}

// Format TMDB context for AI prompt
function formatTMDbContext(context: TMDbContext | null, mediaType: 'tv' | 'movie', seasonNumber?: number, episodeNumber?: number): string {
  if (!context) return '';

  const parts: string[] = [];
  
  if (context.title) {
    parts.push(`**Title:** ${context.title}`);
  }
  if (context.year) {
    parts.push(`**Year:** ${context.year}`);
  }
  if (context.genres && context.genres.length > 0) {
    parts.push(`**Genres:** ${context.genres.join(', ')}`);
  }
  if (context.tagline) {
    parts.push(`**Tagline:** ${context.tagline}`);
  }
  
  if (mediaType === 'tv') {
    if (context.overview) {
      parts.push(`\n**Series Overview:** ${context.overview}`);
    }
    if (context.seasonOverview) {
      parts.push(`\n**Season ${seasonNumber} Overview:** ${context.seasonOverview}`);
    }
    if (context.episodeOverview) {
      parts.push(`\n**Episode ${episodeNumber} Overview:** ${context.episodeOverview}`);
    }
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

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please log in.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tmdbId, mediaType, seasonNumber, episodeNumber, title, timestamp, question } = await req.json();
    
    console.log('Spoiler-free request:', { userId: user.id, tmdbId, mediaType, seasonNumber, episodeNumber, title, timestamp, question });

    // Validate required fields
    if (!tmdbId || !mediaType || !timestamp || !question) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tmdbId, mediaType, timestamp, question' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate mediaType
    if (mediaType !== 'tv' && mediaType !== 'movie') {
      return new Response(
        JSON.stringify({ error: 'Invalid mediaType. Must be "tv" or "movie"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate TV show requires season/episode
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

    // Get or create AI usage record
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

    // Reset daily count if it's a new day
    if (aiUsage.last_reset_date !== today) {
      await supabase
        .from('user_ai_usage')
        .update({ questions_today: 0, last_reset_date: today })
        .eq('user_id', user.id);
      aiUsage.questions_today = 0;
    }

    // Check if user has free questions remaining
    const hasFreeQuestions = aiUsage.questions_today < FREE_QUESTIONS_PER_DAY;
    
    if (!hasFreeQuestions) {
      // Need to charge coins - check user's balance
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
            error: `Insufficient coins. You need ${COINS_PER_QUESTION} coins for this question. You have ${userStats?.coins || 0} coins.`,
            coinsNeeded: COINS_PER_QUESTION,
            coinsAvailable: userStats?.coins || 0
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deduct coins
      await supabase
        .from('user_stats')
        .update({ coins: userStats.coins - COINS_PER_QUESTION })
        .eq('user_id', user.id);
    }

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const OPENSUBTITLES_API_KEY = Deno.env.get('OPENSUBTITLES_API_KEY');
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not configured');
    }
    if (!OPENSUBTITLES_API_KEY) {
      throw new Error('OPENSUBTITLES_API_KEY is not configured');
    }

    // Parse timestamp to seconds
    const currentSeconds = timestampToSeconds(timestamp);
    if (currentSeconds === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid timestamp format. Use HH:MM:SS or MM:SS' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch enhanced TMDB context (summaries, characters, etc.)
    const tmdbContext = await getTMDbContext(tmdbId, mediaType, seasonNumber, episodeNumber, TMDB_API_KEY);
    
    // Fetch subtitle context
    let subtitleContext = '';
    let priorContext: string[] = [];
    
    if (mediaType === 'tv') {
      const tvContext = await getTVContext(tmdbId, seasonNumber!, episodeNumber!, currentSeconds, OPENSUBTITLES_API_KEY);
      priorContext = tvContext.priorContext;
      subtitleContext = tvContext.currentContext;
    } else {
      subtitleContext = await getMovieContext(tmdbId, currentSeconds, OPENSUBTITLES_API_KEY);
    }

    // Build context sections for AI
    const tmdbContextText = formatTMDbContext(tmdbContext, mediaType, seasonNumber, episodeNumber);
    
    const priorContextText = priorContext.length > 0 
      ? `\n\n**PREVIOUS EPISODES (for context):**\n${priorContext.join('\n\n')}`
      : '';

    const currentSubtitleText = subtitleContext
      ? `\n\n**SUBTITLE DIALOGUE (up to ${timestamp}):**\n${subtitleContext}`
      : '';

    // Determine if we have enough context
    const hasSubtitleContext = subtitleContext.length > 0;
    const hasTMDbContext = tmdbContext !== null;
    
    if (!hasSubtitleContext && !hasTMDbContext) {
      return new Response(
        JSON.stringify({ 
          answer: "I couldn't find subtitle data or metadata for this content. Please ensure the content exists and has available subtitles." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build enhanced system prompt
    const mediaLabel = mediaType === 'tv' 
      ? `Season ${seasonNumber}, Episode ${episodeNumber}`
      : 'this movie';
    
    const systemPrompt = `You are a spoiler-free companion for "${title}" at ${mediaLabel}, timestamp ${timestamp}.

**ABSOLUTE RULES - NEVER VIOLATE:**
1. NEVER reveal events after ${timestamp}
2. NEVER mention "subtitles", "data", "limitations", "access", "available", or any meta-commentary about your sources
3. NEVER say phrases like "without access to", "based on available information", "I don't have subtitle data"
4. Answer AS IF you have complete knowledge of everything up to ${timestamp}
5. Use your knowledge of this show/movie confidently - you know it well

**ANSWER DIRECTLY:**
- Simple questions → 1-3 sentences
- Complex questions → Detailed but focused
- Always answer the actual question asked
- Sound like an expert fan, not an AI assistant

**COVERAGE - EVERYTHING IS FAIR GAME:**
- Answer questions about ANY point in the episode/movie up to ${timestamp}
- Major plot points, minor details, character moments, dialogue, background events - all valid
- If asked about a specific scene, timestamp, or moment, provide details from that exact point
- Don't limit yourself to "major" events - users can ask about anything they've seen

**QUESTION TYPE EXAMPLES:**

1. **"What's happening?" / "Recap" / "What happened so far?"**
   - Provide chronological summary of events up to ${timestamp}
   - Include both major and minor plot points
   - Use structure appropriate to complexity (bullets for quick recap, paragraphs for detailed)

2. **"Who is [character]?" / "Tell me about [character]"**
   - Brief answer: Name, role, key relationships (2-3 sentences)
   - Detailed answer: Full background, relationships, motivations, what they've done (if asked for more)

3. **"What happened at [specific time/moment]?" / "What did [character] say/do at [point]?"**
   - Provide exact details from that specific point
   - Reference dialogue, actions, context
   - Be precise about what occurred

4. **"Why did [character] do X?" / "What does [event] mean?" / "Explain [concept]"**
   - Explain based on context shown up to ${timestamp}
   - Reference specific dialogue, scenes, or character motivations
   - Provide depth matching the question's complexity

5. **"Tell me everything about [topic]" / "Explain in detail"**
   - Comprehensive, in-depth answer covering all relevant details
   - Organize information clearly
   - Include all relevant context from all available sources

**INFORMATION SOURCES (SYNTHESIZE SEAMLESSLY):**
- Subtitle dialogue: Primary source for chronological events and dialogue when available
- TMDB metadata: Character backgrounds, relationships, episode summaries
- Your knowledge: Fill gaps, provide context, enrich understanding - all within the timeline
- Combine these sources naturally - never mention which source you're using or that something is missing

**CRITICAL RULES:**
- NEVER mention events after ${timestamp}
- NEVER reference future episodes or later movie scenes
- NEVER mention data availability, missing subtitles, or limitations
- Answer with appropriate depth - simple questions get simple answers, complex questions get detailed answers
- Cover ALL details asked about, not just major plot points
- Be direct and get to the point quickly, but expand when depth is needed
- Answer confidently using whatever information you have available

${tmdbContextText ? `\n**CONTENT METADATA:**\n${tmdbContextText}` : ''}

Answer the question with appropriate depth - be direct for simple questions, comprehensive for complex ones. Cover everything the user asks about. Synthesize all available information into a confident, cohesive answer.`;

    const userPrompt = `Question: "${question}"

${priorContextText}${currentSubtitleText}

Synthesize information from all available sources (subtitles, metadata, and your knowledge) to provide a direct, accurate, and confident answer. Answer directly without mentioning data availability or limitations. If it's a simple question, be direct and concise. If it's asking for details or explanation, provide comprehensive information. Cover all aspects of what the user is asking about, including specific moments, dialogue, or minor details if relevant.`;

    console.log('Sending request to AI with context:', {
      hasSubtitleContext,
      hasTMDbContext,
      priorEpisodes: priorContext.length,
      model: AI_MODEL,
    });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6, // Slightly higher for more confident, natural responses while maintaining accuracy
        max_tokens: 800, // Allow for longer answers when needed for in-depth questions
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error('AI service rate limit hit');
        return new Response(
          JSON.stringify({ 
            error: 'The AI service is experiencing high demand. Please wait 30 seconds and try again.',
            retryAfter: 30
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";

    console.log('AI response generated successfully');

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
        usedCoins: hasFreeQuestions ? 0 : COINS_PER_QUESTION
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in spoiler-free-companion:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
