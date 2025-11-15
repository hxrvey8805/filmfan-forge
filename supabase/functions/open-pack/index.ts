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

    // Fetch user's existing collection to prevent duplicates
    const { data: existingCollection, error: collectionFetchError } = await supabase
      .from('user_collection')
      .select('person_id')
      .eq('user_id', user.id);

    if (collectionFetchError) {
      console.error('Error fetching existing collection:', collectionFetchError);
    }

    const ownedPersonIds = new Set((existingCollection || []).map((c: any) => c.person_id));
    console.log(`Owned cards: ${ownedPersonIds.size}`);

    // Rarity tiers with weighted odds
    const RARITY_TIERS = [
      { name: 'Legendary', min: 60, max: 1000, weight: 5 },
      { name: 'A-List', min: 40, max: 60, weight: 10 },
      { name: 'Established', min: 25, max: 40, weight: 20 },
      { name: 'Professional', min: 15, max: 25, weight: 30 },
      { name: 'Emerging', min: 5, max: 15, weight: 25 },
      { name: 'Minor', min: 0, max: 5, weight: 10 },
    ];

    const selectTier = () => {
      const roll = Math.random() * 100;
      let acc = 0;
      for (const t of RARITY_TIERS) {
        acc += t.weight;
        if (roll <= acc) return t;
      }
      return RARITY_TIERS[RARITY_TIERS.length - 1];
    };

    // Fetch from TMDB with rarity-based page selection and duplicate filtering
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    
    let selectedPerson: any = null;
    let attempts = 0;
    const maxAttempts = 20; // increased attempts with fallback logic

    while (!selectedPerson && attempts < maxAttempts) {
      attempts++;
      const tier = selectTier();
      
      // After 8 attempts, relax rarity constraints (accept any non-duplicate)
      const useStrictRarity = attempts <= 8;

      let targetPage: number;
      if (tier.min >= 40) {
        targetPage = Math.floor(Math.random() * 5) + 1; // pages 1-5
      } else if (tier.min >= 15) {
        targetPage = Math.floor(Math.random() * 15) + 5; // pages 5-20
      } else {
        targetPage = Math.floor(Math.random() * 30) + 20; // pages 20-50
      }

      console.log(`Attempt ${attempts}/${maxAttempts}: ${tier.name} on page ${targetPage} for ${pack.pack_type} (strict: ${useStrictRarity})`);

      if (pack.pack_type === 'director') {
        // Use popular movies to pick a director from credits (robust vs person/popular)
        const moviesUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&page=${targetPage}`;
        const moviesRes = await fetch(moviesUrl);
        const moviesData = await moviesRes.json();

        if (!moviesData.results || moviesData.results.length === 0) {
          console.log(`No movies from TMDB on page ${targetPage}`);
          continue;
        }

        const moviesToTry = moviesData.results.slice(0, 10);

        for (const m of moviesToTry) {
          const creditsRes = await fetch(`https://api.themoviedb.org/3/movie/${m.id}/credits?api_key=${TMDB_API_KEY}`);
          const credits = await creditsRes.json();
          const crew = credits?.crew ?? [];
          const directors = crew.filter((c: any) => (c.job === 'Director' || c.job === 'Co-Director' || c.department === 'Directing'));

          for (const d of directors) {
            const notOwned = !ownedPersonIds.has(d.id);
            if (!notOwned) continue;

            let popularity = d.popularity as number | undefined;
            let details: any | null = null;

            if (useStrictRarity && (typeof popularity !== 'number')) {
              const personRes = await fetch(`https://api.themoviedb.org/3/person/${d.id}?api_key=${TMDB_API_KEY}`);
              details = await personRes.json();
              popularity = details?.popularity;
            }

            if (useStrictRarity) {
              if (typeof popularity !== 'number' || popularity < tier.min || popularity >= tier.max) continue;
            }

            selectedPerson = {
              id: d.id,
              name: d.name,
              profile_path: d.profile_path ?? details?.profile_path ?? null,
              known_for_department: 'Directing',
              popularity: typeof popularity === 'number' ? popularity : (details?.popularity ?? 0),
            };
            console.log(`✓ Selected director from movie ${m.id}: ${selectedPerson.name} (pop ${selectedPerson.popularity ?? 'N/A'})`);
            break;
          }

          if (selectedPerson) break;
        }

        if (!selectedPerson) {
          console.log(`After filtering: 0 candidates (Directing, ${useStrictRarity ? tier.name : 'ANY'}, not owned)`);
          continue;
        }
      } else {
        // Actors — use person/popular
        const tmdbUrl = `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_API_KEY}&page=${targetPage}`;
        const tmdbResponse = await fetch(tmdbUrl);
        const tmdbData = await tmdbResponse.json();

        if (!tmdbData.results || tmdbData.results.length === 0) {
          console.log(`No results from TMDB on page ${targetPage}`);
          continue;
        }

        const dept = 'Acting';
        const candidates = tmdbData.results.filter((p: any) => {
          const inDept = p.known_for_department === dept;
          const notOwned = !ownedPersonIds.has(p.id);
          if (!inDept || !notOwned) return false;
          if (useStrictRarity) {
            const inTier = p.popularity >= tier.min && p.popularity < tier.max;
            return inTier;
          }
          return true;
        });

        console.log(`After filtering: ${candidates.length} candidates (${dept}, ${useStrictRarity ? tier.name : 'ANY'}, not owned)`);

        if (candidates.length > 0) {
          selectedPerson = candidates[Math.floor(Math.random() * candidates.length)];
          console.log(`✓ Selected: ${selectedPerson.name} (${selectedPerson.known_for_department}, pop ${selectedPerson.popularity?.toFixed?.(1) || 'N/A'})`);
        }
      }
    }

    if (!selectedPerson) {
      console.error(`Failed to find non-duplicate ${pack.pack_type} after ${maxAttempts} attempts`);
      return new Response(JSON.stringify({ 
        error: `No new ${pack.pack_type} available right now. Try again soon!` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update stats (no coin deduction - packs are already owned)
    if (userStats) {
      const { error: statsUpdateError } = await supabase
        .from('user_stats')
        .update({ 
          packs_opened: userStats.packs_opened + 1
        })
        .eq('user_id', user.id);

      if (statsUpdateError) {
        console.error('Error updating stats:', statsUpdateError);
      }
    }

    // Add to user's collection first, then mark pack as opened
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
      // If duplicate slipped through for any reason, return a soft error prompting retry without consuming pack
      if (collectionError.code === '23505') {
        return new Response(JSON.stringify({ error: 'Duplicate card prevented. Please try opening again.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to add to collection' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark pack as opened only after successful insert
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

    return new Response(
      JSON.stringify({
        person: {
          id: selectedPerson.id,
          name: selectedPerson.name,
          profile_path: selectedPerson.profile_path,
          known_for_department: selectedPerson.known_for_department,
          popularity: selectedPerson.popularity,
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