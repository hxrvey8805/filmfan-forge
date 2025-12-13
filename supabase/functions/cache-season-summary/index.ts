import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate embedding using Gemini via Lovable AI gateway
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `You are an embedding generator. Generate a 384-dimensional embedding vector for semantic search. 
Output ONLY a JSON array of 384 floating point numbers between -1 and 1, no other text.
The embedding should capture the semantic meaning of the input text for similarity matching.`
          },
          {
            role: 'user',
            content: `Generate embedding for: "${text.slice(0, 500)}"`
          }
        ],
        temperature: 0,
        max_tokens: 4000,
      }),
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.error('Embedding rate limit hit');
        return null;
      }
      console.error('Embedding API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse the JSON array from the response
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error('Failed to parse embedding from response');
      return null;
    }
    
    const embedding = JSON.parse(match[0]);
    if (!Array.isArray(embedding) || embedding.length !== 384) {
      console.error('Invalid embedding dimensions:', embedding.length);
      return null;
    }
    
    return embedding;
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
    const { tmdbId, seasonNumber } = await req.json();
    
    console.log('Cache season summary request:', { tmdbId, seasonNumber });
    
    if (!tmdbId || seasonNumber === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tmdbId, seasonNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured');
    }
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    // Create Supabase client with service role for inserts
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Check if already cached
    const { data: existing } = await supabase
      .from('season_summaries')
      .select('id')
      .eq('tmdb_id', tmdbId)
      .eq('season_number', seasonNumber)
      .limit(1);
    
    if (existing && existing.length > 0) {
      console.log('Season summary already cached, skipping');
      return new Response(
        JSON.stringify({ success: true, cached: true, message: 'Already cached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fetch season data from TMDB
    const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`;
    const response = await fetch(seasonUrl);
    
    if (!response.ok) {
      console.error('TMDB season fetch failed:', response.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch season data', status: response.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const seasonData = await response.json();
    
    const seasonName = seasonData.name || `Season ${seasonNumber}`;
    const overview = seasonData.overview || '';
    
    // Build episode summaries
    const episodeSummaries: { episode: number; name: string; overview: string }[] = [];
    
    if (seasonData.episodes && Array.isArray(seasonData.episodes)) {
      for (const ep of seasonData.episodes) {
        episodeSummaries.push({
          episode: ep.episode_number,
          name: ep.name || `Episode ${ep.episode_number}`,
          overview: ep.overview || '',
        });
      }
    }
    
    // Build text for embedding
    const embeddingText = [
      `${seasonName}: ${overview}`,
      ...episodeSummaries.map(ep => `Episode ${ep.episode}: ${ep.name} - ${ep.overview}`),
    ].join('\n');
    
    // Generate embedding
    const embedding = await generateEmbedding(embeddingText, LOVABLE_API_KEY);
    
    // Insert into database
    const { error: insertError } = await supabase
      .from('season_summaries')
      .upsert({
        tmdb_id: tmdbId,
        season_number: seasonNumber,
        season_name: seasonName,
        overview: overview,
        episode_summaries: episodeSummaries,
        embedding: embedding,
      }, {
        onConflict: 'tmdb_id,season_number',
        ignoreDuplicates: true
      });
    
    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store summary', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Successfully cached season ${seasonNumber} summary with ${episodeSummaries.length} episodes`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        cached: false,
        seasonName,
        episodeCount: episodeSummaries.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in cache-season-summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
