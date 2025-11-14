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

    // Fetch random actor or director from TMDB
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    const randomPage = Math.floor(Math.random() * 10) + 1;
    
    const tmdbUrl = pack.pack_type === 'actor' 
      ? `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_API_KEY}&page=${randomPage}`
      : `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_API_KEY}&page=${randomPage}`;

    const tmdbResponse = await fetch(tmdbUrl);
    const tmdbData = await tmdbResponse.json();
    
    if (!tmdbData.results || tmdbData.results.length === 0) {
      return new Response(JSON.stringify({ error: 'Failed to fetch person data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a random person from the results
    const randomIndex = Math.floor(Math.random() * tmdbData.results.length);
    const person = tmdbData.results[randomIndex];

    // Filter by known_for_department if director pack
    let selectedPerson = person;
    if (pack.pack_type === 'director') {
      const directors = tmdbData.results.filter(
        (p: any) => p.known_for_department === 'Directing'
      );
      if (directors.length > 0) {
        selectedPerson = directors[Math.floor(Math.random() * directors.length)];
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