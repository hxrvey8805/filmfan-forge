import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to delay between API calls
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch cast from TMDB
async function getTMDbCast(
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  seasonNumber?: number,
  episodeNumber?: number,
  apiKey?: string
): Promise<string[]> {
  if (!apiKey) return [];
  
  try {
    let castUrl: string;
    
    if (mediaType === 'tv' && seasonNumber && episodeNumber) {
      // Get episode-specific credits
      castUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}/credits?api_key=${apiKey}`;
    } else if (mediaType === 'tv') {
      // Get aggregate cast for series
      castUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&append_to_response=aggregate_credits`;
    } else {
      castUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`;
    }
    
    const response = await fetch(castUrl);
    if (!response.ok) return [];
    
    const data = await response.json();
    
    // Extract character names
    let cast: any[] = [];
    
    if (mediaType === 'tv' && data.cast) {
      cast = data.cast;
    } else if (mediaType === 'tv' && data.aggregate_credits?.cast) {
      cast = data.aggregate_credits.cast;
    } else if (data.credits?.cast) {
      cast = data.credits.cast;
    }
    
    // Build list of "Character (Actor)" for the AI
    const characters: string[] = [];
    const seen = new Set<string>();
    
    for (const member of cast.slice(0, 25)) {
      const actor = member.name || member.original_name;
      let character = member.character || member.roles?.[0]?.character;
      
      if (!character) continue;
      
      // Clean up character name
      character = character.replace(/\(voice\)/i, '').replace(/\(uncredited\)/i, '').trim();
      
      const key = character.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      
      characters.push(`${character} (played by ${actor})`);
    }
    
    return characters;
  } catch (error) {
    console.error('Error fetching TMDB cast:', error);
    return [];
  }
}

// Use AI to annotate speakers in subtitle chunks
async function annotateChunkWithSpeakers(
  chunkContent: string,
  characterList: string[],
  showTitle: string,
  seasonEp: string,
  lovableApiKey: string
): Promise<string> {
  const characterContext = characterList.length > 0
    ? `CHARACTERS: ${characterList.slice(0, 15).join(', ')}`
    : '';
  
  const systemPrompt = `You annotate TV subtitles with speaker names. Add **SPEAKER:** before each line of dialogue.

${characterContext}

Rules:
1. Format: [timestamp] **SPEAKER:** dialogue
2. If unsure of speaker, use **UNKNOWN:**
3. Split multi-speaker lines: "-Come on. -Wait!" → **PERSON_A:** Come on. **PERSON_B:** Wait!
4. Keep ALL timestamps and dialogue exactly as given
5. Return the COMPLETE annotated text - do not summarize or shorten`;

  const userPrompt = `Annotate this ${showTitle} (${seasonEp}) subtitle chunk with speaker names:\n\n${chunkContent}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', // Flash is faster and sufficient for this task
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error('Lovable AI annotation error:', response.status);
      return chunkContent;
    }

    const data = await response.json();
    const annotated = data.choices?.[0]?.message?.content;
    
    if (!annotated) {
      console.warn('No annotation content returned');
      return chunkContent;
    }
    
    // Check if annotation contains speaker markers
    if (!/\*\*[A-Z]/.test(annotated)) {
      console.warn('Annotation lacks speaker markers, using original');
      return chunkContent;
    }
    
    return annotated;
  } catch (error) {
    console.error('Error annotating chunk:', error);
    return chunkContent;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdbId, mediaType, seasonNumber, episodeNumber, title, forceReprocess } = await req.json();
    
    console.log('Annotate speakers request:', { tmdbId, mediaType, seasonNumber, episodeNumber, title });
    
    if (!tmdbId || !mediaType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tmdbId, mediaType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch existing chunks
    let query = supabase
      .from('subtitle_chunks')
      .select('id, chunk_index, content, start_seconds, end_seconds')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .order('chunk_index', { ascending: true });

    if (mediaType === 'tv') {
      query = query.eq('season_number', seasonNumber).eq('episode_number', episodeNumber);
    }

    const { data: chunks, error: fetchError } = await query;

    if (fetchError || !chunks || chunks.length === 0) {
      console.log('No chunks found to annotate');
      return new Response(
        JSON.stringify({ success: false, message: 'No subtitle chunks found. Please process subtitles first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already annotated (look for **SPEAKER:** pattern)
    const sampleChunk = chunks[Math.floor(chunks.length / 2)];
    const hasAnnotations = /\*\*[A-Z][A-Za-z\s]+:\*\*/.test(sampleChunk.content);
    
    if (hasAnnotations && !forceReprocess) {
      console.log('Chunks already appear to be annotated');
      return new Response(
        JSON.stringify({ success: true, message: 'Already annotated', chunksUpdated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch cast from TMDB
    const characterList = await getTMDbCast(tmdbId, mediaType, seasonNumber, episodeNumber, TMDB_API_KEY);
    console.log(`Fetched ${characterList.length} characters from TMDB`);

    const seasonEp = mediaType === 'tv' 
      ? `Season ${seasonNumber}, Episode ${episodeNumber}`
      : 'Movie';

    // Process chunks sequentially to avoid rate limits and timeouts
    let updatedCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const annotatedContent = await annotateChunkWithSpeakers(
        chunk.content,
        characterList,
        title || 'Unknown Show',
        seasonEp,
        LOVABLE_API_KEY
      );
      
      if (annotatedContent !== chunk.content && /\*\*[A-Z]/.test(annotatedContent)) {
        const { error: updateError } = await supabase
          .from('subtitle_chunks')
          .update({ content: annotatedContent })
          .eq('id', chunk.id);
        
        if (updateError) {
          console.error(`Error updating chunk ${chunk.id}:`, updateError);
        } else {
          updatedCount++;
        }
      }
      
      console.log(`Processed chunk ${i + 1}/${chunks.length}`);
      
      // Small delay between chunks
      if (i < chunks.length - 1) {
        await delay(500);
      }
    }

    console.log(`Annotated ${updatedCount}/${chunks.length} chunks with speaker information`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        chunksUpdated: updatedCount,
        totalChunks: chunks.length,
        charactersFound: characterList.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in annotate-speakers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
