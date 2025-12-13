import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    
    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { table = 'subtitle_chunks', batchSize = 10 } = await req.json().catch(() => ({}));
    
    console.log(`Backfilling embeddings for ${table} with batch size ${batchSize}`);
    
    let processed = 0;
    let failed = 0;
    
    if (table === 'subtitle_chunks' || table === 'all') {
      // Get subtitle chunks without embeddings
      const { data: chunks, error: fetchError } = await supabase
        .from('subtitle_chunks')
        .select('id, content')
        .is('embedding', null)
        .limit(batchSize);
      
      if (fetchError) {
        console.error('Error fetching chunks:', fetchError);
        throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
      }
      
      if (chunks && chunks.length > 0) {
        console.log(`Found ${chunks.length} subtitle chunks without embeddings`);
        
        for (const chunk of chunks) {
          const embedding = await generateEmbedding(chunk.content, OPENAI_API_KEY);
          
          if (embedding) {
            const { error: updateError } = await supabase
              .from('subtitle_chunks')
              .update({ embedding })
              .eq('id', chunk.id);
            
            if (updateError) {
              console.error(`Failed to update chunk ${chunk.id}:`, updateError);
              failed++;
            } else {
              processed++;
              console.log(`Updated chunk ${chunk.id}`);
            }
          } else {
            failed++;
          }
          
          // Small delay to respect rate limits
          await delay(100);
        }
      } else {
        console.log('No subtitle chunks need backfilling');
      }
    }
    
    if (table === 'season_summaries' || table === 'all') {
      // Get season summaries without embeddings
      const { data: summaries, error: fetchError } = await supabase
        .from('season_summaries')
        .select('id, season_name, overview, episode_summaries')
        .is('embedding', null)
        .limit(batchSize);
      
      if (fetchError) {
        console.error('Error fetching summaries:', fetchError);
        throw new Error(`Failed to fetch summaries: ${fetchError.message}`);
      }
      
      if (summaries && summaries.length > 0) {
        console.log(`Found ${summaries.length} season summaries without embeddings`);
        
        for (const summary of summaries) {
          // Build text for embedding
          const episodes = summary.episode_summaries as { episode: number; name: string; overview: string }[] || [];
          const embeddingText = [
            `${summary.season_name}: ${summary.overview || ''}`,
            ...episodes.map(ep => `Episode ${ep.episode}: ${ep.name} - ${ep.overview}`),
          ].join('\n');
          
          const embedding = await generateEmbedding(embeddingText, OPENAI_API_KEY);
          
          if (embedding) {
            const { error: updateError } = await supabase
              .from('season_summaries')
              .update({ embedding })
              .eq('id', summary.id);
            
            if (updateError) {
              console.error(`Failed to update summary ${summary.id}:`, updateError);
              failed++;
            } else {
              processed++;
              console.log(`Updated summary ${summary.id}`);
            }
          } else {
            failed++;
          }
          
          await delay(100);
        }
      } else {
        console.log('No season summaries need backfilling');
      }
    }
    
    // Check remaining counts
    const { count: remainingChunks } = await supabase
      .from('subtitle_chunks')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);
    
    const { count: remainingSummaries } = await supabase
      .from('season_summaries')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);
    
    console.log(`Backfill complete: ${processed} processed, ${failed} failed`);
    console.log(`Remaining: ${remainingChunks || 0} chunks, ${remainingSummaries || 0} summaries`);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        processed,
        failed,
        remaining: {
          subtitle_chunks: remainingChunks || 0,
          season_summaries: remainingSummaries || 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in backfill-embeddings:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
