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
    const { cardId } = await req.json();
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

    // Get the card from collection
    const { data: card, error: cardError } = await supabase
      .from('user_collection')
      .select('*')
      .eq('id', cardId)
      .eq('user_id', user.id)
      .single();

    if (cardError || !card) {
      return new Response(JSON.stringify({ error: 'Card not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch person details from TMDB to calculate price based on fame and filmography
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    
    // Get person details
    const personUrl = `https://api.themoviedb.org/3/person/${card.person_id}?api_key=${TMDB_API_KEY}`;
    const personResponse = await fetch(personUrl);
    const personData = await personResponse.json();
    
    // Get combined credits to count filmography
    const creditsUrl = `https://api.themoviedb.org/3/person/${card.person_id}/combined_credits?api_key=${TMDB_API_KEY}`;
    const creditsResponse = await fetch(creditsUrl);
    const creditsData = await creditsResponse.json();

    // Calculate price based on multiple factors
    const basePrice = 10;
    
    // Factor 1: Popularity (0-100+, weighted heavily)
    const popularityScore = Math.floor((personData.popularity || 0) * 2);
    
    // Factor 2: Number of credits (filmography depth)
    const totalCredits = (creditsData.cast?.length || 0) + (creditsData.crew?.length || 0);
    const filmographyScore = Math.min(Math.floor(totalCredits / 2), 100); // Cap at 100
    
    // Factor 3: Has profile image (famous people have images)
    const imageBonus = personData.profile_path ? 20 : 0;
    
    // Factor 4: Bonus for directors (typically more valuable)
    const roleBonus = card.person_type === 'director' ? 30 : 0;
    
    // Calculate final price
    const price = basePrice + popularityScore + filmographyScore + imageBonus + roleBonus;
    
    console.log(`Pricing ${card.person_name}: base=${basePrice}, popularity=${popularityScore}, filmography=${filmographyScore}, image=${imageBonus}, role=${roleBonus}, total=${price}`);

    // Get or create user stats
    let { data: stats, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (statsError && statsError.code === 'PGRST116') {
      // Stats don't exist, create them
      const { data: newStats, error: createError } = await supabase
        .from('user_stats')
        .insert({ user_id: user.id, coins: 100 })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating stats:', createError);
        return new Response(JSON.stringify({ error: 'Failed to create stats' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      stats = newStats;
    } else if (statsError) {
      console.error('Error fetching stats:', statsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch stats' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update coins and increment cards_sold
    const { error: updateError } = await supabase
      .from('user_stats')
      .update({ 
        coins: stats.coins + price,
        cards_sold: stats.cards_sold + 1
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating stats:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update stats' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete the card from collection
    const { error: deleteError } = await supabase
      .from('user_collection')
      .delete()
      .eq('id', cardId);

    if (deleteError) {
      console.error('Error deleting card:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to delete card' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ 
        price,
        newBalance: stats.coins + price,
        message: `Sold ${card.person_name} for ${price} coins!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
