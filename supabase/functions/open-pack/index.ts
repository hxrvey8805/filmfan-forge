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
    const { packId } = await req.json();
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

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the pack
    const { data: pack, error: packError } = await supabase
      .from('user_packs')
      .select('*')
      .eq('id', packId)
      .eq('user_id', user.id)
      .eq('is_opened', false)
      .single();

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: 'Pack not found or already opened' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create user stats
    let { data: userStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!userStats) {
      const { data: newStats, error: createError } = await supabase
        .from('user_stats')
        .insert({ user_id: user.id, coins: 100 })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating stats:', createError);
      } else {
        userStats = newStats;
      }
    }

    // Check if user has enough coins (free for first 3 packs, 50 coins after)
    const packCost = (userStats?.packs_opened || 0) >= 3 ? 50 : 0;
    if (packCost > 0 && (!userStats || userStats.coins < packCost)) {
      return new Response(JSON.stringify({ error: 'Not enough coins' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch random actor or director from TMDB with proper filtering and retries
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    
    let selectedPerson = null;
    let attempts = 0;
    const maxAttempts = 10;
    
    // Try multiple times to find a matching person
    while (!selectedPerson && attempts < maxAttempts) {
      attempts++;
      const randomPage = Math.floor(Math.random() * 50) + 1; // Increased range to 50 pages
      
      console.log(`Attempt ${attempts}: Fetching page ${randomPage} for ${pack.pack_type} pack`);
      
      const tmdbUrl = `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_API_KEY}&page=${randomPage}`;
      const tmdbResponse = await fetch(tmdbUrl);
      const tmdbData = await tmdbResponse.json();
      
      if (!tmdbData.results || tmdbData.results.length === 0) {
        console.log(`No results from TMDB on page ${randomPage}`);
        continue;
      }

      console.log(`Found ${tmdbData.results.length} people on page ${randomPage}`);

      // Filter strictly by pack type
      let filteredPeople;
      if (pack.pack_type === 'director') {
        filteredPeople = tmdbData.results.filter(
          (p: any) => p.known_for_department === 'Directing'
        );
        console.log(`Found ${filteredPeople.length} directors on this page`);
      } else {
        filteredPeople = tmdbData.results.filter(
          (p: any) => p.known_for_department === 'Acting'
        );
        console.log(`Found ${filteredPeople.length} actors on this page`);
      }

      if (filteredPeople.length > 0) {
        selectedPerson = filteredPeople[Math.floor(Math.random() * filteredPeople.length)];
        console.log(`Selected: ${selectedPerson.name} (${selectedPerson.known_for_department})`);
        break;
      }
    }

    // If still no person found after all attempts, return error with helpful message
    if (!selectedPerson) {
      console.error(`Failed to find ${pack.pack_type} after ${maxAttempts} attempts`);
      return new Response(JSON.stringify({ 
        error: `Unable to find a ${pack.pack_type} at this time. Please try again.` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduct coins if needed and update stats
    if (userStats) {
      const newCoins = packCost > 0 ? userStats.coins - packCost : userStats.coins;
      const { error: statsUpdateError } = await supabase
        .from('user_stats')
        .update({ 
          coins: newCoins,
          packs_opened: userStats.packs_opened + 1
        })
        .eq('user_id', user.id);

      if (statsUpdateError) {
        console.error('Error updating stats:', statsUpdateError);
      }
    }

    // Mark pack as opened
    const { error: updateError } = await supabase
      .from('user_packs')
      .update({ is_opened: true, opened_at: new Date().toISOString() })
      .eq('id', packId);

    if (updateError) {
      console.error('Error updating pack:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to mark pack as opened' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add to user's collection
    const { error: collectionError } = await supabase
      .from('user_collection')
      .insert({
        user_id: user.id,
        person_id: selectedPerson.id,
        person_name: selectedPerson.name,
        person_type: pack.pack_type,
        profile_path: selectedPerson.profile_path || '',
      });

    if (collectionError) {
      console.error('Error adding to collection:', collectionError);
      // Don't fail if it's a duplicate (unique constraint violation)
      if (collectionError.code !== '23505') {
        return new Response(JSON.stringify({ error: 'Failed to add to collection' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(
      JSON.stringify({
        person: {
          id: selectedPerson.id,
          name: selectedPerson.name,
          profile_path: selectedPerson.profile_path,
          known_for_department: selectedPerson.known_for_department,
        }
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