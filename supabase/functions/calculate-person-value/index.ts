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

    // Use Groq AI to determine accurate pricing
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const systemPrompt = `You are an expert in entertainment industry valuation. Price actors/directors based on their REAL-WORLD FAME, career achievements, and cultural impact.

CRITICAL RULES:
1. Maximum price is 500 coins
2. DO NOT rely solely on TMDB popularity scores - they can be inaccurate
3. PRIORITIZE: Name recognition, major roles, awards, box office success, cultural impact
4. Well-known actors/directors should be priced 150-500 coins, NOT 30-80 coins
5. If the person's name is recognizable to general audiences, they are NOT "emerging talent"

PRICING TIERS WITH SPECIFIC EXAMPLES (10-500 coin range):

- Unknown/Minor (10-30 coins): 
  * Truly unknown: Background actors, one-time appearances, no recognizable roles
  * Popularity <5 AND <20 credits AND no major works
  * Example: Day players, extras, unknown character actors

- Emerging Talent (30-80 coins):
  * Rising stars with recent breakout roles, but not yet household names
  * Popularity 5-20, 20-50 credits, some notable TV/film roles
  * Example: Actors in popular TV shows but not leads, supporting cast in major films
  * NOT well-known actors - if you recognize the name easily, they're higher tier

- Working Professional (80-150 coins):
  * Established character actors, TV series regulars, consistent work
  * Popularity 15-30, 50-150 credits, regular film/TV work
  * Example: Character actors you'd recognize but not A-list, TV series regulars (not leads)
  * If they've been in multiple major films/shows, price 100-150
  * If they're a regular cast member (not lead) in popular TV shows, price 80-120

- Established Star (150-250 coins):
  * Well-known actors with major roles, recognizable names
  * Popularity 25-50 OR 100+ credits with major works OR awards OR major TV series leads
  * Examples: Chris Evans, Scarlett Johansson, Ryan Gosling, Emma Stone, Bradley Cooper
  * TV Examples: Actors from major shows (The White Lotus, Succession, The Crown, Game of Thrones, etc.)
  * If they've starred in blockbusters, major TV shows, or won major awards, price 200-250
  * If they're a lead/significant cast member in a popular/critically acclaimed TV series, price 150-200

- A-List Celebrity (250-400 coins):
  * Household names, major stars, Oscar winners, franchise leads
  * Popularity 40-70 OR major awards (Oscars, Golden Globes) OR billion-dollar franchises
  * Examples: Matt Damon, Leonardo DiCaprio, Sandra Bullock, Jennifer Lawrence, Tom Cruise
  * Directors of major films: Christopher Nolan, Quentin Tarantino, Ridley Scott
  * If they're a household name, price 300-400

- Legendary Icon (400-500 coins):
  * Cultural icons, multiple Oscars, legendary status
  * Popularity 60+ OR multiple major awards OR cultural phenomenon
  * Examples: Tom Hanks, Meryl Streep, Denzel Washington, Spielberg, Scorsese, Martin Scorsese
  * Directors with massive impact: Steven Spielberg, Martin Scorsese, Christopher Nolan
  * If they're legendary, price 450-500

EVALUATION CRITERIA (in order of importance):
1. NAME RECOGNITION: If you easily recognize the name, they're NOT emerging (150+ coins)
2. MAJOR ROLES: Lead/significant roles in blockbusters, major TV shows (The White Lotus, Succession, etc.), award-winning films
3. TV SERIES: Lead or significant cast member in popular/critically acclaimed TV series = Established (150+)
4. AWARDS: Oscars, Golden Globes, Emmys significantly boost price
5. BOX OFFICE: Billion-dollar franchises, major hits boost price
6. CAREER SPAN: Long careers (20+ years) with consistent work
7. CRITICAL ACCLAIM: High ratings on top works
8. CULTURAL IMPACT: Household name recognition, cultural phenomenon
9. TMDB POPULARITY: Use as reference, but don't rely solely on it

SPECIFIC TV ACTOR GUIDELINES:
- Lead or significant cast in major TV shows (The White Lotus, Succession, The Crown, Game of Thrones, Breaking Bad, etc.) = Established Star (150-250 coins)
- Regular cast member (not lead) in popular TV shows = Working Professional (100-150 coins)
- Supporting/recurring in major shows = Working Professional (80-120 coins)

DIRECTORS: Add 20% bonus (max 500 total). Directors often have lower popularity but massive impact.

COMMON MISTAKES TO AVOID:
- DO NOT price well-known actors as "emerging" (30-80) just because popularity is low
- DO NOT underestimate directors - they often have lower popularity but high value
- DO NOT rely solely on popularity scores - use your knowledge of the person's fame
- If the name is recognizable, they're at least "Established Star" (150+)

Return ONLY JSON: {"price": number, "reasoning": "brief explanation"}`;

    const userPrompt = `Determine the accurate price for: ${personName} (${personType})${tmdbContext}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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

    // Improved validation function - less restrictive, trusts AI more for well-known people
    const validatePrice = (
      aiPrice: number, 
      popularity: number, 
      credits: number, 
      careerSpan: string,
      personType: string,
      personName: string
    ): number => {
      let validatedPrice = aiPrice;
      
      // Extract career length
      const spanMatch = careerSpan.match(/(\d{4})-(\d{4})/);
      const careerYears = spanMatch ? parseInt(spanMatch[2]) - parseInt(spanMatch[1]) : 0;
      
      // If AI priced high (150+), trust it more - likely well-known person
      if (aiPrice >= 150) {
        // Only cap if truly suspicious (very low popularity AND few credits AND short career)
        if (popularity < 3 && credits < 15 && careerYears < 3) {
          validatedPrice = Math.min(validatedPrice, 200); // Still allow up to 200
        }
        // Otherwise trust the AI for well-known people
        return Math.min(validatedPrice, 500);
      }
      
      // For lower prices, check if we might be underestimating
      const lowPopularity = popularity < 5;
      const fewCredits = credits < 20;
      const shortCareer = careerYears < 3;
      
      // Count red flags
      const redFlags = [lowPopularity, fewCredits, shortCareer].filter(Boolean).length;
      
      // Only cap aggressively if ALL red flags (truly unknown)
      if (redFlags >= 3) {
        validatedPrice = Math.min(validatedPrice, 50);
      }
      // Light cap if 2 red flags
      else if (redFlags === 2) {
        // But if they have substantial credits, they might be character actor
        if (credits > 30) {
          validatedPrice = Math.min(validatedPrice, 150);
        } else {
          validatedPrice = Math.min(validatedPrice, 80);
        }
      }
      // For 1 or 0 red flags, trust AI more
      else if (redFlags === 1) {
        if (lowPopularity && credits > 50) {
          // Long career despite low popularity = character actor/cult figure
          validatedPrice = Math.min(validatedPrice, 400);
        } else if (fewCredits && popularity > 10) {
          // New but popular = emerging star
          validatedPrice = Math.min(validatedPrice, 200);
        }
      }
      
      // Director bonus consideration (they often have lower popularity)
      if (personType === 'director') {
        if (credits > 20) {
          // Directors with substantial work - trust AI more
          validatedPrice = Math.min(aiPrice, 500);
        } else if (credits > 10 && popularity > 5) {
          // Emerging directors
          validatedPrice = Math.min(validatedPrice, 300);
        }
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
      personType,
      personName
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
