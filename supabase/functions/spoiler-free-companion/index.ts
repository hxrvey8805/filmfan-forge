import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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

// Helper function to parse episode string (e.g., "S1E3" or "Season 1 Episode 3")
function parseEpisode(episode: string): { season: number; episode: number } | null {
  // Try "S1E3" format
  let match = episode.match(/S(\d+)E(\d+)/i);
  if (match) {
    return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  }
  
  // Try "Season 1 Episode 3" format
  match = episode.match(/Season\s+(\d+)\s+Episode\s+(\d+)/i);
  if (match) {
    return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  }
  
  return null;
}

// Helper function to search and download subtitles using TMDb ID
async function getSubtitleContext(
  tmdbId: number, 
  mediaType: string, 
  seasonNumber: number | undefined, 
  episodeNumber: number | undefined,
  timestamp: string, 
  apiKey: string
) {
  try {
    const currentSeconds = timestampToSeconds(timestamp);
    
    console.log('Searching subtitles with TMDb ID:', { tmdbId, mediaType, seasonNumber, episodeNumber, currentSeconds });
    
    // Search for subtitles using TMDb ID
    let searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?tmdb_id=${tmdbId}&languages=en&order_by=download_count&order_direction=desc`;
    
    if (mediaType === 'tv' && seasonNumber && episodeNumber) {
      searchUrl += `&season_number=${seasonNumber}&episode_number=${episodeNumber}&type=episode`;
    } else if (mediaType === 'movie') {
      searchUrl += `&type=movie`;
    }
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('OpenSubtitles search failed:', searchResponse.status);
      return null;
    }

    const searchData = await searchResponse.json();
    console.log('Found subtitles using TMDb ID:', searchData.data?.length || 0);
    
    const results: any[] = searchData.data || [];
    if (results.length === 0) {
      console.log('No subtitles found for TMDb ID:', tmdbId);
      return null;
    }

    // Since we're searching by TMDb ID, the results should be accurate
    // Sort by download count and take the best one
    results.sort((a, b) => (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0));
    
    const best = results[0];
    
    if (!best?.attributes?.files?.[0]?.file_id) {
      console.log('No valid subtitle file found');
      return null;
    }

    const chosenF = best.attributes?.feature_details || {};
    const chosenFileName = best.attributes?.files?.[0]?.file_name;
    console.log('Selected subtitle:', {
      tmdbId: chosenF.tmdb_id,
      title: chosenF.parent_title || chosenF.title || best.attributes?.feature,
      season: chosenF.season_number,
      episode: chosenF.episode_number,
      downloads: best.attributes?.download_count,
      fileName: chosenFileName,
    });

    // Download the subtitle file
    const downloadResponse = await fetch(`https://api.opensubtitles.com/api/v1/download`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: best.attributes.files[0].file_id }),
    });

    if (!downloadResponse.ok) {
      console.error('Subtitle download failed:', downloadResponse.status);
      return null;
    }

    const downloadData = await downloadResponse.json();
    
    if (!downloadData.link) {
      console.log('No download link provided');
      return null;
    }

    // Fetch the actual subtitle content
    const subtitleResponse = await fetch(downloadData.link);
    const subtitleText = await subtitleResponse.text();
    
    // Parse SRT format and extract relevant dialogue up to current timestamp
    const dialogueLines: string[] = [];
    const srtBlocks = subtitleText.split('\n\n');
    
    for (const block of srtBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;
      
      // Parse timestamp (format: 00:00:20,000 --> 00:00:22,000)
      const timeLine = lines[1];
      const startTime = timeLine.split(' --> ')[0];
      const timeMatch = startTime.match(/(\d+):(\d+):(\d+)/);
      
      if (timeMatch) {
        const subtitleSeconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        
        // Only include dialogue up to current timestamp
        if (subtitleSeconds <= currentSeconds) {
          const raw = lines.slice(2).join(' ');
          const dialogue = raw
            .replace(/<[^>]*>/g, '') // HTML tags
            .replace(/\[[^\]]*\]/g, '') // [SOUND]
            .replace(/\([^)]*\)/g, '') // (music)
            .replace(/\s+/g, ' ')
            .trim();
          if (dialogue) {
            dialogueLines.push(dialogue);
          }
        }
      }
    }
    
    // Deduplicate consecutive lines and return recent context
    const uniqueLines: string[] = [];
    for (const d of dialogueLines) {
      if (uniqueLines[uniqueLines.length - 1] !== d) uniqueLines.push(d);
    }
    const recentDialogue = uniqueLines.slice(-50).join('\n');
    console.log(`Extracted ${uniqueLines.length} lines of dialogue up to timestamp`);
    
    return recentDialogue;

  } catch (error) {
    console.error('Error fetching subtitles:', error);
    return null;
  }
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

    // Try to get subtitle context with actual dialogue using TMDb ID
    const subtitleDialogue = await getSubtitleContext(
      tmdbId, 
      mediaType, 
      seasonNumber, 
      episodeNumber, 
      timestamp, 
      OPENSUBTITLES_API_KEY
    );
    
    if (!subtitleDialogue) {
      console.log('No subtitle data found for TMDb ID:', tmdbId);
      return new Response(
        JSON.stringify({ 
          answer: "I can't find matching subtitles for this content at the specified timestamp, so I don't want to risk giving a spoiler. The subtitle database may not have this episode yet, or the timing might be off." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using actual subtitle dialogue for context');

    // Build context string with metadata
    const metadataContext = tmdbMetadata ? `
Title: ${tmdbMetadata.title || tmdbMetadata.name}
${mediaType === 'tv' && seasonNumber && episodeNumber ? `Season ${seasonNumber}, Episode ${episodeNumber}` : ''}
Year: ${tmdbMetadata.release_date?.split('-')[0] || tmdbMetadata.first_air_date?.split('-')[0] || 'N/A'}
` : '';

    // Create context-aware system prompt
    const systemPrompt = `You are a spoiler-free TV/movie companion assistant. Your role is to answer questions about shows and movies WITHOUT revealing any spoilers.

CRITICAL RULES:
1. The user is currently watching "${title}" at timestamp ${timestamp}
2. You have access to the ACTUAL DIALOGUE AND SUBTITLES up to this exact timestamp
3. Base your answers ONLY on the provided subtitle text - this represents everything that has happened so far
4. Answer questions about events, characters, and plot points that have ALREADY OCCURRED up to this timestamp
5. Provide DETAILED, specific answers using the actual dialogue provided
6. Quote or reference specific lines from the subtitles when helpful
7. NEVER say "that hasn't happened" or "that didn't happen" - if something isn't in the subtitles, say: "I can't confirm that from the subtitles up to this point, but based on what's been shown so far..."
8. NEVER reveal or speculate about events beyond the provided timestamp
9. If asked about the future, endings, or plot twists, refuse politely: "I can't answer that without spoiling what happens next"
10. Use TMDb metadata (title, year, cast) only for context - NOT for plot events

${metadataContext}

Your goal is to enhance viewing experience by providing accurate, detailed explanations of past events using the actual subtitle data, without ruining future surprises.`;

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
            content: `User's question: "${question}"\n\nACTUAL SUBTITLE TEXT (up to timestamp ${timestamp}):\n${subtitleDialogue}\n\nAnswer the question using ONLY the subtitle text provided above. Be specific and detailed, referencing actual dialogue when helpful.` 
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
