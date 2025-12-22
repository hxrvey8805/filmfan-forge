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

// Use Claude to annotate speakers in subtitle chunks
async function annotateChunkWithSpeakers(
  chunkContent: string,
  characterList: string[],
  showTitle: string,
  seasonEp: string,
  lovableApiKey: string
): Promise<string> {
  const characterContext = characterList.length > 0
    ? `**MAIN CHARACTERS:**\n${characterList.join('\n')}`
    : 'Character list not available - use context clues from dialogue.';
  
  const systemPrompt = `You are a script editor annotating a subtitle transcript from "${showTitle}" (${seasonEp}).

Your job: Add speaker names to each line of dialogue where you can identify the speaker.

${characterContext}

**RULES:**
1. Only identify speakers you are CONFIDENT about based on:
   - Names mentioned in dialogue (e.g., "Will, come on" → next line is likely from someone calling Will)
   - Context clues (e.g., "Mom does it when she's out of Valium" suggests a child speaking about their mother)
   - Characteristic speech patterns or catchphrases
   - Dialogue exchanges that clearly indicate speakers

2. If uncertain, mark as [UNKNOWN] or leave the speaker blank

3. Format: Change "[timestamp] dialogue" to "[timestamp] **SPEAKER:** dialogue"

4. Preserve ALL original timestamps and dialogue exactly - only add speaker attributions

5. For action/narration lines without clear speakers, you may mark as [NARRATOR] or [ACTION]

6. When multiple people speak in rapid succession with "-" markers like "-Come on. -Wait for me!", split them properly:
   "[timestamp] **PERSON_A:** Come on. **PERSON_B:** Wait for me!"

Return the fully annotated chunk. Keep it clean and readable.`;

  const userPrompt = `Annotate speakers in this subtitle chunk:\n\n${chunkContent}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Using Pro for better understanding
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI annotation error:', response.status, errorText);
      return chunkContent; // Return original if annotation fails
    }

    const data = await response.json();
    const annotated = data.choices[0]?.message?.content;
    
    if (!annotated || annotated.length < chunkContent.length * 0.5) {
      console.warn('Annotation seems incomplete, using original');
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

    // Process chunks in batches to avoid rate limits
    let updatedCount = 0;
    const BATCH_SIZE = 3; // Small batches to avoid rate limits
    
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const annotationPromises = batch.map(chunk => 
        annotateChunkWithSpeakers(
          chunk.content,
          characterList,
          title || 'Unknown Show',
          seasonEp,
          LOVABLE_API_KEY
        )
      );
      
      const annotatedContents = await Promise.all(annotationPromises);
      
      // Update each chunk
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const annotatedContent = annotatedContents[j];
        
        if (annotatedContent !== chunk.content) {
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
      }
      
      console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
      
      // Delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await delay(1500); // 1.5s delay to respect rate limits
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
