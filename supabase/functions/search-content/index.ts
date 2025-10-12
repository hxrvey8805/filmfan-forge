import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured');
    }

    console.log('Searching TMDB for:', query);

    // Search both movies and TV shows
    const [moviesResponse, tvResponse] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`)
    ]);

    if (!moviesResponse.ok || !tvResponse.ok) {
      throw new Error('TMDB API request failed');
    }

    const moviesData = await moviesResponse.json();
    const tvData = await tvResponse.json();

    // Format results
    const movies = moviesData.results.slice(0, 10).map((movie: any) => ({
      title: movie.title,
      type: 'movie',
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
      id: movie.id
    }));

    const tvShows = tvData.results.slice(0, 10).map((show: any) => ({
      title: show.name,
      type: 'tv',
      year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : null,
      id: show.id,
      seasons: show.number_of_seasons
    }));

    // Combine and sort by relevance (TMDB provides them sorted)
    const results = [...movies, ...tvShows].slice(0, 15);

    console.log(`Found ${results.length} results`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-content:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Search failed',
        results: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
