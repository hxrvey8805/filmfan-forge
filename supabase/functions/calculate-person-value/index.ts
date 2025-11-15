import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personName, personType, personId } = await req.json();
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get additional context from TMDB
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    let tmdbContext = '';
    
    if (personId) {
      try {
        const personResponse = await fetch(
          `https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_API_KEY}`
        );
        const personData = await personResponse.json();
        
        const creditsResponse = await fetch(
          `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`
        );
        const creditsData = await creditsResponse.json();
        
        const notableWorks = creditsData.cast?.slice(0, 5).map((c: any) => c.title || c.name).join(', ') || 
                            creditsData.crew?.slice(0, 5).map((c: any) => c.title || c.name).join(', ') || 'Unknown';
        
        tmdbContext = `\nPopularity: ${personData.popularity || 'Unknown'}\nTotal Credits: ${(creditsData.cast?.length || 0) + (creditsData.crew?.length || 0)}\nNotable Works: ${notableWorks}`;
      } catch (e) {
        console.error('Error fetching TMDB data:', e);
      }
    }

    // Use Lovable AI to determine accurate pricing
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `You are an expert in entertainment industry valuation. Your task is to accurately price actors and directors for a trading card game based on their real-world fame, career achievements, and cultural impact.

Pricing Guidelines:
- Base price: 10 coins (minimum for any person)
- Unknown/Minor actors: 10-30 coins
- Working professionals: 30-80 coins
- Well-known actors/directors: 80-200 coins
- Famous stars (e.g., regular leading roles, multiple hits): 200-500 coins
- A-list celebrities (e.g., Tom Hanks, Meryl Streep, Spielberg): 500-1500 coins
- Legendary icons (e.g., Robert De Niro, Scorsese, top tier stars): 1500-3000 coins
- Cultural phenomena (e.g., absolute top tier, multiple Oscars): 3000+ coins

Consider:
- Career longevity and consistency
- Box office success and popularity
- Critical acclaim and awards (Oscars, Golden Globes, etc.)
- Cultural impact and recognition
- Current relevance vs historical significance
- For directors: add 30% bonus as they're typically more valuable

Return ONLY a JSON object with: {"price": number, "reasoning": "brief explanation"}`;

    const userPrompt = `Determine the accurate price for: ${personName} (${personType})${tmdbContext}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculate_value',
              description: 'Calculate the card value for a person',
              parameters: {
                type: 'object',
                properties: {
                  price: {
                    type: 'number',
                    description: 'The calculated price in coins'
                  },
                  reasoning: {
                    type: 'string',
                    description: 'Brief explanation of the pricing'
                  }
                },
                required: ['price', 'reasoning'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'calculate_value' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      // Fallback to basic calculation
      const fallbackPrice = personType === 'director' ? 50 : 30;
      return new Response(
        JSON.stringify({ 
          price: fallbackPrice, 
          reasoning: 'AI service unavailable, using default pricing' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const result = JSON.parse(toolCall.function.arguments);
    console.log(`AI Pricing for ${personName}: ${result.price} coins - ${result.reasoning}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        price: 30,
        reasoning: 'Error calculating price, using default'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
