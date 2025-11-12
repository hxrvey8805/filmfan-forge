import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configurable parameters
const EPISODE_CONTEXT_WINDOW = 5;  // how many previous episodes to pull
const CHUNK_SECONDS = 60;          // group subtitle lines into ~60s semantic chunks
const PER_EPISODE_BULLETS = 5;     // compress each prior episode into ≤5 plot bullets
const CURRENT_EPISODE_BULLETS = 6; // compress current-so-far into ≤6 bullets

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

// Fetch TMDb metadata for validation
async function getTMDbMetadata(tmdbId: number, mediaType: string, seasonNumber?: number, episodeNumber?: number, apiKey?: string) {
  try {
    if (!apiKey) {
      console.log('No TMDb API key available');
      return null;
    }

    let url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}`;
    
    if (mediaType === 'tv' && seasonNumber && episodeNumber) {
      url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${apiKey}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('TMDb API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('TMDb metadata fetched:', { title: data.title || data.name, year: data.release_date || data.first_air_date });
    return data;
  } catch (error) {
    console.error('Error fetching TMDb metadata:', error);
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

// Fetch and cache subtitles for a single episode
async function fetchEpisodeSubtitles(
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  apiKey: string
): Promise<SubtitleEntry[] | null> {
  const cacheKey = `${tmdbId}:${seasonNumber}:${episodeNumber}`;
  
  if (subtitleCache.has(cacheKey)) {
    console.log(`Using cached subtitles for S${seasonNumber}E${episodeNumber}`);
    return parseSRT(subtitleCache.get(cacheKey)!);
  }
  
  try {
    const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?tmdb_id=${tmdbId}&languages=en&season_number=${seasonNumber}&episode_number=${episodeNumber}&type=episode&order_by=download_count&order_direction=desc`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error(`Subtitle search failed for S${seasonNumber}E${episodeNumber}:`, searchResponse.status);
      return null;
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];
    
    if (results.length === 0) {
      console.log(`No subtitles found for S${seasonNumber}E${episodeNumber}`);
      return null;
    }

    results.sort((a: any, b: any) => (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0));
    const best = results[0];
    
    if (!best?.attributes?.files?.[0]?.file_id) {
      return null;
    }

    const downloadResponse = await fetch(`https://api.opensubtitles.com/api/v1/download`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: best.attributes.files[0].file_id }),
    });

    if (!downloadResponse.ok) {
      console.error(`Subtitle download failed for S${seasonNumber}E${episodeNumber}`);
      return null;
    }

    const downloadData = await downloadResponse.json();
    if (!downloadData.link) return null;

    const subtitleResponse = await fetch(downloadData.link);
    const subtitleText = await subtitleResponse.text();
    
    subtitleCache.set(cacheKey, subtitleText);
    console.log(`Cached subtitles for S${seasonNumber}E${episodeNumber}`);
    
    return parseSRT(subtitleText);
  } catch (error) {
    console.error(`Error fetching subtitles for S${seasonNumber}E${episodeNumber}:`, error);
    return null;
  }
}

// Chunk subtitle entries into semantic blocks
function chunkSubtitles(entries: SubtitleEntry[], maxSeconds: number): string[] {
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let chunkStartTime = 0;
  
  for (const entry of entries) {
    if (entry.start - chunkStartTime >= maxSeconds && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [entry.text];
      chunkStartTime = entry.start;
    } else {
      currentChunk.push(entry.text);
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  
  return chunks;
}

// Summarize episode subtitles into plot bullets
async function summarizeEpisode(
  chunks: string[],
  maxBullets: number,
  episodeLabel: string,
  lovableApiKey: string
): Promise<string[]> {
  try {
    const prompt = `Summarize the following TV episode content into exactly ${maxBullets} concise plot bullets. Focus ONLY on:
- Major actions and decisions
- Key discoveries or revelations
- Location changes
- Character relationship developments

DO NOT include:
- Dialogue quotes
- Minor details
- Speculation

Episode: ${episodeLabel}
Content: ${chunks.join(' ')}

Return ONLY the bullet points, one per line, starting with "- ".`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a plot summarizer. Extract key events only, no dialogue quotes.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Summarization failed for ${episodeLabel}:`, response.status);
      return [];
    }

    const data = await response.json();
    const summary = data.choices[0].message.content;
    
    const bullets = summary.split('\n')
      .filter((line: string) => line.trim().startsWith('-'))
      .map((line: string) => line.trim())
      .slice(0, maxBullets);
    
    return bullets;
  } catch (error) {
    console.error(`Error summarizing ${episodeLabel}:`, error);
    return [];
  }
}

// Fetch multi-episode context
async function getMultiEpisodeContext(
  tmdbId: number,
  currentSeason: number,
  currentEpisode: number,
  currentTimestamp: number,
  apiKey: string,
  lovableApiKey: string
): Promise<{ priorBullets: string[], currentBullets: string[] }> {
  const priorBullets: string[] = [];
  const currentBullets: string[] = [];
  
  // Fetch previous episodes
  const episodesToFetch: Array<{season: number, episode: number}> = [];
  for (let ep = currentEpisode - 1; ep >= Math.max(1, currentEpisode - EPISODE_CONTEXT_WINDOW); ep--) {
    episodesToFetch.push({ season: currentSeason, episode: ep });
  }
  
  console.log(`Fetching ${episodesToFetch.length} prior episodes for context`);
  
  for (const { season, episode } of episodesToFetch.reverse()) {
    const entries = await fetchEpisodeSubtitles(tmdbId, season, episode, apiKey);
    if (entries && entries.length > 0) {
      const chunks = chunkSubtitles(entries, CHUNK_SECONDS);
      const bullets = await summarizeEpisode(chunks, PER_EPISODE_BULLETS, `S${season}E${episode}`, lovableApiKey);
      if (bullets.length > 0) {
        priorBullets.push(`**S${season}E${episode}:**\n${bullets.join('\n')}`);
      }
    }
  }
  
  // Fetch current episode up to timestamp
  const currentEntries = await fetchEpisodeSubtitles(tmdbId, currentSeason, currentEpisode, apiKey);
  if (currentEntries && currentEntries.length > 0) {
    const filteredEntries = currentEntries.filter(e => e.end <= currentTimestamp);
    console.log(`Current episode: ${filteredEntries.length} subtitle entries up to timestamp`);
    
    if (filteredEntries.length > 0) {
      const chunks = chunkSubtitles(filteredEntries, CHUNK_SECONDS);
      const bullets = await summarizeEpisode(chunks, CURRENT_EPISODE_BULLETS, `S${currentSeason}E${currentEpisode} (so far)`, lovableApiKey);
      currentBullets.push(...bullets);
    }
  }
  
  return { priorBullets, currentBullets };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdbId, mediaType, seasonNumber, episodeNumber, title, timestamp, question } = await req.json();
    
    console.log('Spoiler-free request:', { tmdbId, mediaType, seasonNumber, episodeNumber, title, timestamp, question });

    // Validate required fields
    if (!tmdbId || !mediaType || !timestamp || !question) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tmdbId, mediaType, timestamp, question' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const OPENSUBTITLES_API_KEY = Deno.env.get('OPENSUBTITLES_API_KEY');
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    if (!OPENSUBTITLES_API_KEY) {
      throw new Error('OPENSUBTITLES_API_KEY is not configured');
    }

    // Fetch TMDb metadata for validation
    const tmdbMetadata = await getTMDbMetadata(tmdbId, mediaType, seasonNumber, episodeNumber, TMDB_API_KEY);
    
    if (!tmdbMetadata) {
      console.log('Could not validate TMDb metadata');
    }

    // Parse timestamp to seconds
    const currentSeconds = timestampToSeconds(timestamp);

    // Check if this is a TV show
    if (mediaType !== 'tv' || !seasonNumber || !episodeNumber) {
      return new Response(
        JSON.stringify({ 
          answer: "Multi-episode summaries are currently only supported for TV shows. For movies, please ask specific questions about the content." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch multi-episode context with hierarchical summarization
    const { priorBullets, currentBullets } = await getMultiEpisodeContext(
      tmdbId,
      seasonNumber,
      episodeNumber,
      currentSeconds,
      OPENSUBTITLES_API_KEY,
      LOVABLE_API_KEY
    );

    if (currentBullets.length === 0) {
      return new Response(
        JSON.stringify({ 
          answer: "I don't have enough subtitle data up to this point to explain without risking spoilers. The subtitle database may not have this episode yet." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Context: ${priorBullets.length} prior episode summaries, ${currentBullets.length} current episode bullets`);

    // Build context for AI
    const metadataContext = tmdbMetadata ? `
Title: ${tmdbMetadata.title || tmdbMetadata.name}
Season ${seasonNumber}, Episode ${episodeNumber}
Year: ${tmdbMetadata.release_date?.split('-')[0] || tmdbMetadata.first_air_date?.split('-')[0] || 'N/A'}
` : '';

    const priorContext = priorBullets.length > 0 
      ? `\n\nPREVIOUS EPISODES:\n${priorBullets.join('\n\n')}`
      : '';

    const currentContext = `\n\nCURRENT EPISODE (S${seasonNumber}E${episodeNumber} up to ${timestamp}):\n${currentBullets.join('\n')}`;

    // Create context-aware system prompt
    const systemPrompt = `You are a spoiler-free TV companion assistant. Your role is to answer questions about shows WITHOUT revealing any spoilers.

CRITICAL RULES:
1. The user is watching "${title}" at Season ${seasonNumber}, Episode ${episodeNumber}, timestamp ${timestamp}
2. You have plot bullet summaries from previous episodes and the current episode up to this timestamp
3. Base your answers ONLY on the provided plot bullets - these represent everything that has happened so far
4. If asked "what's happened so far?", provide a coherent narrative summary (4-6 sentences) describing the story progression without quoting dialogue
5. For specific questions, answer directly using the plot bullets provided
6. NEVER include or infer events after the provided timestamp or from later episodes
7. NEVER speculate about future plot points, endings, or twists
8. If asked about the future, refuse politely: "I can't answer that without spoiling what happens next"
9. Keep responses concise, narrative, and spoiler-safe

${metadataContext}

Your goal is to enhance viewing experience by providing accurate explanations of past events without ruining future surprises.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `User's question: "${question}"${priorContext}${currentContext}\n\nAnswer the question using ONLY the plot bullets provided above. Provide a coherent narrative response without quoting dialogue.` 
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    console.log('AI response generated successfully');

    return new Response(
      JSON.stringify({ answer }),
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
