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

    const systemPrompt = `You are an expert in entertainment industry valuation. Price actors/directors based on their real-world fame, career achievements, and cultural impact.

CRITICAL: Maximum price is 500 coins. Use TMDB data holistically - don't rely on popularity alone.

Pricing Tiers with Examples (10-500 coin range):

- Unknown/Minor (10-30 coins): 
  * Popularity <5, <20 credits, no recognizable roles
  * Example: Background actors, one-time appearances

- Emerging Talent (30-80 coins):
  * Popularity 5-15, 20-50 credits, TV/supporting roles
  * Example: Rising stars, recurring TV actors

- Working Professional (80-150 coins):
  * Popularity 15-25, 50-100 credits, regular film work
  * Example: Character actors, TV series regulars

- Established Star (150-250 coins):
  * Popularity 25-40, 100+ credits, leading roles
  * Example: Chris Evans, Scarlett Johansson, Ryan Gosling

- A-List Celebrity (250-400 coins):
  * Popularity 40-60 OR major awards/cultural impact
  * Example: Matt Damon, Leonardo DiCaprio, Sandra Bullock
  * Note: Popularity may be lower but achievements/awards compensate

- Legendary Icon (400-500 coins):
  * Popularity 60+ OR multiple Oscars/cultural phenomenon
  * Example: Tom Hanks, Meryl Streep, Spielberg, Scorsese
  * Note: Directors often have lower popularity but massive impact

Consider beyond TMDB popularity:
- Awards (Oscars, Golden Globes, BAFTAs)
- Box office success (billion-dollar franchises)
- Career span and consistency
- Critical acclaim (top works ratings)
- Cultural impact (household name recognition)
- For directors: add 20% bonus (max 500 total)

Return ONLY JSON: {"price": number, "reasoning": "brief explanation"}`;

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

    // Multi-factor validation function
    const validatePrice = (
      aiPrice: number, 
      popularity: number, 
      credits: number, 
      careerSpan: string,
      personType: string
    ): number => {
      let validatedPrice = aiPrice;
      
      // Extract career length
      const spanMatch = careerSpan.match(/(\d{4})-(\d{4})/);
      const careerYears = spanMatch ? parseInt(spanMatch[1]) - parseInt(spanMatch[0]) : 0;
      
      // Only apply caps if multiple red flags exist
      const lowPopularity = popularity < 5;
      const fewCredits = credits < 20;
      const shortCareer = careerYears < 5;
      
      // Count red flags
      const redFlags = [lowPopularity, fewCredits, shortCareer].filter(Boolean).length;
      
      // Only cap if 2+ red flags (truly unknown/minor)
      if (redFlags >= 2) {
        validatedPrice = Math.min(validatedPrice, 50);
      }
      // Light validation for 1 red flag
      else if (redFlags === 1) {
        if (lowPopularity && credits > 50) {
          // Long career despite low popularity = character actor/cult figure
          validatedPrice = Math.min(validatedPrice, 300);
        } else if (fewCredits && popularity > 10) {
          // New but popular = emerging star
          validatedPrice = Math.min(validatedPrice, 200);
        }
      }
      
      // Director bonus consideration (they often have lower popularity)
      if (personType === 'director' && popularity < 15 && credits > 30) {
        // Trust AI more for directors with substantial work
        validatedPrice = Math.min(aiPrice, 500);
      }
      
      // Hard cap at 500
      return Math.min(validatedPrice, 500);
    };

    // Improved fallback calculation with more factors
    const calculateFallbackPrice = (
      popularity: number, 
      credits: number, 
      careerSpan: string,
      avgRating: string,
      personType: string
    ): number => {
      let price = 10;
      
      // Popularity (0-200 coins) - less weight than before
      price += Math.min(Math.round(popularity * 4), 200);
      
      // Credits (0-150 coins)
      price += Math.min(Math.round(credits * 1.5), 150);
      
      // Career longevity bonus (0-50 coins)
      const spanMatch = careerSpan.match(/(\d{4})-(\d{4})/);
      if (spanMatch) {
        const years = parseInt(spanMatch[1]) - parseInt(spanMatch[0]);
        price += Math.min(years * 2, 50);
      }
      
      // Quality bonus (0-50 coins)
      const rating = parseFloat(avgRating);
      if (!isNaN(rating) && rating >= 7) {
        price += Math.round((rating - 6) * 25);
      }
      
      // Director bonus (+20%)
      if (personType === 'director') {
        price = Math.round(price * 1.2);
      }
      
      return Math.min(price, 500);
    };

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      // Use data-driven fallback with career span and rating
      const careerSpan = tmdbContext.match(/Career Span: (.*)/)?.[1] || 'Unknown';
      const avgRating = tmdbContext.match(/Average Rating: ([0-9.]+)/)?.[1] || '0';
      const fallbackPrice = calculateFallbackPrice(tmdbPopularity, tmdbCredits, careerSpan, avgRating, personType);
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
    const aiPrice = result.price;

    // Smart multi-factor validation
    const careerSpan = tmdbContext.match(/Career Span: (.*)/)?.[1] || 'Unknown';
    const validatedPrice = validatePrice(
      aiPrice,
      tmdbPopularity,
      tmdbCredits,
      careerSpan,
      personType
    );

    const wasAdjusted = aiPrice !== validatedPrice;
    const adjustmentNote = wasAdjusted 
      ? ` (adjusted from ${aiPrice} using multi-factor validation)` 
      : '';

    console.log(`AI Pricing for ${personName}: ${validatedPrice} coins${adjustmentNote}`);
    console.log(`Reasoning: ${result.reasoning}`);
    console.log(`Factors: Popularity ${tmdbPopularity.toFixed(1)}, Credits ${tmdbCredits}, Career ${careerSpan}, Type ${personType}`);
    
    const finalPrice = validatedPrice;

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
