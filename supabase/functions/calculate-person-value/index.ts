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
    let tmdbPopularity = 0;
    let tmdbCredits = 0;
    let personTypeValue = personType; // Store for error handler
    
    if (personId) {
      try {
        const personResponse = await fetch(
          `https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_API_KEY}`
        );
        const personData = await personResponse.json();
        tmdbPopularity = personData.popularity || 0;
        
        const creditsResponse = await fetch(
          `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${TMDB_API_KEY}`
        );
        const creditsData = await creditsResponse.json();
        
        const castCredits = creditsData.cast || [];
        const crewCredits = creditsData.crew || [];
        tmdbCredits = castCredits.length + crewCredits.length;
        
        // Get top 10 most popular works with ratings
        const allWorks = [...castCredits, ...crewCredits]
          .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
          .slice(0, 10);
        
        const topWorks = allWorks.map((w: any) => 
          `${w.title || w.name} (${w.vote_average?.toFixed(1) || 'N/A'}⭐)`
        ).join(', ');
        
        // Calculate career span
        const years = [...castCredits, ...crewCredits]
          .map((c: any) => c.release_date || c.first_air_date)
          .filter(Boolean)
          .map((d: string) => new Date(d).getFullYear())
          .sort();
        const careerSpan = years.length > 0 ? `${years[0]}-${years[years.length - 1]}` : 'Unknown';
        
        // Calculate average rating
        const worksWithRatings = [...castCredits, ...crewCredits].filter((w: any) => w.vote_average > 0);
        const avgRating = worksWithRatings.length > 0
          ? (worksWithRatings.reduce((sum: number, w: any) => sum + w.vote_average, 0) / worksWithRatings.length).toFixed(1)
          : 'N/A';
        
        tmdbContext = `
Popularity: ${tmdbPopularity.toFixed(1)}
Total Credits: ${tmdbCredits} (${castCredits.length} cast, ${crewCredits.length} crew)
Career Span: ${careerSpan}
Average Rating: ${avgRating}⭐
Top Works: ${topWorks || 'Unknown'}
Known For: ${personData.known_for_department || 'Unknown'}`;
        
        console.log(`TMDB Data for ${personName}:`, tmdbContext);
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

CRITICAL: Maximum price is 500 coins. This represents the absolute top tier of entertainment industry legends.

Pricing Guidelines (10-500 coin range):
- Unknown/Minor (10-30 coins): Popularity <5, <20 credits, no recognizable roles or major works
- Emerging Talent (30-80 coins): Popularity 5-15, 20-50 credits, TV series or supporting film roles
- Working Professional (80-150 coins): Popularity 15-25, 50-100 credits, regular film work, character actors
- Established Star (150-250 coins): Popularity 25-40, 100+ credits, leading roles in successful films
- A-List Celebrity (250-400 coins): Popularity 40-60, multiple hit films, award nominations, household name (e.g., Matt Damon, Leonardo DiCaprio)
- Legendary Icon (400-500 coins): Popularity 60+, multiple major awards, career-defining roles, cultural impact (e.g., Tom Hanks, Meryl Streep, Spielberg, Scorsese)

Consider:
- TMDB popularity score (most important metric)
- Total number of credits and career span
- Average rating of their works
- Box office success and critical acclaim
- Awards (Oscars, Golden Globes, etc.)
- Cultural impact and household name recognition
- For directors: add 20% bonus (max 500 coins total)

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

    // Improved fallback calculation based on TMDB data
    const calculateFallbackPrice = (popularity: number, credits: number, personType: string): number => {
      let price = 10; // base price
      
      // Popularity contribution (0-250 coins)
      price += Math.min(Math.round(popularity * 5), 250);
      
      // Credits contribution (0-150 coins)
      price += Math.min(Math.round(credits * 1.5), 150);
      
      // Director bonus (+20%)
      if (personType === 'director') {
        price = Math.round(price * 1.2);
      }
      
      // Cap at 500
      return Math.min(price, 500);
    };

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      // Use data-driven fallback
      const fallbackPrice = calculateFallbackPrice(tmdbPopularity, tmdbCredits, personType);
      console.log(`Fallback pricing for ${personName}: ${fallbackPrice} coins (Popularity: ${tmdbPopularity}, Credits: ${tmdbCredits})`);
      
      return new Response(
        JSON.stringify({ 
          price: fallbackPrice, 
          reasoning: 'AI service unavailable, using TMDB-based pricing' 
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
    let finalPrice = result.price;
    
    // Price validation and capping based on TMDB data
    const originalPrice = finalPrice;
    if (tmdbPopularity < 5) {
      finalPrice = Math.min(finalPrice, 50);
    } else if (tmdbPopularity < 15) {
      finalPrice = Math.min(finalPrice, 100);
    } else if (tmdbPopularity < 30) {
      finalPrice = Math.min(finalPrice, 200);
    } else if (tmdbPopularity < 50) {
      finalPrice = Math.min(finalPrice, 350);
    }
    
    // Hard cap at 500 coins
    finalPrice = Math.min(finalPrice, 500);
    
    // Ensure minimum price
    finalPrice = Math.max(finalPrice, 10);
    
    const validationNote = originalPrice !== finalPrice 
      ? ` (adjusted from ${originalPrice} based on popularity ${tmdbPopularity.toFixed(1)})` 
      : '';
    
    console.log(`AI Pricing for ${personName}: ${finalPrice} coins${validationNote} - ${result.reasoning}`);

    return new Response(
      JSON.stringify({ 
        price: finalPrice, 
        reasoning: result.reasoning 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        price: 30,
        reasoning: 'Error calculating price, using fallback'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
